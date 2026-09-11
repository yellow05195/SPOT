// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SpotBase} from "./SpotBase.t.sol";
import {SpotVault} from "../src/SpotVault.sol";
import {UNPRICED} from "../src/interfaces/ISpotRegistry.sol";
import {SpotSightings} from "../src/SpotSightings.sol";
import {ISpotVault} from "../src/interfaces/ISpotVault.sol";
import {UnitQueue} from "../src/libraries/UnitQueue.sol";
import {MockStockToken, MockFeed, ReentrantReceiver, IReenter} from "./mocks/Mocks.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract SpotVaultTest is SpotBase {
    function test_claim_unpricedBrand_isCardOnly() public {
        vm.prank(owner);
        uint32 id = registry.addBrandCardsOnly("Tesla", 3);
        (ISpotVault.Voucher memory v, bytes memory s) = _signed(alice, id, 0, UNPRICED);
        assertFalse(vault.claim(v, s));
        assertEq(sightings.balanceOf(alice, sightings.sightingId(alice, id, _day())), 1);
        assertEq(vault.spentTodayUsd(), 0);

        // même avec un montant, rien ne part : la fiche seulement
        (ISpotVault.Voucher memory v2, bytes memory s2) = _signed(bob, id, 1e18, UNPRICED);
        assertFalse(vault.claim(v2, s2));
        assertEq(sightings.balanceOf(bob, sightings.sightingId(bob, id, _day())), 1);
    }

    uint128 internal constant UNIT = 0.002e18; // ≈ 0,46 $ d'AMZN à 230 $
    uint128 internal constant FRAGMENT = 0.0021e18; // ≈ 0,483 $

    function setUp() public override {
        super.setUp();
        _stock(AMZN, amzn, UNIT, 50);
        _stock(KO, ko, 0.01e18, 50);
    }

    // ───────────────────────────── chemin nominal ─────────────────────────────

    function test_claim_paysFragmentAndMintsSighting() public {
        (ISpotVault.Voucher memory v, bytes memory sig) = _signed(alice, AMZN, FRAGMENT, address(amzn));
        uint256 expectedUsd = vault.usdValueOf(AMZN, FRAGMENT);
        assertEq(expectedUsd, 48_300_000); // 0,483 $

        vm.prank(relayer); // n'importe qui peut relayer : les tokens vont à v.wallet
        assertTrue(vault.claim(v, sig));

        assertEq(amzn.balanceOf(alice), FRAGMENT);
        assertEq(amzn.balanceOf(relayer), 0);
        assertEq(vault.spentTodayUsd(), expectedUsd);
        assertTrue(vault.used(v.nonce));
        assertEq(vault.inventoryTotal(AMZN), uint128(UNIT * 50) - FRAGMENT);
        assertEq(vault.reserved(address(amzn)), UNIT * 50 - FRAGMENT);
        // 0,0021 = une unité de 0,002 entière + 0,0001 sur la suivante
        assertEq(vault.inventoryLength(AMZN), 49);
        assertEq(vault.inventoryHead(AMZN).amount, UNIT - 0.0001e18);

        uint256 id = sightings.sightingId(alice, AMZN, _day());
        assertEq(sightings.balanceOf(alice, id), 1);
        assertEq(sightings.getSighting(id).imageHash, v.imageHash);
        assertEq(sightings.getSighting(id).cityCode, 69_000);
    }

    function test_claim_emitsClaimed() public {
        (ISpotVault.Voucher memory v, bytes memory sig) = _signed(alice, AMZN, FRAGMENT, address(amzn));
        vm.expectEmit(true, true, false, true);
        emit SpotVault.Claimed(
            alice,
            AMZN,
            address(amzn),
            FRAGMENT,
            48_300_000,
            v.nonce,
            sightings.sightingId(alice, AMZN, _day())
        );
        vault.claim(v, sig);
    }

    // ───────────────────────────── anti-rejeu, signature, deadline ─────────────────────────────

    function test_claim_replayReverts() public {
        (ISpotVault.Voucher memory v, bytes memory sig) = _signed(alice, AMZN, FRAGMENT, address(amzn));
        vault.claim(v, sig);
        vm.expectRevert(abi.encodeWithSelector(SpotVault.NonceUsed.selector, v.nonce));
        vault.claim(v, sig);
    }

    function test_claim_replayAfterSightingOnlyAlsoReverts() public {
        // le nonce est consommé même quand aucun fragment n'est versé
        (ISpotVault.Voucher memory v, bytes memory sig) = _signed(alice, AMZN, 1e18, address(amzn)); // 230 $ > 200 $
        assertFalse(vault.claim(v, sig));
        vm.expectRevert(abi.encodeWithSelector(SpotVault.NonceUsed.selector, v.nonce));
        vault.claim(v, sig);
    }

    function test_claim_wrongSignerReverts() public {
        ISpotVault.Voucher memory v = _voucher(alice, AMZN, FRAGMENT, address(amzn));
        bytes memory sig = _sign(v, ATTACKER_PK);
        vm.expectRevert(SpotVault.BadSignature.selector);
        vault.claim(v, sig);
    }

    function test_claim_tamperedFieldReverts() public {
        (ISpotVault.Voucher memory v, bytes memory sig) = _signed(alice, AMZN, FRAGMENT, address(amzn));
        v.amount = FRAGMENT * 10;
        vm.expectRevert(SpotVault.BadSignature.selector);
        vault.claim(v, sig);
    }

    function test_claim_voucherOfAnotherWalletPaysThatWallet() public {
        // « voucher d'un autre wallet » : bob exécute le voucher d'alice, alice reçoit
        (ISpotVault.Voucher memory v, bytes memory sig) = _signed(alice, AMZN, FRAGMENT, address(amzn));
        vm.prank(bob);
        vault.claim(v, sig);
        assertEq(amzn.balanceOf(alice), FRAGMENT);
        assertEq(amzn.balanceOf(bob), 0);
        // et bob ne peut pas rediriger vers lui sans invalider la signature
        (ISpotVault.Voucher memory v2, bytes memory sig2) = _signed(alice, AMZN, FRAGMENT, address(amzn));
        v2.wallet = bob;
        vm.prank(bob);
        vm.expectRevert(SpotVault.BadSignature.selector);
        vault.claim(v2, sig2);
    }

    function test_claim_expiredReverts_thenReissueWithNewNonceWorks() public {
        (ISpotVault.Voucher memory v, bytes memory sig) = _signed(alice, AMZN, FRAGMENT, address(amzn));
        vm.warp(v.deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(SpotVault.VoucherExpired.selector, v.deadline));
        vault.claim(v, sig);

        // réémission serveur : même prise (même image), NOUVEAU nonce, sans nouvelle photo
        ISpotVault.Voucher memory v2 = _voucher(alice, AMZN, FRAGMENT, address(amzn));
        v2.imageHash = v.imageHash;
        assertTrue(v2.nonce != v.nonce);
        assertTrue(vault.claim(v2, _sign(v2, SIGNER_PK)));
        assertFalse(vault.used(v.nonce)); // l'ancien n'a jamais été consommé
    }

    function test_claim_lifetimeBounded() public {
        ISpotVault.Voucher memory v = _voucher(alice, AMZN, FRAGMENT, address(amzn));
        v.deadline = v.issuedAt + 30 minutes + 1;
        bytes memory sig = _sign(v, SIGNER_PK);
        vm.expectRevert(abi.encodeWithSelector(SpotVault.VoucherLifetime.selector, v.issuedAt, v.deadline));
        vault.claim(v, sig);

        // deadline antérieure à issuedAt mais encore dans le futur : c'est la cohérence qui échoue
        v.issuedAt = uint64(vm.getBlockTimestamp()) + 60;
        v.deadline = uint64(vm.getBlockTimestamp()) + 30;
        sig = _sign(v, SIGNER_PK);
        vm.expectRevert(abi.encodeWithSelector(SpotVault.VoucherLifetime.selector, v.issuedAt, v.deadline));
        vault.claim(v, sig);
    }

    function test_claim_issuedInFutureBeyondSkewReverts() public {
        ISpotVault.Voucher memory v = _voucher(alice, AMZN, FRAGMENT, address(amzn));
        v.issuedAt = uint64(vm.getBlockTimestamp()) + 2 minutes + 1;
        v.deadline = v.issuedAt + 10 minutes;
        bytes memory sig = _sign(v, SIGNER_PK);
        vm.expectRevert(abi.encodeWithSelector(SpotVault.VoucherFromFuture.selector, v.issuedAt));
        vault.claim(v, sig);

        v.issuedAt = uint64(vm.getBlockTimestamp()) + 2 minutes; // dans la tolérance
        v.deadline = v.issuedAt + 10 minutes;
        assertTrue(vault.claim(v, _sign(v, SIGNER_PK)));
    }

    /// @dev Une marque dont les unités sont grosses (1 AMZN), pour les tests de budget.
    function _bigBrand() internal returns (uint32 id, MockStockToken t) {
        t = new MockStockToken("Gros Stock Token", "GROS");
        MockFeed f = new MockFeed(8, 230e8);
        vm.prank(owner);
        id = registry.addBrand("Gros", address(t), address(f), 9);
        _stock(id, t, 1e18, 3);
    }

    function test_claim_domainBoundToChainAndContract() public {
        // signé pour une autre chaîne
        ISpotVault.Voucher memory v = _voucher(alice, AMZN, FRAGMENT, address(amzn));
        vm.chainId(1);
        bytes memory sigOtherChain = _sign(v, SIGNER_PK);
        vm.chainId(31337);
        vm.expectRevert(SpotVault.BadSignature.selector);
        vault.claim(v, sigOtherChain);

        // signé pour un autre vault (même signer, même chaîne)
        SpotVault other = new SpotVault(owner, signer, registry, sightings, BUDGET, address(0));
        bytes32 otherDigest =
            keccak256(abi.encodePacked("\x19\x01", other.domainSeparator(), other.hashVoucher(v)));
        (uint8 sv, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, otherDigest);
        vm.expectRevert(SpotVault.BadSignature.selector);
        vault.claim(v, abi.encodePacked(r, s, sv));
    }

    function test_claim_tokenMismatchReverts() public {
        (ISpotVault.Voucher memory v, bytes memory sig) = _signed(alice, AMZN, FRAGMENT, address(ko));
        vm.expectRevert(abi.encodeWithSelector(SpotVault.TokenMismatch.selector, address(amzn), address(ko)));
        vault.claim(v, sig);
    }

    // ───────────────────────────── budget ─────────────────────────────

    function test_claim_budgetExhaustedMintsSightingWithoutFragment() public {
        // épuiser : 200 $ / 0,483 $ ≈ 414 prises ; on force plutôt avec un gros fragment
        (uint32 GROS, MockStockToken gros) = _bigBrand();
        (ISpotVault.Voucher memory v1, bytes memory s1) = _signed(alice, GROS, 0.8e18, address(gros)); // 184 $
        assertTrue(vault.claim(v1, s1));
        assertEq(vault.spentTodayUsd(), 184e8);

        (ISpotVault.Voucher memory v2, bytes memory s2) = _signed(bob, GROS, 0.1e18, address(gros)); // 23 $ → 207 > 200
        vm.expectEmit(true, true, false, true);
        emit SpotVault.SightingOnly(
            bob, GROS, v2.nonce, sightings.sightingId(bob, GROS, _day()), SpotVault.Reason.BudgetExhausted
        );
        assertFalse(vault.claim(v2, s2));

        assertEq(gros.balanceOf(bob), 0);
        assertEq(sightings.balanceOf(bob, sightings.sightingId(bob, GROS, _day())), 1); // la fiche, oui
        assertEq(vault.spentTodayUsd(), 184e8);
        assertTrue(vault.used(v2.nonce));

        // un petit fragment d'une autre marque passe encore : 0,483 $ → 184,48 $
        (ISpotVault.Voucher memory v3, bytes memory s3) = _signed(relayer, AMZN, FRAGMENT, address(amzn));
        assertTrue(vault.claim(v3, s3));
        assertLe(vault.spentTodayUsd(), vault.dailyBudgetUsd());
    }

    function test_claim_exactBudgetIsAllowed() public {
        (uint32 GROS, MockStockToken gros) = _bigBrand();
        // 200 $ exactement : 200/230 GROS
        uint128 amount = uint128((uint256(200e8) * 1e18) / 230e8);
        uint256 usd = vault.usdValueOf(GROS, amount);
        assertLe(usd, BUDGET);
        assertGt(vault.usdValueOf(GROS, amount + 1e12), BUDGET - 1); // à un poil de la limite
        (ISpotVault.Voucher memory v, bytes memory s) = _signed(alice, GROS, amount, address(gros));
        assertTrue(vault.claim(v, s));
        assertEq(vault.spentTodayUsd(), usd);
    }

    function test_dayRollover_resetsSpentAndAppliesNextBudget() public {
        (ISpotVault.Voucher memory v, bytes memory s) = _signed(alice, AMZN, FRAGMENT, address(amzn));
        vault.claim(v, s);
        assertGt(vault.spentTodayUsd(), 0);

        vm.prank(owner);
        vault.setDailyBudget(50e8);
        assertEq(vault.dailyBudgetUsd(), BUDGET); // pas aujourd'hui
        assertEq(vault.nextDailyBudgetUsd(), 50e8);

        (uint32 d0,,) = vault.budgetState();
        assertEq(d0, vault.currentDay());

        vm.warp(vm.getBlockTimestamp() + 1 days);
        (uint32 d1, uint256 b1, uint256 sp1) = vault.budgetState();
        assertEq(d1, d0 + 1);
        assertEq(b1, 50e8);
        assertEq(sp1, 0);

        vault.rollDay();
        assertEq(vault.currentDay(), d1);
        assertEq(vault.spentTodayUsd(), 0);
        assertEq(vault.dailyBudgetUsd(), 50e8);
    }

    function test_setDailyBudget_onlyOwner() public {
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, keeper));
        vault.setDailyBudget(1);
    }

    // ───────────────────────────── currentMultiplier ─────────────────────────────

    /// @dev Le bug le plus probable du projet (spec 1.2) : le multiplicateur doit être appliqué
    ///      partout où un prix est lu. Test dédié.
    function test_multiplier_appliedToUsdValue() public {
        assertEq(vault.usdValueOf(AMZN, 1e18), 230e8);
        amzn.setMultiplier(2e18); // ex. dividende en actions ×2
        assertEq(vault.usdValueOf(AMZN, 1e18), 460e8);
        amzn.setMultiplier(0.5e18); // ex. après split, une unité brute vaut la moitié
        assertEq(vault.usdValueOf(AMZN, 1e18), 115e8);
        amzn.setMultiplier(1.234567e18);
        assertEq(vault.usdValueOf(AMZN, 1e18), 28_395_041_000); // 230 × 1,234567 = 283,95041 $
    }

    function test_multiplier_drivesBudgetDecision() public {
        (uint32 GROS, MockStockToken gros) = _bigBrand();
        // à ×1,00 : 1 GROS = 230 $ > budget → fiche seule
        (ISpotVault.Voucher memory v1, bytes memory s1) = _signed(alice, GROS, 1e18, address(gros));
        assertFalse(vault.claim(v1, s1));
        // à ×0,50 : 1 GROS = 115 $ → payé, et le budget est débité de 115 $, pas 230 $
        gros.setMultiplier(0.5e18);
        (ISpotVault.Voucher memory v2, bytes memory s2) = _signed(bob, GROS, 1e18, address(gros));
        assertTrue(vault.claim(v2, s2));
        assertEq(vault.spentTodayUsd(), 115e8);
    }

    function test_multiplier_zeroReverts() public {
        amzn.setMultiplier(0);
        (ISpotVault.Voucher memory v, bytes memory s) = _signed(alice, AMZN, FRAGMENT, address(amzn));
        vm.expectRevert(SpotVault.InvalidMultiplier.selector);
        vault.claim(v, s);
    }

    function test_feedDecimals_normalizedTo8() public {
        MockStockToken t = new MockStockToken("T", "T");
        MockFeed f18 = new MockFeed(18, 230e18);
        MockFeed f6 = new MockFeed(6, 230e6);
        vm.startPrank(owner);
        uint32 b18 = registry.addBrand("Dix-huit", address(t), address(f18), 1);
        uint32 b6 = registry.addBrand("Six", address(t), address(f6), 1);
        vm.stopPrank();
        assertEq(vault.usdValueOf(b18, 1e18), 230e8);
        assertEq(vault.usdValueOf(b6, 1e18), 230e8);
        assertEq(vault.usdValueOf(b18, FRAGMENT), 48_300_000);
    }

    // ───────────────────────────── oracle gelé ─────────────────────────────

    function test_stalePrice_revertsWithoutConsumingNonce() public {
        amznFeed.setUpdatedAt(vm.getBlockTimestamp() - 48 hours);
        (ISpotVault.Voucher memory v, bytes memory s) = _signed(alice, AMZN, FRAGMENT, address(amzn));
        vm.expectRevert(SpotVault.StalePrice.selector);
        vault.claim(v, s);
        assertFalse(vault.used(v.nonce));

        // le feed revient : le MÊME voucher passe (tant qu'il n'est pas périmé)
        amznFeed.set(231e8);
        assertTrue(vault.claim(v, s));
    }

    function test_stalePrice_variants() public {
        (ISpotVault.Voucher memory v, bytes memory s) = _signed(alice, AMZN, FRAGMENT, address(amzn));
        amznFeed.setRounds(10, 9);
        vm.expectRevert(SpotVault.StalePrice.selector);
        vault.claim(v, s);
        amznFeed.setRounds(10, 10);
        amznFeed.set(0);
        vm.expectRevert(SpotVault.StalePrice.selector);
        vault.claim(v, s);
        amznFeed.set(230e8);
        amznFeed.setUpdatedAt(vm.getBlockTimestamp() + 1);
        vm.expectRevert(SpotVault.StalePrice.selector);
        vault.claim(v, s);
    }

    // ───────────────────────────── inventaire ─────────────────────────────

    function test_claim_noInventoryReverts_voucherStaysValid() public {
        MockStockToken t = new MockStockToken("Tesla Stock Token", "TSLA");
        MockFeed f = new MockFeed(8, 400e8);
        vm.prank(owner);
        uint32 TSLA = registry.addBrand("Tesla", address(t), address(f), 3);

        (ISpotVault.Voucher memory v, bytes memory s) = _signed(alice, TSLA, 0.001e18, address(t));
        vm.expectRevert(
            abi.encodeWithSelector(UnitQueue.InsufficientUnits.selector, uint128(0.001e18), uint128(0))
        );
        vault.claim(v, s);
        assertFalse(vault.used(v.nonce));

        // le keeper réapprovisionne, le même voucher passe
        _stock(TSLA, t, 0.001e18, 3);
        assertTrue(vault.claim(v, s));
    }

    function test_claim_tooFragmentedReverts() public {
        MockStockToken t = new MockStockToken("T", "T");
        MockFeed f = new MockFeed(8, 1e8);
        vm.prank(owner);
        uint32 B = registry.addBrand("Poussiere", address(t), address(f), 3);
        _stock(B, t, 1e12, 20); // 20 unités minuscules
        (ISpotVault.Voucher memory v, bytes memory s) = _signed(alice, B, 9e12, address(t));
        vm.expectRevert(abi.encodeWithSelector(UnitQueue.TooFragmented.selector, uint8(8)));
        vault.claim(v, s);
        (ISpotVault.Voucher memory v2, bytes memory s2) = _signed(alice, B, 8e12, address(t));
        assertTrue(vault.claim(v2, s2));
    }

    function test_depositUnits_onlyKeeper_activeBrand_boundedBatch() public {
        uint128[] memory a = _units(1, 1);
        vm.prank(alice);
        vm.expectRevert(SpotVault.NotKeeper.selector);
        vault.depositUnits(AMZN, a);

        vm.startPrank(keeper);
        vm.expectRevert(SpotVault.EmptyBatch.selector);
        vault.depositUnits(AMZN, new uint128[](0));
        vm.expectRevert(abi.encodeWithSelector(SpotVault.BatchTooLarge.selector, 201));
        vault.depositUnits(AMZN, new uint128[](201));
        vm.stopPrank();

        vm.prank(owner);
        registry.deactivate(KO);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(SpotVault.BrandInactive.selector, KO));
        vault.depositUnits(KO, a);
    }

    function test_depositUnits_recordsActualAmountsAndPullsTokens() public {
        uint128[] memory a = new uint128[](3);
        a[0] = 1e15;
        a[1] = 2e15;
        a[2] = 3e15;
        amzn.mint(keeper, 6e15);
        uint256 before = amzn.balanceOf(address(vault));
        vm.startPrank(keeper);
        amzn.approve(address(vault), 6e15);
        vault.depositUnits(AMZN, a);
        vm.stopPrank();
        assertEq(amzn.balanceOf(address(vault)) - before, 6e15);
        assertEq(vault.inventoryAt(AMZN, 50).amount, 1e15);
        assertEq(vault.inventoryAt(AMZN, 52).amount, 3e15);
        assertEq(vault.inventoryAt(AMZN, 52).boughtAt, uint32(vm.getBlockTimestamp()));
    }

    // ───────────────────────────── marque retirée ─────────────────────────────

    function test_claim_inactiveBrandMintsSightingOnly() public {
        (ISpotVault.Voucher memory v, bytes memory s) = _signed(alice, AMZN, FRAGMENT, address(amzn));
        vm.prank(owner);
        registry.deactivate(AMZN); // retirée alors que le voucher est en vol
        vm.expectEmit(true, true, false, true);
        emit SpotVault.SightingOnly(
            alice, AMZN, v.nonce, sightings.sightingId(alice, AMZN, _day()), SpotVault.Reason.BrandInactive
        );
        assertFalse(vault.claim(v, s));
        assertEq(amzn.balanceOf(alice), 0);
        assertEq(sightings.balanceOf(alice, sightings.sightingId(alice, AMZN, _day())), 1);
        assertEq(vault.spentTodayUsd(), 0);
    }

    function test_claim_zeroAmountMintsSightingOnly() public {
        // score de risque > 85 : le serveur signe un montant nul, la fiche est frappée, rien n'est versé
        (ISpotVault.Voucher memory v, bytes memory s) = _signed(alice, AMZN, 0, address(amzn));
        vm.expectEmit(true, true, false, true);
        emit SpotVault.SightingOnly(
            alice, AMZN, v.nonce, sightings.sightingId(alice, AMZN, _day()), SpotVault.Reason.NoFragment
        );
        assertFalse(vault.claim(v, s));
        assertEq(amzn.balanceOf(alice), 0);
        assertEq(sightings.balanceOf(alice, sightings.sightingId(alice, AMZN, _day())), 1);
        assertEq(vault.spentTodayUsd(), 0);
        assertTrue(vault.used(v.nonce));
    }

    function test_withdrawInventory_onlyInactiveBrand() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SpotVault.BrandStillActive.selector, AMZN));
        vault.withdrawInventory(AMZN, owner, 10);

        vm.prank(owner);
        registry.deactivate(AMZN);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.withdrawInventory(AMZN, alice, 10);

        vm.startPrank(owner);
        vault.withdrawInventory(AMZN, owner, 10);
        assertEq(amzn.balanceOf(owner), UNIT * 10);
        assertEq(vault.inventoryLength(AMZN), 40);
        assertEq(vault.reserved(address(amzn)), UNIT * 40);
        vault.withdrawInventory(AMZN, owner, 255);
        assertEq(vault.inventoryLength(AMZN), 0);
        assertEq(vault.reserved(address(amzn)), 0);
        vm.expectRevert(SpotVault.EmptyBatch.selector);
        vault.withdrawInventory(AMZN, owner, 10);
        vm.stopPrank();
    }

    // ───────────────────────────── pause asymétrique ─────────────────────────────

    function test_pause_blocksVouchersIssuedAfter_allowsBefore() public {
        (ISpotVault.Voucher memory before, bytes memory sBefore) =
            _signed(alice, AMZN, FRAGMENT, address(amzn));

        vm.warp(vm.getBlockTimestamp() + 5 minutes);
        vm.prank(guardian);
        vault.pauseEntry();
        uint64 pausedAt = vault.entryPausedAt();
        assertEq(pausedAt, uint64(vm.getBlockTimestamp()));

        // émis après la pause : refusé
        (ISpotVault.Voucher memory after_, bytes memory sAfter) = _signed(bob, AMZN, FRAGMENT, address(amzn));
        vm.expectRevert(abi.encodeWithSelector(SpotVault.EntryIsPaused.selector, pausedAt, after_.issuedAt));
        vault.claim(after_, sAfter);

        // émis avant : le guardian ne peut PAS l'empêcher
        assertTrue(vault.claim(before, sBefore));

        // un voucher antidaté par une clé compromise expire mécaniquement au bout de 30 min
        vm.warp(pausedAt + 31 minutes);
        ISpotVault.Voucher memory backdated = _voucher(bob, AMZN, FRAGMENT, address(amzn));
        backdated.issuedAt = pausedAt - 1;
        backdated.deadline = backdated.issuedAt + 30 minutes;
        bytes memory sBackdated = _sign(backdated, SIGNER_PK);
        vm.expectRevert(abi.encodeWithSelector(SpotVault.VoucherExpired.selector, backdated.deadline));
        vault.claim(backdated, sBackdated);

        // reprise par l'owner seulement
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        vault.resumeEntry();
        vm.prank(owner);
        vault.resumeEntry();
        assertEq(vault.entryPausedAt(), 0);
        (ISpotVault.Voucher memory v3, bytes memory s3) = _signed(bob, AMZN, FRAGMENT, address(amzn));
        assertTrue(vault.claim(v3, s3));
    }

    function test_pause_roles() public {
        vm.prank(owner);
        vm.expectRevert(SpotVault.NotGuardian.selector);
        vault.pauseEntry();
        vm.prank(owner);
        vm.expectRevert(SpotVault.NotPaused.selector);
        vault.resumeEntry();
        vm.startPrank(guardian);
        vault.pauseEntry();
        vm.expectRevert(SpotVault.AlreadyPaused.selector);
        vault.pauseEntry();
        vm.stopPrank();
    }

    // ───────────────────────────── serveur hors ligne 24 h ─────────────────────────────

    function test_serverOffline24h_vouchersSignedBeforeStillExecuteUntilDeadline() public {
        // scénario 9.2 : les vouchers déjà signés passent tant que leur deadline tient ; au-delà,
        // le serveur réémet sans photo (test_claim_expiredReverts_thenReissueWithNewNonceWorks)
        (ISpotVault.Voucher memory v, bytes memory s) = _signed(alice, AMZN, FRAGMENT, address(amzn));
        vm.warp(vm.getBlockTimestamp() + 29 minutes);
        assertTrue(vault.claim(v, s));
    }

    // ───────────────────────────── réentrance ─────────────────────────────

    function test_claim_reentrancyBlocked() public {
        ReentrantReceiver r = new ReentrantReceiver();
        (ISpotVault.Voucher memory v, bytes memory s) = _signed(address(r), AMZN, FRAGMENT, address(amzn));
        Reenterer re = new Reenterer(vault, v, s);
        r.arm(IReenter(address(re)));
        assertTrue(vault.claim(v, s));
        assertTrue(r.attempted());
        assertFalse(r.succeeded());
        assertEq(amzn.balanceOf(address(r)), FRAGMENT); // payé une seule fois
    }

    // ───────────────────────────── migration ─────────────────────────────

    function test_migrate_movesInventoryToSuccessorOnce() public {
        SpotVault v2 = new SpotVault(owner, vm.addr(0xB0B), registry, sightings, BUDGET, address(vault));
        vm.startPrank(owner);
        vm.expectRevert(SpotVault.MigrationTargetNotContract.selector);
        vault.migrate(alice);
        vault.migrate(address(v2));
        vm.expectRevert(SpotVault.AlreadyMigrating.selector);
        vault.migrate(address(v2));

        vault.migrateBrand(AMZN, 30);
        assertEq(vault.inventoryLength(AMZN), 20);
        assertEq(v2.inventoryLength(AMZN), 30);
        assertEq(v2.reserved(address(amzn)), UNIT * 30);
        assertEq(amzn.balanceOf(address(v2)), UNIT * 30);
        vault.migrateBrand(AMZN, 255);
        assertEq(vault.inventoryLength(AMZN), 0);
        assertEq(vault.reserved(address(amzn)), 0);
        assertEq(v2.inventoryLength(AMZN), 50);
        vm.expectRevert(SpotVault.EmptyBatch.selector);
        vault.migrateBrand(AMZN, 1);
        vm.stopPrank();

        // les claims restent possibles sur l'ancien vault pendant la migration (KO non migré)
        (ISpotVault.Voucher memory v, bytes memory s) = _signed(alice, KO, 0.01e18, address(ko));
        assertTrue(vault.claim(v, s));
    }

    function test_receiveMigration_onlySource() public {
        SpotVault v2 = new SpotVault(owner, signer, registry, sightings, BUDGET, address(vault));
        vm.prank(owner);
        vm.expectRevert(SpotVault.NotMigrationSource.selector);
        v2.receiveMigration(AMZN, _units(1, 1));
        // la source ne peut pas déclarer plus que ce qu'elle a envoyé
        vm.prank(address(vault));
        vm.expectRevert(abi.encodeWithSelector(SpotVault.MigrationShortfall.selector, address(amzn), 1, 0));
        v2.receiveMigration(AMZN, _units(1, 1));
    }

    function test_migrateBrand_requiresMigration() public {
        vm.prank(owner);
        vm.expectRevert(SpotVault.NotMigrating.selector);
        vault.migrateBrand(AMZN, 1);
    }

    // ───────────────────────────── 1 000 claims dans le même bloc ─────────────────────────────

    function test_thousandClaimsSameBlock() public {
        MockStockToken t = new MockStockToken("T", "T");
        MockFeed f = new MockFeed(8, 1e8); // 1 $
        vm.prank(owner);
        uint32 B = registry.addBrand("Mille", address(t), address(f), 3);
        _stock(B, t, 1e16, 200); // 200 unités de 0,01 $... total 2 $ → 1000 claims de 0,001 $
        uint256 paidCount;
        for (uint256 i = 0; i < 1000; ++i) {
            address w = address(uint160(0x1000 + i));
            (ISpotVault.Voucher memory v, bytes memory s) = _signed(w, B, 1e15, address(t));
            if (vault.claim(v, s)) paidCount += 1;
        }
        assertEq(paidCount, 1000);
        assertEq(vault.spentTodayUsd(), 1000 * 1e5);
        assertEq(vault.reserved(address(t)), 2e18 - 1000 * 1e15);
        assertLe(vault.spentTodayUsd(), vault.dailyBudgetUsd());
    }

    // ───────────────────────────── constructeur ─────────────────────────────

    function test_constructor_rejectsZero() public {
        vm.expectRevert(SpotVault.ZeroAddress.selector);
        new SpotVault(owner, address(0), registry, sightings, BUDGET, address(0));
    }
}

/// @dev Rappelle `claim` pendant le mint de la fiche : doit échouer sur ReentrancyGuard.
contract Reenterer is IReenter {
    SpotVault internal vault;
    ISpotVault.Voucher internal v;
    bytes internal sig;

    constructor(SpotVault vault_, ISpotVault.Voucher memory v_, bytes memory sig_) {
        vault = vault_;
        v = v_;
        sig = sig_;
    }

    function reenter() external {
        vault.claim(v, sig);
    }
}
