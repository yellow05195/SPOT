// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {SpotRegistry} from "../src/SpotRegistry.sol";
import {SpotVault} from "../src/SpotVault.sol";
import {SpotSightings} from "../src/SpotSightings.sol";
import {SpotPlates} from "../src/SpotPlates.sol";
import {ISpotVault} from "../src/interfaces/ISpotVault.sol";
import {MockERC20, MockStockToken, MockFeed} from "../test/mocks/Mocks.sol";

/// @notice Scénario complet sur fork local (spec Phase 1, étape 5) :
///         déploiement → admission d'une marque → dépôt d'inventaire → voucher signé → claim payé
///         → claim « hors budget » (fiche seule) → rejeu refusé → retrait de la marque.
///
///   anvil --chain-id 4663            (ou : anvil --fork-url robinhood)
///   forge script script/Scenario.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///
///   Sur un vrai fork, STOCK_TOKEN et PRICE_FEED désignent le Stock Token et le feed réels ;
///   sinon des mocks sont déployés. Le compte 0 d'anvil joue tous les rôles, une clé de test
///   distincte (SIGNER_PK, jamais celle de prod) signe les vouchers.
contract Scenario is Script {
    uint256 internal constant ANVIL_PK_0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function run() external {
        uint256 opPk = vm.envOr("OPERATOR_PK", ANVIL_PK_0);
        uint256 signerPk = vm.envOr("SIGNER_PK", uint256(0xA11CE));
        address op = vm.addr(opPk);
        address signer = vm.addr(signerPk);
        address player = vm.envOr("PLAYER", address(0x9A7E));

        vm.startBroadcast(opPk);

        // ─── déploiement
        SpotRegistry registry = new SpotRegistry(op);
        SpotSightings sightings = new SpotSightings(op, "https://spot.example/fiche/{id}");
        SpotVault vault = new SpotVault(op, signer, registry, sightings, 200e8, address(0));
        MockERC20 usdg = new MockERC20("USDG", "USDG", 6);
        SpotPlates plates = new SpotPlates(op, registry, sightings, usdg, "https://spot.example/planche/");
        registry.setKeeper(op);
        registry.setPlates(address(plates));
        sightings.setVault(address(vault), true);
        sightings.setPlates(address(plates));
        vault.setKeeper(op);
        vault.setGuardian(op);

        // ─── marque : réelle si fournie, sinon mock
        address token = vm.envOr("STOCK_TOKEN", address(0));
        address feed = vm.envOr("PRICE_FEED", address(0));
        bool mocked = token == address(0);
        if (mocked) {
            MockStockToken t = new MockStockToken("Amazon Stock Token", "AMZN");
            MockFeed f = new MockFeed(8, 230e8);
            t.mint(op, 1e18);
            token = address(t);
            feed = address(f);
        }
        uint32 brandId = registry.addBrand("Amazon", token, feed, 1);
        console.log("marque admise, id", brandId, "rarete", registry.rarity(brandId));

        // ─── inventaire : 100 unités de 0,002 AMZN
        uint128[] memory amounts = new uint128[](100);
        for (uint256 i = 0; i < 100; ++i) {
            amounts[i] = 0.002e18;
        }
        MockStockToken(token).approve(address(vault), 0.2e18);
        vault.depositUnits(brandId, amounts);
        console.log("inventaire (unites)", vault.inventoryLength(brandId));
        console.log("reserve (wei)      ", vault.reserved(token));

        // ─── prise validée → voucher signé → claim payé
        ISpotVault.Voucher memory v = _voucher(player, brandId, 0.0021e18, token, 1);
        bool paid = vault.claim(v, _sign(vault, v, signerPk));
        console.log("claim #1 paye      ", paid);
        console.log("fragment (wei)     ", MockStockToken(token).balanceOf(player));
        console.log("depense du jour    ", vault.spentTodayUsd());
        console.log(
            "fiche detenue      ",
            sightings.balanceOf(
                player, sightings.sightingId(player, brandId, uint32(block.timestamp / 1 days))
            )
        );

        // ─── rejeu : doit échouer. Hors broadcast : on ne diffuse pas une transaction vouée au revert,
        //     on vérifie localement que le contrat la refuse.
        vm.stopBroadcast();
        try vault.claim(v, _sign(vault, v, signerPk)) {
            revert("le rejeu aurait du echouer");
        } catch {
            console.log("rejeu refuse        ok");
        }
        vm.startBroadcast(opPk);

        // ─── budget épuisé : une seconde marque (mock, 400 $), une unité de 1 token, un voucher
        //     de 0,6 token = 240 $ > 200 $ de budget → fiche frappée, aucun fragment versé
        address player2 = address(0x9A7F);
        MockStockToken t2 = new MockStockToken("Tesla Stock Token", "TSLA");
        MockFeed f2 = new MockFeed(8, 400e8);
        t2.mint(op, 1e18);
        uint32 brand2 = registry.addBrand("Tesla", address(t2), address(f2), 3);
        uint128[] memory one = new uint128[](1);
        one[0] = 1e18;
        t2.approve(address(vault), 1e18);
        vault.depositUnits(brand2, one);
        ISpotVault.Voucher memory big = _voucher(player2, brand2, 0.6e18, address(t2), 2);
        bool paid2 = vault.claim(big, _sign(vault, big, signerPk));
        console.log("claim #2 (240 $) paye", paid2);
        console.log("player2 recu (wei)   ", t2.balanceOf(player2));
        console.log(
            "player2 fiche        ",
            sightings.balanceOf(
                player2, sightings.sightingId(player2, brand2, uint32(block.timestamp / 1 days))
            )
        );
        console.log("depense du jour      ", vault.spentTodayUsd());

        // ─── retrait d'une marque : immédiat, inventaire récupérable ensuite
        registry.deactivate(brandId);
        vault.withdrawInventory(brandId, op, 50);
        console.log("marque retiree, inventaire restant", vault.inventoryLength(brandId));

        vm.stopBroadcast();
        console.log("scenario termine");
    }

    function _voucher(address wallet, uint32 brandId, uint128 amount, address token, uint64 nonce)
        internal
        view
        returns (ISpotVault.Voucher memory)
    {
        return ISpotVault.Voucher({
            wallet: wallet,
            brandId: brandId,
            amount: amount,
            token: token,
            nonce: nonce,
            issuedAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp) + 30 minutes,
            imageHash: keccak256(abi.encode("image", nonce)),
            cityCode: 69_000
        });
    }

    function _sign(SpotVault vault, ISpotVault.Voucher memory v, uint256 pk)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", vault.domainSeparator(), vault.hashVoucher(v)));
        (uint8 sv, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, sv);
    }
}
