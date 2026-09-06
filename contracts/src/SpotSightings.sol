// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ISpotSightings} from "./interfaces/ISpotSightings.sol";

/// @title SpotSightings — les fiches de repérage (ERC-1155)
/// @notice Une fiche = un token, id = keccak256(wallet, brandId, jour). L'image vit hors chaîne ;
///         `imageHash` (sha256 de l'image TRAITÉE : EXIF supprimés, visages floutés) prouve qu'elle
///         n'a pas été modifiée après coup. `cityCode` est un code de ville, jamais des coordonnées.
///         Les fiches sont transférables (spec 5.3).
/// @dev `isVault` est une liste plutôt qu'une adresse unique : la rotation du signer déploie un
///      nouveau vault (SpotVault.migrate) qui doit pouvoir frapper à son tour.
contract SpotSightings is ERC1155, Ownable2Step, ISpotSightings {
    mapping(address => bool) public isVault;
    address public plates;

    mapping(uint256 => Sighting) private _sightings;

    event Sighted(
        uint256 indexed id,
        address indexed wallet,
        uint32 indexed brandId,
        uint32 day,
        uint32 cityCode,
        bytes32 imageHash
    );
    event BurnedForPlate(uint256 indexed id, address indexed from);
    event VaultSet(address vault, bool allowed);
    event PlatesSet(address plates);

    error NotVault();
    error NotPlates();
    error ZeroAddress();
    error AlreadySighted(uint256 id);
    error UnknownSighting(uint256 id);

    modifier onlyVault() {
        if (!isVault[msg.sender]) revert NotVault();
        _;
    }

    modifier onlyPlates() {
        if (msg.sender != plates) revert NotPlates();
        _;
    }

    constructor(address initialOwner, string memory uri_) ERC1155(uri_) Ownable(initialOwner) {}

    function setVault(address vault, bool allowed) external onlyOwner {
        if (vault == address(0)) revert ZeroAddress();
        isVault[vault] = allowed;
        emit VaultSet(vault, allowed);
    }

    function setPlates(address plates_) external onlyOwner {
        if (plates_ == address(0)) revert ZeroAddress();
        plates = plates_;
        emit PlatesSet(plates_);
    }

    function setURI(string calldata uri_) external onlyOwner {
        _setURI(uri_);
    }

    function sightingId(address wallet, uint32 brandId, uint32 day) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(wallet, brandId, day)));
    }

    /// @notice Frappe la fiche du jour. Une seule par wallet, marque et jour : c'est le quota
    ///         « 1 prise/marque/jour/wallet » gravé on-chain.
    function mintSighting(address to, uint32 brandId, bytes32 imageHash, uint32 cityCode)
        external
        onlyVault
        returns (uint256 id)
    {
        uint32 day = uint32(block.timestamp / 1 days);
        id = sightingId(to, brandId, day);
        if (_sightings[id].wallet != address(0)) revert AlreadySighted(id);
        _sightings[id] =
            Sighting({wallet: to, brandId: brandId, day: day, cityCode: cityCode, imageHash: imageHash});
        _mint(to, id, 1, "");
        emit Sighted(id, to, brandId, day, cityCode, imageHash);
    }

    /// @notice Brûlée lors du scellement d'une planche (spec 5.4). Les métadonnées restent lisibles :
    ///         on ne réécrit pas l'histoire, et l'id ne peut pas être re-frappé le même jour.
    function burnForPlate(address from, uint256 id) external onlyPlates {
        if (_sightings[id].wallet == address(0)) revert UnknownSighting(id);
        _burn(from, id, 1);
        emit BurnedForPlate(id, from);
    }

    function getSighting(uint256 id) external view returns (Sighting memory s) {
        s = _sightings[id];
        if (s.wallet == address(0)) revert UnknownSighting(id);
    }

    function balanceOf(address account, uint256 id)
        public
        view
        override(ERC1155, ISpotSightings)
        returns (uint256)
    {
        return super.balanceOf(account, id);
    }
}
