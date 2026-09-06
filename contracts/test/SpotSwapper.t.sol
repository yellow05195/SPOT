// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SpotBase} from "./SpotBase.t.sol";
import {SpotSwapper} from "../src/SpotSwapper.sol";
import {SpotVault} from "../src/SpotVault.sol";
import {DecimalMath} from "../src/libraries/DecimalMath.sol";
import {MockStockToken} from "./mocks/Mocks.sol";

/// @dev Routeur factice : contre de l'ETH, frappe `rate` tokens par ETH au demandeur. `shortfall`
///      simule un slippage.
contract MockRouter {
    uint256 public shortfallBps;

    function setShortfall(uint256 bps) external {
        shortfallBps = bps;
    }

    function swapExactEth(address token, uint256 ratePerEth) external payable {
        uint256 out = (msg.value * ratePerEth) / 1e18;
        out = out - (out * shortfallBps) / 10_000;
        MockStockToken(token).mint(msg.sender, out);
    }

    function fail() external payable {
        revert("route invalide");
    }
}

contract DecimalMathHarness {
    function to18(uint256 a, uint8 d) external pure returns (uint256) {
        return DecimalMath.normalizeTo18(a, d);
    }

    function from18(uint256 a, uint8 d) external pure returns (uint256) {
        return DecimalMath.denormalizeFrom18(a, d);
    }
}

