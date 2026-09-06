// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {SpotRegistry} from "../src/SpotRegistry.sol";
import {SpotVault} from "../src/SpotVault.sol";
import {SpotSightings} from "../src/SpotSightings.sol";
import {SpotPlates} from "../src/SpotPlates.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Déploiement câblé des quatre contrats. Variables d'environnement :
///   OWNER, SIGNER, KEEPER, GUARDIAN   adresses
///   DAILY_BUDGET_USD                   8 décimales (200 $ == 20000000000)
///   BONUS_TOKEN                        USDG (réserve de primes des planches)
///   SIGHTINGS_URI, PLATES_BASE_URI     métadonnées
///
///   forge script script/Deploy.s.sol --rpc-url robinhood --broadcast --verify
///
/// @dev Le signer est une clé KMS : seule son ADRESSE passe ici. Jamais de clé privée en clair.
contract Deploy is Script {
    function run() external {
        address owner_ = vm.envAddress("OWNER");
        address signer = vm.envAddress("SIGNER");
        address keeper = vm.envAddress("KEEPER");
        address guardian = vm.envAddress("GUARDIAN");
        uint256 budget = vm.envUint("DAILY_BUDGET_USD");
        address bonusToken = vm.envAddress("BONUS_TOKEN");
        string memory sightingsUri = vm.envOr("SIGHTINGS_URI", string("https://spot.example/fiche/{id}"));
        string memory platesUri = vm.envOr("PLATES_BASE_URI", string("https://spot.example/planche/"));

        require(block.chainid == 4663 || block.chainid == 31337, "chainId inattendu");

        vm.startBroadcast();
        address deployer = msg.sender;

        SpotRegistry registry = new SpotRegistry(deployer);
        SpotSightings sightings = new SpotSightings(deployer, sightingsUri);
        SpotVault vault = new SpotVault(deployer, signer, registry, sightings, budget, address(0));
        SpotPlates plates = new SpotPlates(deployer, registry, sightings, IERC20(bonusToken), platesUri);

        registry.setKeeper(keeper);
        registry.setPlates(address(plates));
        sightings.setVault(address(vault), true);
        sightings.setPlates(address(plates));
        vault.setKeeper(keeper);
        vault.setGuardian(guardian);

        // Ownable2Step : l'owner final doit accepter (`acceptOwnership`) sur chaque contrat.
        if (owner_ != deployer) {
            registry.transferOwnership(owner_);
            sightings.transferOwnership(owner_);
            vault.transferOwnership(owner_);
            plates.transferOwnership(owner_);
        }
        vm.stopBroadcast();

        console.log("SpotRegistry ", address(registry));
        console.log("SpotSightings", address(sightings));
        console.log("SpotVault    ", address(vault));
        console.log("SpotPlates   ", address(plates));
        console.log("signer       ", signer);
        console.log("domain chain ", block.chainid);
    }
}
