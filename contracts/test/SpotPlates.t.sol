// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SpotBase} from "./SpotBase.t.sol";
import {SpotRegistry} from "../src/SpotRegistry.sol";
import {SpotSightings} from "../src/SpotSightings.sol";
import {SpotPlates} from "../src/SpotPlates.sol";
import {ISpotVault} from "../src/interfaces/ISpotVault.sol";
import {MockERC20, MockStockToken, MockFeed} from "./mocks/Mocks.sol";

contract SpotPlatesTest is SpotBase {
    uint32[] internal ids;
    MockStockToken[] internal tokens;
    uint32 internal plateId;

    function setUp() public override {
        super.setUp();
        ids.push(AMZN);
        ids.push(KO);
        tokens.push(amzn);
        tokens.push(ko);
        vm.startPrank(owner);
        for (uint256 i = 2; i < 7; ++i) {
            MockStockToken t = new MockStockToken("T", "T");
            tokens.push(t);
            ids.push(
                registry.addBrand(string(abi.encodePacked("Marque ", i)), address(t), address(amznFeed), 1)
            );
        }
        plateId = registry.createPlate("Logistique", ids, uint32(vm.getBlockTimestamp()));
        vm.stopPrank();
        for (uint256 i = 0; i < 7; ++i) {
            _stock(ids[i], tokens[i], 0.001e18, 20);
        }
        usdg.mint(address(plates), 1_000e6); // réserve de primes : 1 000 $
    }

    /// @dev Obtient les 7 fiches pour `who` via de vrais claims, en changeant de jour pour rester
    ///      dans le quota d'une fiche par marque et par jour.
    function _collect(address who) internal returns (uint256[7] memory s) {
        for (uint256 i = 0; i < 7; ++i) {
            (ISpotVault.Voucher memory v, bytes memory sig) =
                _signed(who, ids[i], 0.001e18, address(tokens[i]));
            vault.claim(v, sig);
            s[i] = sightings.sightingId(who, ids[i], _day());
        }
    }

    function test_seal_burnsSevenMintsPlatePaysBonus() public {
        uint256[7] memory s = _collect(alice);
        vm.prank(alice);
        uint256 tokenId = plates.seal(plateId, s);
        assertEq(plates.ownerOf(tokenId), alice);
        assertEq(plates.plateOf(tokenId), plateId);
        for (uint256 i = 0; i < 7; ++i) {
            assertEq(sightings.balanceOf(alice, s[i]), 0);
            assertEq(sightings.getSighting(s[i]).wallet, alice); // l'histoire reste
        }
        assertEq(usdg.balanceOf(alice), 300e6); // première de la série : 300 $
        assertEq(registry.getPlate(plateId).platesSealed, 1);
        assertEq(plates.tokenURI(tokenId), "https://spot.example/planche/1");
    }

    function test_seal_bonusIsDegressive() public {
        assertEq(plates.bonusFor(0), 300e8);
        assertEq(plates.bonusFor(1), 150e8);
        assertEq(plates.bonusFor(2), 100e8);
        assertEq(plates.bonusFor(59), 5e8);
        assertEq(plates.bonusFor(60), 5e8); // plancher
        assertEq(plates.bonusFor(10_000), 5e8);

        _collect(alice);
        uint256[7] memory sa;
        uint256[7] memory sb;
        vm.warp(vm.getBlockTimestamp() + 1 days);
        sa = _collect(alice);
        sb = _collect(bob);
        vm.prank(alice);
        plates.seal(plateId, sa);
        vm.prank(bob);
        plates.seal(plateId, sb);
        assertEq(usdg.balanceOf(alice), 300e6);
        assertEq(usdg.balanceOf(bob), 150e6);
    }

    function test_seal_paysWhatReserveHas() public {
        uint256[7] memory s = _collect(alice);
        // vider la réserve à 20 $
        vm.prank(address(plates));
        usdg.transfer(owner, 980e6);
        vm.prank(alice);
        plates.seal(plateId, s);
        assertEq(usdg.balanceOf(alice), 20e6);
        assertEq(plates.reserveBalance(), 0);
    }

    function test_seal_rejectsWrongBrandOrder() public {
        uint256[7] memory s = _collect(alice);
        (s[0], s[1]) = (s[1], s[0]);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SpotPlates.BrandMismatch.selector, 0, ids[0], ids[1]));
        plates.seal(plateId, s);
    }

    function test_seal_rejectsSightingsNotOwned() public {
        uint256[7] memory s = _collect(alice);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(SpotPlates.NotSightingOwner.selector, s[0]));
        plates.seal(plateId, s);
    }

    function test_seal_transferredSightingCounts() public {
        // la boucle sociale : une fiche s'échange, le receveur peut sceller avec
        uint256[7] memory s = _collect(alice);
        vm.prank(alice);
        sightings.safeTransferFrom(alice, bob, s[0], 1, "");
        uint256[7] memory sb = _collect(bob);
        sb[0] = s[0];
        vm.prank(bob);
        plates.seal(plateId, sb);
        assertEq(plates.ownerOf(1), bob);
    }

    function test_seal_closedOrNotOpenPlateReverts() public {
        uint256[7] memory s = _collect(alice);
        vm.prank(owner);
        registry.closePlate(plateId);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.PlateNotOpen.selector, plateId));
        plates.seal(plateId, s);
        // rien n'a été brûlé
        assertEq(sightings.balanceOf(alice, s[0]), 1);
    }

    function test_seal_cannotReuseBurnedSightings() public {
        uint256[7] memory s = _collect(alice);
        vm.startPrank(alice);
        plates.seal(plateId, s);
        vm.expectRevert(abi.encodeWithSelector(SpotPlates.NotSightingOwner.selector, s[0]));
        plates.seal(plateId, s);
        vm.stopPrank();
    }

    function test_bonusDecimals_6_8_18() public {
        // spec 5.5 : normalisation des décimales testée sur 6 / 8 / 18
        MockERC20 six = new MockERC20("USDG", "USDG", 6);
        MockERC20 eight = new MockERC20("CBBTC", "CBBTC", 8);
        MockERC20 eighteen = new MockERC20("WETH", "WETH", 18);
        SpotPlates p6 = new SpotPlates(owner, registry, sightings, six, "");
        SpotPlates p8 = new SpotPlates(owner, registry, sightings, eight, "");
        SpotPlates p18 = new SpotPlates(owner, registry, sightings, eighteen, "");
        assertEq(p6.toBonusTokens(300e8), 300e6);
        assertEq(p8.toBonusTokens(300e8), 300e8);
        assertEq(p18.toBonusTokens(300e8), 300e18);
        assertEq(p6.toBonusTokens(5e8), 5e6);
        assertEq(p6.toBonusTokens(123_456_789), 1_234_567); // troncature, jamais d'arrondi vers le haut
    }

    // ───────────────────────────── fiches ─────────────────────────────

    function test_sightings_onlyVaultMints_onlyPlatesBurns() public {
        vm.prank(alice);
        vm.expectRevert(SpotSightings.NotVault.selector);
        sightings.mintSighting(alice, AMZN, bytes32(0), 0);
        vm.prank(alice);
        vm.expectRevert(SpotSightings.NotPlates.selector);
        sightings.burnForPlate(alice, 1);
        vm.prank(address(plates));
        vm.expectRevert(abi.encodeWithSelector(SpotSightings.UnknownSighting.selector, 1));
        sightings.burnForPlate(alice, 1);
    }

    function test_sightings_onePerWalletBrandDay() public {
        (ISpotVault.Voucher memory v, bytes memory s) = _signed(alice, AMZN, 0.001e18, address(amzn));
        vault.claim(v, s);
        (ISpotVault.Voucher memory v2, bytes memory s2) = _signed(alice, AMZN, 0.001e18, address(amzn));
        uint256 id = sightings.sightingId(alice, AMZN, _day());
        vm.expectRevert(abi.encodeWithSelector(SpotSightings.AlreadySighted.selector, id));
        vault.claim(v2, s2);
        // le lendemain, oui
        vm.warp(vm.getBlockTimestamp() + 1 days);
        (ISpotVault.Voucher memory v3, bytes memory s3) = _signed(alice, AMZN, 0.001e18, address(amzn));
        vault.claim(v3, s3);
        assertNotEq(sightings.sightingId(alice, AMZN, _day()), id);
    }

    function test_sightings_idIsDeterministic() public view {
        assertEq(
            sightings.sightingId(alice, 1, 2), uint256(keccak256(abi.encode(alice, uint32(1), uint32(2))))
        );
    }
}