contract SpotSwapperTest is SpotBase {
    SpotSwapper internal swapper;
    MockRouter internal router;
    address internal bot = makeAddr("keeper-bot");

    function setUp() public override {
        super.setUp();
        router = new MockRouter();
        swapper = new SpotSwapper(owner, registry, vault, address(router));
        vm.startPrank(owner);
        swapper.setKeeper(bot);
        vault.setKeeper(address(swapper)); // le swapper est le keeper du vault
        vm.stopPrank();
        vm.deal(address(swapper), 10 ether);
    }

    function _route(uint256 rate) internal view returns (bytes memory) {
        return abi.encodeCall(MockRouter.swapExactEth, (address(amzn), rate));
    }

    function test_swapAndDeposit_recordsActualAmounts() public {
        // 1 ETH → 10 AMZN, unités de 0,002 → 5000 unités : trop. On prend 0,1 ETH → 1 AMZN → 200 unités...
        // rate 10e18 : 0,04 ETH → 0,4 AMZN → 200 unités de 0,002
        vm.prank(bot);
        (uint256 received, uint256 units) = swapper.swapAndDeposit(AMZN, 0.04 ether, 0.39e18, 0.002e18, _route(10e18));
        assertEq(received, 0.4e18);
        assertEq(units, 200);
        assertEq(vault.inventoryLength(AMZN), 200);
        assertEq(vault.reserved(address(amzn)), 0.4e18);
        assertEq(amzn.balanceOf(address(swapper)), 0);
        assertEq(address(swapper).balance, 10 ether - 0.04 ether);
    }

    function test_swapAndDeposit_lastUnitCarriesRemainder() public {
        // 0,03 ETH × 10 = 0,3 AMZN ; unités de 0,07 → 4 pleines + reliquat 0,02
        vm.prank(bot);
        (, uint256 units) = swapper.swapAndDeposit(AMZN, 0.03 ether, 0, 0.07e18, _route(10e18));
        assertEq(units, 5);
        assertEq(vault.inventoryAt(AMZN, 4).amount, 0.02e18);
        assertEq(vault.inventoryTotal(AMZN), 0.3e18);
    }

    function test_swapAndDeposit_slippageReverts() public {
        router.setShortfall(200); // −2 %
        vm.prank(bot);
        vm.expectRevert(abi.encodeWithSelector(SpotSwapper.SlippageExceeded.selector, 0.392e18, 0.396e18));
        swapper.swapAndDeposit(AMZN, 0.04 ether, 0.396e18, 0.002e18, _route(10e18)); // tolérance 1 %
        // le keeper réessaie plus petit / avec un minOut recalculé
        vm.prank(bot);
        swapper.swapAndDeposit(AMZN, 0.04 ether, 0.392e18, 0.002e18, _route(10e18));
    }

    function test_swapAndDeposit_ethShareGuard() public {
        vm.prank(bot);
        vm.expectRevert(abi.encodeWithSelector(SpotSwapper.EthShareExceeded.selector, 8.1 ether, 8 ether));
        swapper.swapAndDeposit(AMZN, 8.1 ether, 0, 1e18, _route(10e18));
    }

    function test_swapAndDeposit_routerFailureBubbles() public {
        vm.prank(bot);
        vm.expectRevert();
        swapper.swapAndDeposit(AMZN, 0.01 ether, 0, 1e18, abi.encodeCall(MockRouter.fail, ()));
    }

    function test_swapAndDeposit_guards() public {
        vm.prank(alice);
        vm.expectRevert(SpotSwapper.NotKeeper.selector);
        swapper.swapAndDeposit(AMZN, 0.01 ether, 0, 1e18, _route(10e18));

        vm.prank(bot);
        vm.expectRevert(SpotSwapper.ZeroUnitSize.selector);
        swapper.swapAndDeposit(AMZN, 0.01 ether, 0, 0, _route(10e18));

        vm.prank(bot);
        vm.expectRevert(abi.encodeWithSelector(SpotSwapper.TooManyUnits.selector, 400));
        swapper.swapAndDeposit(AMZN, 0.04 ether, 0, 0.001e18, _route(10e18));

        vm.prank(bot);
        vm.expectRevert(SpotSwapper.NothingReceived.selector);
        swapper.swapAndDeposit(AMZN, 0.01 ether, 0, 1e18, _route(0));

        vm.prank(owner);
        registry.deactivate(AMZN);
        vm.prank(bot);
        vm.expectRevert(abi.encodeWithSelector(SpotSwapper.BrandInactive.selector, AMZN));
        swapper.swapAndDeposit(AMZN, 0.01 ether, 0, 1e18, _route(10e18));
    }

    function test_withdrawEth_onlyOwner() public {
        vm.prank(bot);
        vm.expectRevert();
        swapper.withdrawEth(payable(bot), 1 ether);
        vm.prank(owner);
        swapper.withdrawEth(payable(alice), 1 ether);
        assertEq(alice.balance, 1 ether);
    }

    // ───────────────────────────── décimales 6 / 8 / 18 ─────────────────────────────

    function test_normalizeTo18_on6_8_18() public {
        DecimalMathHarness h = new DecimalMathHarness();
        assertEq(h.to18(1_000_000, 6), 1e18); // 1 USDG
        assertEq(h.to18(100_000_000, 8), 1e18); // 1 CBBTC
        assertEq(h.to18(1e18, 18), 1e18); // 1 Stock Token
        assertEq(h.to18(123_456, 6), 123_456e12);
        assertEq(h.to18(1, 8), 1e10);
        assertEq(h.from18(1e18, 6), 1_000_000);
        assertEq(h.from18(1e18, 8), 100_000_000);
        assertEq(h.from18(1e18, 18), 1e18);
        assertEq(h.from18(1e12 - 1, 6), 0); // troncature
        assertEq(h.to18(5, 20), 0);
        assertEq(h.to18(500, 20), 5);
        vm.expectRevert(abi.encodeWithSelector(DecimalMath.DecimalsTooLarge.selector, uint8(40)));
        h.to18(1, 40);
    }

    function testFuzz_normalizeRoundTrip(uint128 amount, uint8 decimals) public {
        decimals = uint8(bound(decimals, 0, 18));
        DecimalMathHarness h = new DecimalMathHarness();
        assertEq(h.from18(h.to18(amount, decimals), decimals), amount);
    }
}
