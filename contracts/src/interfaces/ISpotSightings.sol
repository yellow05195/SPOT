// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface ISpotSightings {
    struct Sighting {
        address wallet; // premier détenteur (le photographe)
        uint32 brandId;
        uint32 day; // block.timestamp / 1 days
        uint32 cityCode; // code de ville, jamais des coordonnées
        bytes32 imageHash; // sha256 de l'image traitée
    }

    function mintSighting(address to, uint32 brandId, bytes32 imageHash, uint32 cityCode)
        external
        returns (uint256 id);
    function burnForPlate(address from, uint256 id) external;
    function getSighting(uint256 id) external view returns (Sighting memory);
    function sightingId(address wallet, uint32 brandId, uint32 day) external pure returns (uint256);
    function balanceOf(address account, uint256 id) external view returns (uint256);
}
