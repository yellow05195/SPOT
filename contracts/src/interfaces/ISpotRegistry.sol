// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// Marque admise sans actif (lancement "fiches d'abord") : token et flux valent cette sentinelle jusqu'à setBrandAssets.
address constant UNPRICED = address(1);

interface ISpotRegistry {
    struct Brand {
        uint32 id;
        string name; // "Amazon" — jamais de logo, jamais d'actif graphique
        address token; // le Stock Token correspondant
        address priceFeed; // agrégateur Chainlink
        uint16 sector;
        bool active;
    }

    struct Plate {
        uint32 id;
        string name; // "Logistique" — un secteur, jamais une marque
        uint32[] brandIds; // exactement 7
        uint32 opensAt;
        uint32 platesSealed; // nombre de scellements déjà réalisés dans cette série
        bool sealed_; // la série est close : plus aucun scellement possible
    }

    function getBrand(uint32 brandId) external view returns (Brand memory);
    function isBrandActive(uint32 brandId) external view returns (bool);
    function brandCount() external view returns (uint32);
    function getPlate(uint32 plateId) external view returns (Plate memory);
    function plateCount() external view returns (uint32);
    function recordSeal(uint32 plateId) external returns (uint32 sealedBefore);
    function rarity(uint32 brandId) external view returns (uint32);
}
