// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {SpotRegistry} from "../../src/SpotRegistry.sol";
import {SpotVault} from "../../src/SpotVault.sol";
import {SpotSightings} from "../../src/SpotSightings.sol";
import {ISpotVault} from "../../src/interfaces/ISpotVault.sol";
import {MockStockToken, MockFeed} from "../mocks/Mocks.sol";

/// @dev Handler : toutes les actions possibles sur le vault, honnêtes et hostiles, avec des
///      variables fantômes pour les invariants 3, 4 et 5.
contract VaultHandler is Test {
    uint256 internal constant SIGNER_PK = 0xA11CE;
    uint256 internal constant ATTACKER_PK = 0xBAD;
    uint256 internal constant N_BRANDS = 4;

    SpotRegistry public registry;
    SpotVault public vault;
    SpotSightings public sightings;
    address public owner;
    address public keeper;
    address public guardian;

    MockStockToken[] public tokens;
    MockFeed[] public feeds;
    uint32[] public brandIds;

    // fantômes
    mapping(address => uint256) public ghostDeposited; // tokens entrés par depositUnits
    mapping(address => uint256) public ghostOut; // tokens sortis via claim payé ou retrait inactif
    mapping(uint64 => uint256) public nonceSuccesses;
    bool public ghostReplaySucceeded;
    bool public ghostForgerySucceeded;
    bool public ghostActiveWithdrawSucceeded;
    uint256 public ghostPaidClaims;
    uint256 public ghostSightingOnly;
    uint256 public ghostRevertedClaims;

    struct Stored {
        ISpotVault.Voucher v;
        bytes sig;
    }

    Stored[] internal _issued;
    uint64 internal _nextNonce = 1;
    uint256 internal _walletSeed;

    constructor(
        SpotRegistry r,
        SpotVault v,
        SpotSightings s,
        address owner_,
        address keeper_,
        address guardian_,
        MockStockToken[] memory tokens_,
        MockFeed[] memory feeds_,
        uint32[] memory brandIds_
    ) {
        registry = r;
        vault = v;
        sightings = s;
        owner = owner_;
        keeper = keeper_;
        guardian = guardian_;
        tokens = tokens_;
        feeds = feeds_;
        brandIds = brandIds_;
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    // ───────────────────────────── keeper ─────────────────────────────

    function deposit(uint256 brandSeed, uint8 count, uint128 amountSeed) external {
        uint256 i = brandSeed % N_BRANDS;
        count = uint8(bound(count, 1, 12));
        uint128 amount = uint128(bound(amountSeed, 1e12, 5e16));
        uint128[] memory amounts = new uint128[](count);
        for (uint256 k = 0; k < count; ++k) {
            amounts[k] = amount;
        }
        uint256 total = uint256(amount) * count;
        tokens[i].mint(keeper, total);
        vm.startPrank(keeper);
        tokens[i].approve(address(vault), total);
        try vault.depositUnits(brandIds[i], amounts) {
            ghostDeposited[address(tokens[i])] += total;
        } catch {}
        vm.stopPrank();
    }

    // ───────────────────────────── joueurs ─────────────────────────────

    function claimFresh(uint256 brandSeed, uint128 amountSeed, bool reuseWallet) external {
        uint256 i = brandSeed % N_BRANDS;
        address wallet = reuseWallet && _issued.length > 0
            ? _issued[brandSeed % _issued.length].v.wallet
            : address(uint160(uint256(keccak256(abi.encode("w", ++_walletSeed)))));
        uint128 amount = uint128(bound(amountSeed, 1e12, 1e17));
        ISpotVault.Voucher memory v = _voucher(wallet, brandIds[i], amount, address(tokens[i]));
        bytes memory sig = _sign(v, SIGNER_PK);
        _issued.push(Stored(v, sig));
        _submit(v, sig);
    }

    function replay(uint256 idx) external {
        if (_issued.length == 0) return;
        Stored memory s = _issued[idx % _issued.length];
        if (!vault.used(s.v.nonce)) return;
        try vault.claim(s.v, s.sig) {
            ghostReplaySucceeded = true;
        } catch {}
    }

    function forge(uint256 brandSeed, uint128 amountSeed) external {
        uint256 i = brandSeed % N_BRANDS;
        uint128 amount = uint128(bound(amountSeed, 1e12, 1e17));
        ISpotVault.Voucher memory v = _voucher(address(0xF0E), brandIds[i], amount, address(tokens[i]));
        try vault.claim(v, _sign(v, ATTACKER_PK)) {
            ghostForgerySucceeded = true;
        } catch {}
    }

    function claimIssuedEarlier(uint256 idx) external {
        // ré-exécute un voucher émis mais jamais consommé (ex. refusé par manque d'inventaire)
        if (_issued.length == 0) return;
        Stored memory s = _issued[idx % _issued.length];
        if (vault.used(s.v.nonce)) return;
        _submit(s.v, s.sig);
    }

    // ───────────────────────────── temps, prix, budget ─────────────────────────────

    function warp(uint256 seconds_) external {
        vm.warp(vm.getBlockTimestamp() + bound(seconds_, 1, 3 days));
    }

    function movePrice(uint256 brandSeed, uint256 priceSeed) external {
        uint256 i = brandSeed % N_BRANDS;
        feeds[i].set(int256(bound(priceSeed, 1e8, 2000e8)));
    }

    function refreshFeeds() external {
        for (uint256 i = 0; i < N_BRANDS; ++i) {
            feeds[i].set(feeds[i].answer());
        }
    }

    function moveMultiplier(uint256 brandSeed, uint256 mSeed) external {
        uint256 i = brandSeed % N_BRANDS;
        tokens[i].setMultiplier(bound(mSeed, 0.25e18, 4e18));
    }

    function setBudget(uint256 usd) external {
        vm.prank(owner);
        vault.setDailyBudget(bound(usd, 0, 500e8));
    }

    // ───────────────────────────── admin ─────────────────────────────

    function deactivateLast() external {
        uint32 id = brandIds[N_BRANDS - 1];
        if (!registry.isBrandActive(id)) return;
        vm.prank(owner);
        registry.deactivate(id);
    }

    function withdraw(uint256 brandSeed, uint8 maxUnits) external {
        uint256 i = brandSeed % N_BRANDS;
        bool active = registry.isBrandActive(brandIds[i]);
        uint256 before = tokens[i].balanceOf(owner);
        vm.prank(owner);
        try vault.withdrawInventory(brandIds[i], owner, maxUnits) {
            if (active) ghostActiveWithdrawSucceeded = true;
            ghostOut[address(tokens[i])] += tokens[i].balanceOf(owner) - before;
        } catch {}
    }

    function pause() external {
        vm.prank(guardian);
        try vault.pauseEntry() {} catch {}
    }

    function resume() external {
        vm.prank(owner);
        try vault.resumeEntry() {} catch {}
    }

    // ───────────────────────────── internes ─────────────────────────────

    function _submit(ISpotVault.Voucher memory v, bytes memory sig) internal {
        uint256 before = ERC20Like(v.token).balanceOf(v.wallet);
        try vault.claim(v, sig) returns (bool paid) {
            nonceSuccesses[v.nonce] += 1;
            if (paid) {
                ghostPaidClaims += 1;
                ghostOut[v.token] += ERC20Like(v.token).balanceOf(v.wallet) - before;
            } else {
                ghostSightingOnly += 1;
            }
        } catch {
            ghostRevertedClaims += 1;
        }
    }

    function _voucher(address wallet, uint32 brandId, uint128 amount, address token)
        internal
        returns (ISpotVault.Voucher memory)
    {
        uint64 nonce = _nextNonce++;
        return ISpotVault.Voucher({
            wallet: wallet,
            brandId: brandId,
            amount: amount,
            token: token,
            nonce: nonce,
            issuedAt: uint64(vm.getBlockTimestamp()),
            deadline: uint64(vm.getBlockTimestamp()) + 30 minutes,
            imageHash: keccak256(abi.encode("img", nonce)),
            cityCode: 69_000
        });
    }

    function _sign(ISpotVault.Voucher memory v, uint256 pk) internal view returns (bytes memory) {
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", vault.domainSeparator(), vault.hashVoucher(v)));
        (uint8 sv, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, sv);
    }
}

interface ERC20Like {
    function balanceOf(address) external view returns (uint256);
}

contract SpotVaultInvariants is StdInvariant, Test {
    uint256 internal constant BUDGET = 200e8;
    address internal owner = makeAddr("owner");
    address internal keeper = makeAddr("keeper");
    address internal guardian = makeAddr("guardian");

    SpotRegistry internal registry;
    SpotSightings internal sightings;
    SpotVault internal vault;
    VaultHandler internal handler;
    MockStockToken[] internal tokens;

    function setUp() public {
        vm.warp(1_788_625_306);
        registry = new SpotRegistry(owner);
        sightings = new SpotSightings(owner, "");
        vault = new SpotVault(owner, vm.addr(0xA11CE), registry, sightings, BUDGET, address(0));

        MockFeed[] memory feeds = new MockFeed[](4);
        MockStockToken[] memory toks = new MockStockToken[](4);
        uint32[] memory ids = new uint32[](4);
        int256[4] memory prices = [int256(230e8), 65e8, 400e8, 12e8];
        vm.startPrank(owner);
        registry.setKeeper(keeper);
        sightings.setVault(address(vault), true);
        vault.setKeeper(keeper);
        vault.setGuardian(guardian);
        for (uint256 i = 0; i < 4; ++i) {
            toks[i] = new MockStockToken("T", "T");
            feeds[i] = new MockFeed(8, prices[i]);
            ids[i] = registry.addBrand(
                string(abi.encodePacked("Marque ", i)), address(toks[i]), address(feeds[i]), 1
            );
            tokens.push(toks[i]);
        }
        vm.stopPrank();

        handler = new VaultHandler(registry, vault, sightings, owner, keeper, guardian, toks, feeds, ids);
        targetContract(address(handler));
    }

    /// Invariant 1 — pour chaque token : balanceOf(vault) >= somme des amounts en inventaire
    function invariant_1_balanceCoversInventory() public view {
        for (uint256 i = 0; i < tokens.length; ++i) {
            address t = address(tokens[i]);
            assertGe(tokens[i].balanceOf(address(vault)), vault.reserved(t), "balance < reserved");
            // et `reserved` est bien la somme des files (un token == une marque ici)
            assertEq(vault.reserved(t), vault.inventoryTotal(handler.brandIds(i)), "reserved != queue total");
        }
    }

    /// Invariant 2 — spentTodayUsd <= dailyBudgetUsd, toujours
    function invariant_2_spentWithinBudget() public view {
        assertLe(vault.spentTodayUsd(), vault.dailyBudgetUsd(), "spent > budget");
    }

    /// Invariant 3 — un nonce ne peut jamais être consommé deux fois
    function invariant_3_nonceNeverReused() public view {
        assertFalse(handler.ghostReplaySucceeded(), "replay succeeded");
    }

    /// Invariant 4 — aucun chemin ne transfère de tokens sans un voucher valide et non consommé
    ///                (ni contrefaçon, ni fuite : tout ce qui est sorti est un claim payé ou un
    ///                retrait d'inventaire d'une marque inactive)
    function invariant_4_noTransferWithoutVoucher() public view {
        assertFalse(handler.ghostForgerySucceeded(), "forgery succeeded");
        for (uint256 i = 0; i < tokens.length; ++i) {
            address t = address(tokens[i]);
            uint256 inVault = tokens[i].balanceOf(address(vault));
            assertEq(handler.ghostDeposited(t) - handler.ghostOut(t), inVault, "token leak");
        }
    }

    /// Invariant 5 — aucune fonction admin ne peut retirer de l'inventaire d'une marque active
    function invariant_5_noAdminWithdrawOfActiveBrand() public view {
        assertFalse(handler.ghostActiveWithdrawSucceeded(), "active brand withdrawn");
    }

    // ───────────────────────────── campagne déterministe ─────────────────────────────

    /// @dev Le fuzzer repart d'un instantané à chaque run : on ne peut pas y prouver la couverture
    ///      globale. Cette campagne déterministe (1 500 pas, graine fixe) exerce le handler, vérifie
    ///      les cinq invariants après CHAQUE pas, et prouve que les chemins intéressants ont bien été
    ///      atteints : claims payés, budget épuisé, reverts, marque retirée, pause.
    function test_deterministicCampaign_coversAllPaths() public {
        bytes32 seed = keccak256("SPOT");
        for (uint256 step = 0; step < 1500; ++step) {
            seed = keccak256(abi.encode(seed, step));
            uint256 a = uint256(seed);
            uint256 action = a % 100;
            if (action < 30) handler.claimFresh(a >> 8, uint128(a >> 40), (a >> 200) % 3 == 0);
            else if (action < 45) handler.deposit(a >> 8, uint8(a >> 40), uint128(a >> 48));
            else if (action < 55) handler.replay(a >> 8);
            else if (action < 60) handler.forge(a >> 8, uint128(a >> 40));
            else if (action < 68) handler.claimIssuedEarlier(a >> 8);
            else if (action < 76) handler.warp((a >> 8) % 12 hours);
            else if (action < 82) handler.movePrice(a >> 8, a >> 40);
            else if (action < 85) handler.moveMultiplier(a >> 8, a >> 40);
            else if (action < 90) handler.setBudget(a >> 8);
            else if (action < 93) handler.withdraw(a >> 8, uint8(a >> 40));
            else if (action < 95) handler.refreshFeeds();
            else if (action < 97) handler.pause();
            else if (action < 99) handler.resume();
            else handler.deactivateLast();

            invariant_1_balanceCoversInventory();
            invariant_2_spentWithinBudget();
            invariant_3_nonceNeverReused();
            invariant_4_noTransferWithoutVoucher();
            invariant_5_noAdminWithdrawOfActiveBrand();
        }

        uint256 paid = handler.ghostPaidClaims();
        uint256 only = handler.ghostSightingOnly();
        uint256 rev = handler.ghostRevertedClaims();
        console.log("claims payes      ", paid);
        console.log("fiches seules     ", only);
        console.log("claims revertes   ", rev);
        assertGt(paid, 50, "trop peu de claims payes");
        assertGt(only, 0, "le budget n'a jamais ete epuise");
        assertGt(rev, 0, "aucun claim n'a jamais reverte (inventaire vide, pause, oracle)");
        assertFalse(registry.isBrandActive(handler.brandIds(3)), "la marque 3 aurait du etre retiree");
        assertGt(handler.ghostOut(address(tokens[3])), 0, "retrait d'inventaire inactif jamais exerce");
    }
}
