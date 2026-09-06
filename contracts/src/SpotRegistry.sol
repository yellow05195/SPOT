// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ISpotRegistry} from "./interfaces/ISpotRegistry.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {IStockToken} from "./interfaces/IStockToken.sol";

/// @title SpotRegistry — annuaire des marques, des planches, de la rareté et de la chasse
/// @notice Aucune valeur ne transite par ce contrat (spec 5.1). Pas de proxy, pas d'upgrade.
/// @dev Rôles :
///      - owner    : admission et retrait des marques, création et clôture des planches
///      - keeper   : écriture nocturne des coefficients de rareté, commit-reveal de la chasse
///      - plates   : le contrat SpotPlates, seul autorisé à incrémenter `platesSealed`
contract SpotRegistry is Ownable2Step, ISpotRegistry {
    // ───────────────────────────── constantes ─────────────────────────────

    uint256 public constant PLATE_SIZE = 7;
    uint256 public constant HUNT_SIZE = 5;
    uint256 public constant FEED_MAX_AGE = 24 hours;
    uint8 public constant STOCK_TOKEN_DECIMALS = 18;

    /// @dev Coefficients de rareté en millièmes : 1000 == ×1,000 (spec 2.2 : clamp 0,4 – 8,0).
    uint32 public constant RARITY_ONE = 1000;
    uint32 public constant RARITY_MIN = 400;
    uint32 public constant RARITY_MAX = 8000;
    /// @dev Variation maximale d'un coefficient par mise à jour : ±35 % (spec 6.2).
    uint256 public constant RARITY_MAX_STEP_BPS = 3500;

    // ───────────────────────────── état ─────────────────────────────

    address public keeper;
    address public plates;

    uint32 private _brandCount;
    mapping(uint32 => Brand) private _brands;
    mapping(uint32 => uint32) private _rarity;

    uint32 private _plateCount;
    mapping(uint32 => Plate) private _plates;

    /// @dev jour (block.timestamp / 1 days) => engagement keccak256(abi.encode(day, brandIds, salt))
    mapping(uint32 => bytes32) public huntCommitment;
    mapping(uint32 => uint32[HUNT_SIZE]) private _hunts;
    mapping(uint32 => bool) public huntRevealed;

    // ───────────────────────────── événements ─────────────────────────────

    event BrandAdded(uint32 indexed brandId, string name, address token, address priceFeed, uint16 sector);
    event BrandDeactivated(uint32 indexed brandId);
    event PlateCreated(uint32 indexed plateId, string name, uint32[] brandIds, uint32 opensAt);
    event PlateClosed(uint32 indexed plateId);
    event PlateSealRecorded(uint32 indexed plateId, uint32 sealedBefore);
    event RarityUpdated(uint32 indexed brandId, uint32 requested, uint32 applied);
    event HuntCommitted(uint32 indexed day, bytes32 commitment);
    event HuntRevealed(uint32 indexed day, uint32[HUNT_SIZE] brandIds);
    event KeeperSet(address keeper);
    event PlatesSet(address plates);

    // ───────────────────────────── erreurs ─────────────────────────────

    error NotKeeper();
    error NotPlates();
    error EmptyName();
    error ZeroAddress();
    error UnknownBrand(uint32 brandId);
    error BrandInactive(uint32 brandId);
    error DuplicateBrand(uint32 brandId);
    error WrongPlateSize(uint256 got);
    error UnknownPlate(uint32 plateId);
    error PlateNotOpen(uint32 plateId);
    error PlateAlreadyClosed(uint32 plateId);
    error LengthMismatch();
    error FeedInvalidAnswer(int256 answer);
    error FeedStale(uint256 updatedAt);
    error FeedRoundIncomplete(uint80 roundId, uint80 answeredInRound);
    error TokenDecimalsMismatch(uint8 got);
    error TokenNoMultiplier();
    error HuntAlreadyCommitted(uint32 day);
    error HuntCommitTooLate(uint32 day);
    error HuntNotCommitted(uint32 day);
    error HuntRevealTooEarly(uint32 day);
    error HuntAlreadyRevealed(uint32 day);
    error HuntBadReveal(uint32 day);

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    modifier onlyPlates() {
        if (msg.sender != plates) revert NotPlates();
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ───────────────────────────── rôles ─────────────────────────────

    function setKeeper(address keeper_) external onlyOwner {
        if (keeper_ == address(0)) revert ZeroAddress();
        keeper = keeper_;
        emit KeeperSet(keeper_);
    }

    function setPlates(address plates_) external onlyOwner {
        if (plates_ == address(0)) revert ZeroAddress();
        plates = plates_;
        emit PlatesSet(plates_);
    }

    // ───────────────────────────── marques ─────────────────────────────

    /// @notice Admission d'une marque, vérifiée on-chain (spec 5.1) : le feed répond,
    ///         `answeredInRound >= roundId`, `updatedAt` de moins de 24 h, prix strictement positif,
    ///         le token répond à `decimals()` (== 18) et à `currentMultiplier()` (> 0).
    /// @dev Le critère de liquidité (pool WETH/USDG ≥ 100 000 $, spec 1.2) est vérifié par le script
    ///      d'admission du keeper avant d'appeler cette fonction — voir README.
    function addBrand(string calldata name, address token, address priceFeed, uint16 sector)
        external
        onlyOwner
        returns (uint32 brandId)
    {
        if (bytes(name).length == 0) revert EmptyName();
        if (token == address(0) || priceFeed == address(0)) revert ZeroAddress();

        _checkFeed(priceFeed);
        _checkToken(token);

        brandId = ++_brandCount;
        _brands[brandId] = Brand({
            id: brandId, name: name, token: token, priceFeed: priceFeed, sector: sector, active: true
        });
        _rarity[brandId] = RARITY_ONE;
        emit BrandAdded(brandId, name, token, priceFeed, sector);
        emit RarityUpdated(brandId, RARITY_ONE, RARITY_ONE);
    }

    /// @notice Sort une marque du jeu immédiatement (spec 1.4 : retrait sous 48 h, sans discussion).
    ///         Les fiches déjà obtenues restent valides pour toujours. Pas de réactivation.
    function deactivate(uint32 brandId) external onlyOwner {
        Brand storage b = _brand(brandId);
        if (!b.active) revert BrandInactive(brandId);
        b.active = false;
        emit BrandDeactivated(brandId);
    }

    function getBrand(uint32 brandId) external view returns (Brand memory) {
        return _brand(brandId);
    }

    function isBrandActive(uint32 brandId) external view returns (bool) {
        return brandId != 0 && brandId <= _brandCount && _brands[brandId].active;
    }

    function brandCount() external view returns (uint32) {
        return _brandCount;
    }

    // ───────────────────────────── rareté ─────────────────────────────

    function rarity(uint32 brandId) external view returns (uint32) {
        _brand(brandId);
        return _rarity[brandId];
    }

    /// @notice Écriture groupée des coefficients (spec 6.2). Chaque valeur est bornée à ±35 % de la
    ///         valeur courante puis clampée à [0,4 ; 8,0]. Le keeper peut envoyer la valeur brute :
    ///         le contrat applique la règle et émet la valeur retenue.
    function setRarities(uint32[] calldata brandIds, uint32[] calldata values) external onlyKeeper {
        if (brandIds.length != values.length) revert LengthMismatch();
        for (uint256 i = 0; i < brandIds.length; ++i) {
            uint32 id = brandIds[i];
            _brand(id);
            uint32 applied = _boundedRarity(_rarity[id], values[i]);
            _rarity[id] = applied;
            emit RarityUpdated(id, values[i], applied);
        }
    }

    function _boundedRarity(uint32 current, uint32 requested) internal pure returns (uint32) {
        uint256 hi = (uint256(current) * (10_000 + RARITY_MAX_STEP_BPS)) / 10_000;
        uint256 lo = (uint256(current) * (10_000 - RARITY_MAX_STEP_BPS)) / 10_000;
        uint256 v = requested;
        if (v > hi) v = hi;
        if (v < lo) v = lo;
        if (v > RARITY_MAX) v = RARITY_MAX;
        if (v < RARITY_MIN) v = RARITY_MIN;
        return uint32(v);
    }

    // ───────────────────────────── chasse du jour ─────────────────────────────

    /// @notice Publie à l'avance les engagements des chasses à venir (spec 6.3, commit-reveal).
    ///         Un engagement ne peut être posé que pour un jour strictement futur, et jamais modifié.
    function commitHunts(uint32 firstDay, bytes32[] calldata commitments) external onlyKeeper {
        uint32 today = uint32(block.timestamp / 1 days);
        for (uint256 i = 0; i < commitments.length; ++i) {
            uint32 day = firstDay + uint32(i);
            if (day <= today) revert HuntCommitTooLate(day);
            if (huntCommitment[day] != bytes32(0)) revert HuntAlreadyCommitted(day);
            huntCommitment[day] = commitments[i];
            emit HuntCommitted(day, commitments[i]);
        }
    }

    /// @notice Révèle la chasse d'un jour. Ouvert à tous : la préimage suffit, personne ne peut
    ///         révéler autre chose que ce qui a été engagé.
    function revealHunt(uint32 day, uint32[HUNT_SIZE] calldata brandIds, bytes32 salt) external {
        bytes32 c = huntCommitment[day];
        if (c == bytes32(0)) revert HuntNotCommitted(day);
        if (day > block.timestamp / 1 days) revert HuntRevealTooEarly(day);
        if (huntRevealed[day]) revert HuntAlreadyRevealed(day);
        if (keccak256(abi.encode(day, brandIds, salt)) != c) revert HuntBadReveal(day);
        for (uint256 i = 0; i < HUNT_SIZE; ++i) {
            _brand(brandIds[i]);
        }
        _hunts[day] = brandIds;
        huntRevealed[day] = true;
        emit HuntRevealed(day, brandIds);
    }

    function hunt(uint32 day) external view returns (uint32[HUNT_SIZE] memory) {
        if (!huntRevealed[day]) revert HuntNotCommitted(day);
        return _hunts[day];
    }

    function isInHunt(uint32 day, uint32 brandId) external view returns (bool) {
        if (!huntRevealed[day]) return false;
        uint32[HUNT_SIZE] storage h = _hunts[day];
        for (uint256 i = 0; i < HUNT_SIZE; ++i) {
            if (h[i] == brandId) return true;
        }
        return false;
    }

    // ───────────────────────────── planches ─────────────────────────────

    /// @notice Crée une planche : un secteur, exactement 7 marques distinctes existantes.
    ///         Le nom est un secteur, jamais une marque (spec 1.4, 2.5).
    function createPlate(string calldata name, uint32[] calldata brandIds, uint32 opensAt)
        external
        onlyOwner
        returns (uint32 plateId)
    {
        if (bytes(name).length == 0) revert EmptyName();
        if (brandIds.length != PLATE_SIZE) revert WrongPlateSize(brandIds.length);
        for (uint256 i = 0; i < PLATE_SIZE; ++i) {
            _brand(brandIds[i]);
            for (uint256 j = 0; j < i; ++j) {
                if (brandIds[j] == brandIds[i]) revert DuplicateBrand(brandIds[i]);
            }
        }
        plateId = ++_plateCount;
        Plate storage p = _plates[plateId];
        p.id = plateId;
        p.name = name;
        p.brandIds = brandIds;
        p.opensAt = opensAt;
        emit PlateCreated(plateId, name, brandIds, opensAt);
    }

    /// @notice Clôt une série : plus aucun scellement. Les NFT déjà frappés ne sont pas affectés.
    function closePlate(uint32 plateId) external onlyOwner {
        Plate storage p = _plate(plateId);
        if (p.sealed_) revert PlateAlreadyClosed(plateId);
        p.sealed_ = true;
        emit PlateClosed(plateId);
    }

    /// @notice Appelé par SpotPlates à chaque scellement. Retourne le nombre de scellements
    ///         antérieurs de la série — base de la prime dégressive (spec 2.5).
    function recordSeal(uint32 plateId) external onlyPlates returns (uint32 sealedBefore) {
        Plate storage p = _plate(plateId);
        if (p.sealed_ || block.timestamp < p.opensAt) revert PlateNotOpen(plateId);
        sealedBefore = p.platesSealed;
        p.platesSealed = sealedBefore + 1;
        emit PlateSealRecorded(plateId, sealedBefore);
    }

    function getPlate(uint32 plateId) external view returns (Plate memory) {
        return _plate(plateId);
    }

    function plateCount() external view returns (uint32) {
        return _plateCount;
    }

    // ───────────────────────────── internes ─────────────────────────────

    function _brand(uint32 brandId) internal view returns (Brand storage b) {
        if (brandId == 0 || brandId > _brandCount) revert UnknownBrand(brandId);
        b = _brands[brandId];
    }

    function _plate(uint32 plateId) internal view returns (Plate storage p) {
        if (plateId == 0 || plateId > _plateCount) revert UnknownPlate(plateId);
        p = _plates[plateId];
    }

    function _checkFeed(address priceFeed) internal view {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
            AggregatorV3Interface(priceFeed).latestRoundData();
        if (answer <= 0) revert FeedInvalidAnswer(answer);
        if (updatedAt > block.timestamp || block.timestamp - updatedAt > FEED_MAX_AGE) {
            revert FeedStale(updatedAt);
        }
        if (answeredInRound < roundId) revert FeedRoundIncomplete(roundId, answeredInRound);
    }

    function _checkToken(address token) internal view {
        uint8 dec = IStockToken(token).decimals();
        if (dec != STOCK_TOKEN_DECIMALS) revert TokenDecimalsMismatch(dec);
        if (IStockToken(token).currentMultiplier() == 0) revert TokenNoMultiplier();
    }
}
