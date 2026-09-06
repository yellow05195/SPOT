// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ISpotRegistry} from "./interfaces/ISpotRegistry.sol";
import {ISpotSightings} from "./interfaces/ISpotSightings.sol";

/// @title SpotPlates — les planches d'herbier (ERC-721)
/// @notice Sceller une planche demande de détenir les 7 fiches de ses marques. Les 7 fiches sont
///         brûlées, le NFT de planche est frappé, la prime est versée depuis une réserve DISTINCTE du
///         budget quotidien (spec 2.5, 5.4).
///         prime = 300 $ / (1 + planches déjà scellées de cette série), plafond 300 $, plancher 5 $.
contract SpotPlates is ERC721, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant PLATE_SIZE = 7;
    uint256 public constant BONUS_BASE_USD = 300e8; // 8 décimales
    uint256 public constant BONUS_MIN_USD = 5e8;

    ISpotRegistry public immutable registry;
    ISpotSightings public immutable sightings;
    /// @dev Token de la réserve de primes (USDG, 6 décimales). Les décimales sont lues à la
    ///      construction et la conversion 8 → n est testée (spec 5.5).
    IERC20 public immutable bonusToken;
    uint8 public immutable bonusDecimals;

    uint256 public nextTokenId;
    mapping(uint256 tokenId => uint32 plateId) public plateOf;
    string private _baseTokenURI;

    event PlateSealed(
        uint256 indexed tokenId,
        uint32 indexed plateId,
        address indexed owner,
        uint32 sealedBefore,
        uint256 bonusUsd,
        uint256 bonusPaid
    );
    event BaseURISet(string baseURI);

    error ZeroAddress();
    error BrandMismatch(uint256 position, uint32 expected, uint32 got);
    error NotSightingOwner(uint256 sightingId);

    constructor(
        address initialOwner,
        ISpotRegistry registry_,
        ISpotSightings sightings_,
        IERC20 bonusToken_,
        string memory baseURI_
    ) ERC721("SPOT Planches", "SPOTP") Ownable(initialOwner) {
        if (
            address(registry_) == address(0) || address(sightings_) == address(0)
                || address(bonusToken_) == address(0)
        ) revert ZeroAddress();
        registry = registry_;
        sightings = sightings_;
        bonusToken = bonusToken_;
        bonusDecimals = IERC20Metadata(address(bonusToken_)).decimals();
        _baseTokenURI = baseURI_;
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        emit BaseURISet(baseURI_);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    /// @notice Scelle une planche. `sightingIds[i]` doit être une fiche de `plate.brandIds[i]`.
    function seal(uint32 plateId, uint256[PLATE_SIZE] calldata sightingIds)
        external
        nonReentrant
        returns (uint256 tokenId)
    {
        ISpotRegistry.Plate memory p = registry.getPlate(plateId);

        for (uint256 i = 0; i < PLATE_SIZE; ++i) {
            ISpotSightings.Sighting memory s = sightings.getSighting(sightingIds[i]);
            if (s.brandId != p.brandIds[i]) revert BrandMismatch(i, p.brandIds[i], s.brandId);
            if (sightings.balanceOf(msg.sender, sightingIds[i]) == 0) {
                revert NotSightingOwner(sightingIds[i]);
            }
        }

        // Effets on-chain d'abord (le registre refuse si la planche n'est pas ouverte), puis brûlage.
        uint32 sealedBefore = registry.recordSeal(plateId);
        for (uint256 i = 0; i < PLATE_SIZE; ++i) {
            sightings.burnForPlate(msg.sender, sightingIds[i]);
        }

        tokenId = ++nextTokenId;
        plateOf[tokenId] = plateId;
        _safeMint(msg.sender, tokenId);

        uint256 bonusUsd = bonusFor(sealedBefore);
        uint256 bonusTokens = toBonusTokens(bonusUsd);
        uint256 available = bonusToken.balanceOf(address(this));
        uint256 paid = bonusTokens < available ? bonusTokens : available;
        if (paid > 0) bonusToken.safeTransfer(msg.sender, paid);

        emit PlateSealed(tokenId, plateId, msg.sender, sealedBefore, bonusUsd, paid);
    }

    /// @notice Prime dégressive en USD 8 décimales (spec 2.5).
    function bonusFor(uint32 sealedBefore) public pure returns (uint256 usd) {
        usd = BONUS_BASE_USD / (1 + uint256(sealedBefore));
        if (usd < BONUS_MIN_USD) usd = BONUS_MIN_USD;
    }

    /// @notice Conversion USD 8 déc. → unités du token de réserve.
    function toBonusTokens(uint256 usd8) public view returns (uint256) {
        if (bonusDecimals >= 8) return usd8 * 10 ** (bonusDecimals - 8);
        return usd8 / 10 ** (8 - bonusDecimals);
    }

    function reserveBalance() external view returns (uint256) {
        return bonusToken.balanceOf(address(this));
    }
}
