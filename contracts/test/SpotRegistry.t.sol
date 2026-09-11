// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SpotBase} from "./SpotBase.t.sol";
import {SpotRegistry} from "../src/SpotRegistry.sol";
import {ISpotRegistry, UNPRICED} from "../src/interfaces/ISpotRegistry.sol";
import {MockStockToken, MockFeed, MockDeadToken, MockERC20} from "./mocks/Mocks.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract SpotRegistryTest is SpotBase {
    // ───────────────────────────── admission ─────────────────────────────

    function test_addBrand_storesAndActivates() public view {
        ISpotRegistry.Brand memory b = registry.getBrand(AMZN);
        assertEq(b.id, AMZN);
        assertEq(b.name, "Amazon");
        assertEq(b.token, address(amzn));
        assertEq(b.priceFeed, address(amznFeed));
        assertEq(b.sector, 1);
        assertTrue(b.active);
        assertEq(registry.rarity(AMZN), registry.RARITY_ONE());
        assertEq(registry.brandCount(), 2);
    }

    function test_addBrand_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        registry.addBrand("Tesla", address(amzn), address(amznFeed), 3);
    }

    function test_addBrand_rejectsStaleFeed() public {
        MockFeed f = new MockFeed(8, 100e8);
        f.setUpdatedAt(vm.getBlockTimestamp() - 25 hours);
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(SpotRegistry.FeedStale.selector, vm.getBlockTimestamp() - 25 hours)
        );
        registry.addBrand("Tesla", address(amzn), address(f), 3);
    }

    function test_addBrand_acceptsFeedJustUnder24h() public {
        MockFeed f = new MockFeed(8, 100e8);
        f.setUpdatedAt(vm.getBlockTimestamp() - 24 hours);
        vm.prank(owner);
        registry.addBrand("Tesla", address(amzn), address(f), 3);
    }

    function test_addBrand_rejectsNonPositivePrice() public {
        MockFeed f = new MockFeed(8, 0);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.FeedInvalidAnswer.selector, int256(0)));
        registry.addBrand("Tesla", address(amzn), address(f), 3);

        f.set(-1);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.FeedInvalidAnswer.selector, int256(-1)));
        registry.addBrand("Tesla", address(amzn), address(f), 3);
    }

    function test_addBrand_rejectsIncompleteRound() public {
        MockFeed f = new MockFeed(8, 100e8);
        f.setRounds(10, 9);
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(SpotRegistry.FeedRoundIncomplete.selector, uint80(10), uint80(9))
        );
        registry.addBrand("Tesla", address(amzn), address(f), 3);
    }

    function test_addBrand_rejectsTokenWithoutDecimals() public {
        MockDeadToken dead = new MockDeadToken();
        vm.prank(owner);
        vm.expectRevert();
        registry.addBrand("Tesla", address(dead), address(amznFeed), 3);
    }

    function test_addBrand_rejectsWrongDecimals() public {
        MockERC20 six = new MockERC20("USDG", "USDG", 6);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.TokenDecimalsMismatch.selector, uint8(6)));
        registry.addBrand("Tesla", address(six), address(amznFeed), 3);
    }

    function test_addBrand_rejectsZeroMultiplier() public {
        MockStockToken t = new MockStockToken("X", "X");
        t.setMultiplier(0);
        vm.prank(owner);
        vm.expectRevert(SpotRegistry.TokenNoMultiplier.selector);
        registry.addBrand("Tesla", address(t), address(amznFeed), 3);
    }

    function test_addBrand_rejectsEmptyNameAndZeroAddresses() public {
        vm.startPrank(owner);
        vm.expectRevert(SpotRegistry.EmptyName.selector);
        registry.addBrand("", address(amzn), address(amznFeed), 3);
        vm.expectRevert(SpotRegistry.ZeroAddress.selector);
        registry.addBrand("Tesla", address(0), address(amznFeed), 3);
        vm.expectRevert(SpotRegistry.ZeroAddress.selector);
        registry.addBrand("Tesla", address(amzn), address(0), 3);
        vm.stopPrank();
    }

    function test_getBrand_unknownReverts() public {
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.UnknownBrand.selector, uint32(0)));
        registry.getBrand(0);
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.UnknownBrand.selector, uint32(99)));
        registry.getBrand(99);
        assertFalse(registry.isBrandActive(0));
        assertFalse(registry.isBrandActive(99));
    }

    // ───────────────────────────── retrait ─────────────────────────────

    function test_deactivate_immediateAndFinal() public {
        vm.prank(owner);
        registry.deactivate(AMZN);
        assertFalse(registry.isBrandActive(AMZN));
        assertEq(registry.getBrand(AMZN).name, "Amazon"); // l'histoire reste lisible

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.BrandInactive.selector, AMZN));
        registry.deactivate(AMZN);
    }

    function test_deactivate_onlyOwner() public {
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, keeper));
        registry.deactivate(AMZN);
    }

    // ───────────────────────────── rareté ─────────────────────────────

    function test_setRarities_onlyKeeper() public {
        uint32[] memory ids = new uint32[](1);
        uint32[] memory vals = new uint32[](1);
        ids[0] = AMZN;
        vals[0] = 1200;
        vm.prank(owner);
        vm.expectRevert(SpotRegistry.NotKeeper.selector);
        registry.setRarities(ids, vals);
    }

    function test_setRarities_boundsStepTo35Percent() public {
        uint32[] memory ids = new uint32[](2);
        uint32[] memory vals = new uint32[](2);
        ids[0] = AMZN;
        ids[1] = KO;
        vals[0] = 8000; // demande ×8,00 depuis ×1,00 → plafonné à ×1,35
        vals[1] = 400; // demande ×0,40 depuis ×1,00 → plancher à ×0,65
        vm.prank(keeper);
        registry.setRarities(ids, vals);
        assertEq(registry.rarity(AMZN), 1350);
        assertEq(registry.rarity(KO), 650);
    }

    function test_setRarities_clampsToGlobalRange() public {
        uint32[] memory ids = new uint32[](1);
        uint32[] memory vals = new uint32[](1);
        ids[0] = AMZN;
        // monter par pas de +35 % jusqu'à buter sur 8,0
        uint32 expected = 1000;
        for (uint256 i = 0; i < 12; ++i) {
            vals[0] = 8000;
            vm.prank(keeper);
            registry.setRarities(ids, vals);
            uint256 next = (uint256(expected) * 13_500) / 10_000;
            expected = uint32(next > 8000 ? 8000 : next);
            assertEq(registry.rarity(AMZN), expected);
        }
        assertEq(registry.rarity(AMZN), 8000);

        // et redescendre jusqu'à 0,4
        for (uint256 i = 0; i < 12; ++i) {
            vals[0] = 1;
            vm.prank(keeper);
            registry.setRarities(ids, vals);
        }
        assertEq(registry.rarity(AMZN), 400);
    }

    function test_setRarities_lengthMismatch() public {
        uint32[] memory ids = new uint32[](2);
        uint32[] memory vals = new uint32[](1);
        vm.prank(keeper);
        vm.expectRevert(SpotRegistry.LengthMismatch.selector);
        registry.setRarities(ids, vals);
    }

    // ───────────────────────────── chasse ─────────────────────────────

    function _huntPreimage(uint32 day, uint32[5] memory ids, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encode(day, ids, salt));
    }

    function test_hunt_commitRevealFlow() public {
        uint32 today = _day();
        uint32[5] memory ids = [AMZN, KO, AMZN, KO, AMZN];
        bytes32 salt = keccak256("sel");
        bytes32[] memory commits = new bytes32[](2);
        commits[0] = _huntPreimage(today + 1, ids, salt);
        commits[1] = _huntPreimage(today + 2, ids, salt);

        vm.prank(keeper);
        registry.commitHunts(today + 1, commits);
        assertEq(registry.huntCommitment(today + 1), commits[0]);

        // trop tôt
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.HuntRevealTooEarly.selector, today + 1));
        registry.revealHunt(today + 1, ids, salt);

        vm.warp(vm.getBlockTimestamp() + 1 days);
        // mauvaise préimage
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.HuntBadReveal.selector, today + 1));
        registry.revealHunt(today + 1, ids, keccak256("autre"));

        // n'importe qui peut révéler
        vm.prank(alice);
        registry.revealHunt(today + 1, ids, salt);
        assertTrue(registry.huntRevealed(today + 1));
        assertTrue(registry.isInHunt(today + 1, AMZN));
        assertFalse(registry.isInHunt(today + 1, 77));
        assertFalse(registry.isInHunt(today + 2, AMZN));
        uint32[5] memory got = registry.hunt(today + 1);
        assertEq(got[1], KO);

        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.HuntAlreadyRevealed.selector, today + 1));
        registry.revealHunt(today + 1, ids, salt);
    }

    function test_hunt_cannotCommitTodayOrPast_norOverwrite() public {
        uint32 today = _day();
        bytes32[] memory commits = new bytes32[](1);
        commits[0] = bytes32(uint256(1));
        vm.startPrank(keeper);
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.HuntCommitTooLate.selector, today));
        registry.commitHunts(today, commits);

        registry.commitHunts(today + 5, commits);
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.HuntAlreadyCommitted.selector, today + 5));
        registry.commitHunts(today + 5, commits);
        vm.stopPrank();
    }

    function test_hunt_revealWithoutCommitReverts() public {
        uint32[5] memory ids = [AMZN, KO, AMZN, KO, AMZN];
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.HuntNotCommitted.selector, uint32(1)));
        registry.revealHunt(1, ids, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.HuntNotCommitted.selector, uint32(1)));
        registry.hunt(1);
    }

    // ───────────────────────────── planches ─────────────────────────────

    function _sevenBrands() internal returns (uint32[] memory ids) {
        ids = new uint32[](7);
        ids[0] = AMZN;
        ids[1] = KO;
        vm.startPrank(owner);
        for (uint256 i = 2; i < 7; ++i) {
            MockStockToken t = new MockStockToken("T", "T");
            ids[i] =
                registry.addBrand(string(abi.encodePacked("Marque ", i)), address(t), address(amznFeed), 1);
        }
        vm.stopPrank();
    }

    function test_createPlate_requiresExactlySeven() public {
        uint32[] memory six = new uint32[](6);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.WrongPlateSize.selector, 6));
        registry.createPlate("Logistique", six, 0);
    }

    function test_createPlate_rejectsDuplicatesAndUnknown() public {
        uint32[] memory ids = _sevenBrands();
        ids[6] = ids[0];
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.DuplicateBrand.selector, ids[0]));
        registry.createPlate("Logistique", ids, 0);

        ids[6] = 999;
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.UnknownBrand.selector, uint32(999)));
        registry.createPlate("Logistique", ids, 0);
    }

    function test_plate_lifecycle() public {
        uint32[] memory ids = _sevenBrands();
        vm.prank(owner);
        uint32 plateId = registry.createPlate("Logistique", ids, uint32(vm.getBlockTimestamp() + 1 hours));
        ISpotRegistry.Plate memory p = registry.getPlate(plateId);
        assertEq(p.name, "Logistique");
        assertEq(p.brandIds.length, 7);
        assertEq(p.platesSealed, 0);
        assertFalse(p.sealed_);

        // pas encore ouverte
        vm.prank(address(plates));
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.PlateNotOpen.selector, plateId));
        registry.recordSeal(plateId);

        vm.warp(vm.getBlockTimestamp() + 1 hours);
        vm.prank(alice);
        vm.expectRevert(SpotRegistry.NotPlates.selector);
        registry.recordSeal(plateId);

        vm.startPrank(address(plates));
        assertEq(registry.recordSeal(plateId), 0);
        assertEq(registry.recordSeal(plateId), 1);
        vm.stopPrank();
        assertEq(registry.getPlate(plateId).platesSealed, 2);

        vm.prank(owner);
        registry.closePlate(plateId);
        vm.prank(address(plates));
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.PlateNotOpen.selector, plateId));
        registry.recordSeal(plateId);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.PlateAlreadyClosed.selector, plateId));
        registry.closePlate(plateId);
    }

    function test_addBrandCardsOnly_thenSetAssets() public {
        vm.prank(owner);
        uint32 id = registry.addBrandCardsOnly("Tesla", 3);
        ISpotRegistry.Brand memory b = registry.getBrand(id);
        assertEq(b.token, UNPRICED);
        assertEq(b.priceFeed, UNPRICED);
        assertTrue(b.active);
        assertEq(registry.rarity(id), registry.RARITY_ONE());

        MockStockToken tsla = new MockStockToken("Tesla Stock Token", "TSLA");
        MockFeed f = new MockFeed(8, 250e8);
        vm.prank(owner);
        registry.setBrandAssets(id, address(tsla), address(f));
        b = registry.getBrand(id);
        assertEq(b.token, address(tsla));
        assertEq(b.priceFeed, address(f));

        // une seule fois : le coffre tient sa réserve par token
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SpotRegistry.BrandAlreadyPriced.selector, id));
        registry.setBrandAssets(id, address(amzn), address(amznFeed));
    }

    function test_setBrandAssets_checksFeedAndToken() public {
        vm.prank(owner);
        uint32 id = registry.addBrandCardsOnly("Tesla", 3);
        MockFeed stale = new MockFeed(8, 250e8);
        vm.warp(block.timestamp + 25 hours);
        vm.prank(owner);
        vm.expectRevert();
        registry.setBrandAssets(id, address(amzn), address(stale));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        registry.setBrandAssets(id, address(amzn), address(amznFeed));
    }
}
