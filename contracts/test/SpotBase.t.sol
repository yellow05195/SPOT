// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {SpotRegistry} from "../src/SpotRegistry.sol";
import {SpotVault} from "../src/SpotVault.sol";
import {SpotSightings} from "../src/SpotSightings.sol";
import {SpotPlates} from "../src/SpotPlates.sol";
import {ISpotVault} from "../src/interfaces/ISpotVault.sol";
import {MockERC20, MockStockToken, MockFeed} from "./mocks/Mocks.sol";

/// @dev Socle commun : déploiement câblé, deux marques, helpers de signature EIP-712.
abstract contract SpotBase is Test {
    uint256 internal constant SIGNER_PK = 0xA11CE;
    uint256 internal constant ATTACKER_PK = 0xBAD;
    uint256 internal constant BUDGET = 200e8; // 200,00 $ / jour
    uint64 internal constant START = 1_788_625_306; // 2026-09-05T16:21:46Z

    address internal signer = vm.addr(SIGNER_PK);
    address internal owner = makeAddr("owner");
    address internal keeper = makeAddr("keeper");
    address internal guardian = makeAddr("guardian");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal relayer = makeAddr("relayer");

    SpotRegistry internal registry;
    SpotSightings internal sightings;
    SpotVault internal vault;
    SpotPlates internal plates;
    MockERC20 internal usdg;

    MockStockToken internal amzn;
    MockStockToken internal ko;
    MockFeed internal amznFeed;
    MockFeed internal koFeed;
    uint32 internal AMZN;
    uint32 internal KO;

    uint64 internal nonceCounter;

    function setUp() public virtual {
        vm.warp(START);

        registry = new SpotRegistry(owner);
        sightings = new SpotSightings(owner, "https://spot.example/fiche/{id}");
        vault = new SpotVault(owner, signer, registry, sightings, BUDGET, address(0));
        usdg = new MockERC20("USDG", "USDG", 6);
        plates = new SpotPlates(owner, registry, sightings, usdg, "https://spot.example/planche/");

        vm.startPrank(owner);
        registry.setKeeper(keeper);
        registry.setPlates(address(plates));
        sightings.setVault(address(vault), true);
        sightings.setPlates(address(plates));
        vault.setKeeper(keeper);
        vault.setGuardian(guardian);
        vm.stopPrank();

        amzn = new MockStockToken("Amazon Stock Token", "AMZN");
        ko = new MockStockToken("Coca-Cola Stock Token", "KO");
        amznFeed = new MockFeed(8, 230e8);
        koFeed = new MockFeed(8, 65e8);

        vm.startPrank(owner);
        AMZN = registry.addBrand("Amazon", address(amzn), address(amznFeed), 1);
        KO = registry.addBrand("Coca-Cola", address(ko), address(koFeed), 2);
        vm.stopPrank();
    }

    // ───────────────────────────── helpers ─────────────────────────────

    function _units(uint128 amount, uint256 n) internal pure returns (uint128[] memory a) {
        a = new uint128[](n);
        for (uint256 i = 0; i < n; ++i) {
            a[i] = amount;
        }
    }

    function _stock(uint32 brandId, MockStockToken token, uint128 unit, uint256 n) internal {
        uint128[] memory amounts = _units(unit, n);
        token.mint(keeper, uint256(unit) * n);
        vm.startPrank(keeper);
        token.approve(address(vault), uint256(unit) * n);
        vault.depositUnits(brandId, amounts);
        vm.stopPrank();
    }

    function _voucher(address wallet, uint32 brandId, uint128 amount, address token)
        internal
        returns (ISpotVault.Voucher memory v)
    {
        nonceCounter += 1;
        v = ISpotVault.Voucher({
            wallet: wallet,
            brandId: brandId,
            amount: amount,
            token: token,
            nonce: nonceCounter,
            issuedAt: uint64(vm.getBlockTimestamp()),
            deadline: uint64(vm.getBlockTimestamp()) + 30 minutes,
            imageHash: keccak256(abi.encode("image", nonceCounter)),
            cityCode: 69_000 // Lyon, FR — un code de ville, jamais des coordonnées
        });
    }

    function _digest(ISpotVault.Voucher memory v) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", vault.domainSeparator(), vault.hashVoucher(v)));
    }

    function _sign(ISpotVault.Voucher memory v, uint256 pk) internal view returns (bytes memory) {
        (uint8 sv, bytes32 r, bytes32 s) = vm.sign(pk, _digest(v));
        return abi.encodePacked(r, s, sv);
    }

    function _signed(address wallet, uint32 brandId, uint128 amount, address token)
        internal
        returns (ISpotVault.Voucher memory v, bytes memory sig)
    {
        v = _voucher(wallet, brandId, amount, token);
        sig = _sign(v, SIGNER_PK);
    }

    function _day() internal view returns (uint32) {
        return uint32(vm.getBlockTimestamp() / 1 days);
    }
}
