// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {UnitQueue} from "./libraries/UnitQueue.sol";
import {ISpotVault} from "./interfaces/ISpotVault.sol";
import {ISpotRegistry} from "./interfaces/ISpotRegistry.sol";
import {ISpotSightings} from "./interfaces/ISpotSightings.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {IStockToken} from "./interfaces/IStockToken.sol";

/// @title SpotVault — l'inventaire pré-acheté, la vérification des vouchers, le paiement
/// @notice Rien n'est jamais frappé : un fragment ne peut être réclamé que si le vault détient déjà
///         les tokens. Budget quotidien fixe. Quand il est épuisé, la fiche est quand même frappée
///         et aucun fragment n'est versé (spec 2.1, règle 3).
/// @dev Rôles :
///      - signer   : clé du claim server, immuable. Rotation == nouveau vault + `migrate`.
///      - keeper   : dépose l'inventaire acheté.
///      - guardian : peut suspendre l'ENTRÉE de nouveaux vouchers ; ne peut jamais bloquer un voucher
///                   déjà signé (pause asymétrique, voir SECURITY.md).
///      - owner    : budget du lendemain, retrait d'inventaire d'une marque INACTIVE, migration.
contract SpotVault is ISpotVault, EIP712, ReentrancyGuard, Ownable2Step {
    using UnitQueue for UnitQueue.Queue;
    using SafeERC20 for IERC20;

    // ───────────────────────────── constantes ─────────────────────────────

    bytes32 public constant VOUCHER_TYPEHASH = keccak256(
        "Voucher(address wallet,uint32 brandId,uint128 amount,address token,uint64 nonce,uint64 issuedAt,uint64 deadline,bytes32 imageHash,uint32 cityCode)"
    );
    /// @dev Deadline : 30 minutes (spec 4.8). Un voucher ne peut pas vivre plus longtemps que ça,
    ///      ce qui rend inutile tout antidatage de `issuedAt` au-delà de 30 minutes.
    uint64 public constant MAX_VOUCHER_LIFETIME = 30 minutes;
    /// @dev Tolérance d'horloge entre le serveur et la chaîne.
    uint64 public constant CLOCK_SKEW = 2 minutes;
    uint8 public constant MAX_UNITS_PER_CLAIM = 8;
    uint256 public constant MAX_DEPOSIT_BATCH = 200;
    uint256 public constant FEED_MAX_AGE = 24 hours;
    uint256 public constant USD_DECIMALS = 8;
    uint256 internal constant STOCK_TOKEN_SCALE = 1e18; // 18 décimales
    uint256 internal constant MULTIPLIER_SCALE = 1e18; // currentMultiplier en point fixe 18

    // ───────────────────────────── immuables ─────────────────────────────

    address public immutable signer;
    ISpotRegistry public immutable registry;
    ISpotSightings public immutable sightings;
    /// @dev Ancien vault autorisé à pousser son inventaire dans celui-ci (0 = aucun).
    address public immutable migrationSource;

    // ───────────────────────────── état ─────────────────────────────

    address public keeper;
    address public guardian;

    mapping(uint32 brandId => UnitQueue.Queue) private _inventory;
    /// @notice Somme des unités vivantes par token — l'invariant 1 se lit ici.
    mapping(address token => uint256) public reserved;
    mapping(uint64 nonce => bool) public used;

    uint32 public currentDay;
    uint256 public spentTodayUsd; // 8 décimales
    uint256 public dailyBudgetUsd; // 8 décimales
    uint256 public nextDailyBudgetUsd; // appliqué au prochain changement de jour

    /// @dev 0 == ouvert. Sinon : timestamp de la pause ; tout voucher émis à partir de cet instant
    ///      est refusé, tout voucher émis avant s'exécute.
    uint64 public entryPausedAt;

    address public migrationTarget;

    // ───────────────────────────── événements ─────────────────────────────

    event Claimed(
        address indexed wallet,
        uint32 indexed brandId,
        address token,
        uint128 amount,
        uint256 usdValue,
        uint64 nonce,
        uint256 sightingId
    );
    event SightingOnly(
        address indexed wallet, uint32 indexed brandId, uint64 nonce, uint256 sightingId, Reason reason
    );
    event UnitsDeposited(uint32 indexed brandId, address token, uint256 count, uint256 total);
    event InventoryWithdrawn(uint32 indexed brandId, address to, uint256 count, uint256 total);
    event DayRolled(uint32 day, uint256 dailyBudgetUsd);
    event DailyBudgetScheduled(uint256 nextDailyBudgetUsd);
    event EntryPaused(uint64 at);
    event EntryResumed();
    event KeeperSet(address keeper);
    event GuardianSet(address guardian);
    event MigrationStarted(address newVault);
    event BrandMigrated(uint32 indexed brandId, uint256 count, uint256 total);
    event MigrationReceived(uint32 indexed brandId, uint256 count, uint256 total);

    enum Reason {
        BudgetExhausted,
        BrandInactive,
        NoFragment // le serveur a signé un montant nul : fiche seule (score de risque > 85, spec 4.7)
    }

    // ───────────────────────────── erreurs ─────────────────────────────

    error NotKeeper();
    error NotGuardian();
    error NotMigrationSource();
    error ZeroAddress();
    error NonceUsed(uint64 nonce);
    error VoucherExpired(uint64 deadline);
    error VoucherLifetime(uint64 issuedAt, uint64 deadline);
    error VoucherFromFuture(uint64 issuedAt);
    error EntryIsPaused(uint64 pausedAt, uint64 issuedAt);
    error BadSignature();
    error TokenMismatch(address expected, address got);
    error StalePrice();
    error InvalidMultiplier();
    error BrandInactive(uint32 brandId);
    error BatchTooLarge(uint256 got);
    error EmptyBatch();
    error BrandStillActive(uint32 brandId);
    error AlreadyPaused();
    error NotPaused();
    error AlreadyMigrating();
    error NotMigrating();
    error MigrationTargetNotContract();
    error MigrationShortfall(address token, uint256 expected, uint256 got);

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian();
        _;
    }

    /// @dev Modificateur de la pause asymétrique : refuse les vouchers émis APRÈS la pause.
    ///      C'est le seul effet de la pause sur `claim`. Un voucher antérieur passe toujours.
    modifier entryOpenFor(uint64 issuedAt) {
        uint64 pausedAt = entryPausedAt;
        if (pausedAt != 0 && issuedAt >= pausedAt) revert EntryIsPaused(pausedAt, issuedAt);
        _;
    }

    constructor(
        address initialOwner,
        address signer_,
        ISpotRegistry registry_,
        ISpotSightings sightings_,
        uint256 initialDailyBudgetUsd,
        address migrationSource_
    ) EIP712("SPOT", "1") Ownable(initialOwner) {
        if (signer_ == address(0) || address(registry_) == address(0) || address(sightings_) == address(0)) {
            revert ZeroAddress();
        }
        signer = signer_;
        registry = registry_;
        sightings = sightings_;
        migrationSource = migrationSource_;
        dailyBudgetUsd = initialDailyBudgetUsd;
        nextDailyBudgetUsd = initialDailyBudgetUsd;
        currentDay = uint32(block.timestamp / 1 days);
    }

    // ───────────────────────────── rôles ─────────────────────────────

    function setKeeper(address keeper_) external onlyOwner {
        if (keeper_ == address(0)) revert ZeroAddress();
        keeper = keeper_;
        emit KeeperSet(keeper_);
    }

    function setGuardian(address guardian_) external onlyOwner {
        if (guardian_ == address(0)) revert ZeroAddress();
        guardian = guardian_;
        emit GuardianSet(guardian_);
    }

    // ───────────────────────────── claim ─────────────────────────────

    /// @notice Exécute un voucher signé par le claim server. N'importe qui peut relayer la
    ///         transaction : les tokens vont toujours à `v.wallet`.
    /// @return paid `true` si un fragment a été versé, `false` si seule la fiche a été frappée
    ///         (budget du jour épuisé ou marque retirée). Ne revert jamais pour ces deux cas.
    function claim(Voucher calldata v, bytes calldata sig)
        external
        nonReentrant
        entryOpenFor(v.issuedAt)
        returns (bool paid)
    {
        // 1–3. anti-rejeu, deadline, signature
        if (used[v.nonce]) revert NonceUsed(v.nonce);
        if (block.timestamp > v.deadline) revert VoucherExpired(v.deadline);
        if (v.deadline < v.issuedAt || v.deadline - v.issuedAt > MAX_VOUCHER_LIFETIME) {
            revert VoucherLifetime(v.issuedAt, v.deadline);
        }
        if (v.issuedAt > block.timestamp + CLOCK_SKEW) revert VoucherFromFuture(v.issuedAt);
        if (ECDSA.recover(_hashTypedDataV4(hashVoucher(v)), sig) != signer) revert BadSignature();

        // 4. changement de jour
        _rollDay();

        // Effet : le nonce est consommé AVANT tout transfert.
        used[v.nonce] = true;

        // La fiche est frappée dans tous les cas : une prise validée est validée pour toujours.
        uint256 sightingId = sightings.mintSighting(v.wallet, v.brandId, v.imageHash, v.cityCode);

        ISpotRegistry.Brand memory b = registry.getBrand(v.brandId);
        if (b.token != v.token) revert TokenMismatch(b.token, v.token);
        if (!b.active) {
            emit SightingOnly(v.wallet, v.brandId, v.nonce, sightingId, Reason.BrandInactive);
            return false;
        }
        if (v.amount == 0) {
            emit SightingOnly(v.wallet, v.brandId, v.nonce, sightingId, Reason.NoFragment);
            return false;
        }

        // 5. budget du jour
        uint256 usd = _usdValue(b, v.amount);
        if (spentTodayUsd + usd > dailyBudgetUsd) {
            emit SightingOnly(v.wallet, v.brandId, v.nonce, sightingId, Reason.BudgetExhausted);
            return false;
        }

        // 6. consommation de l'inventaire, puis transfert
        _inventory[v.brandId].take(v.amount, MAX_UNITS_PER_CLAIM);
        reserved[b.token] -= v.amount;
        spentTodayUsd += usd;

        IERC20(b.token).safeTransfer(v.wallet, v.amount);
        emit Claimed(v.wallet, v.brandId, b.token, v.amount, usd, v.nonce, sightingId);
        return true;
    }

    function hashVoucher(Voucher calldata v) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                VOUCHER_TYPEHASH,
                v.wallet,
                v.brandId,
                v.amount,
                v.token,
                v.nonce,
                v.issuedAt,
                v.deadline,
                v.imageHash,
                v.cityCode
            )
        );
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Valeur USD (8 déc.) d'un montant de tokens, prix Chainlink × currentMultiplier.
    ///         Revert si le feed est invalide ou périmé : on ne paie jamais à un prix inconnu.
    ///         Le voucher n'est alors PAS consommé ; le joueur réessaie ou obtient une réémission.
    function usdValueOf(uint32 brandId, uint128 amount) external view returns (uint256) {
        return _usdValue(registry.getBrand(brandId), amount);
    }

    function _usdValue(ISpotRegistry.Brand memory b, uint128 amount) internal view returns (uint256 usd) {
        AggregatorV3Interface feed = AggregatorV3Interface(b.priceFeed);
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = feed.latestRoundData();
        if (answer <= 0 || answeredInRound < roundId) revert StalePrice();
        if (updatedAt > block.timestamp || block.timestamp - updatedAt > FEED_MAX_AGE) revert StalePrice();

        uint256 multiplier = IStockToken(b.token).currentMultiplier();
        if (multiplier == 0) revert InvalidMultiplier();

        // raw est en décimales du feed : amount/1e18 × answer × multiplier/1e18
        // forge-lint: disable-next-line(unsafe-typecast) — answer > 0 vérifié juste au-dessus
        uint256 raw = Math.mulDiv(amount, uint256(answer) * multiplier, STOCK_TOKEN_SCALE * MULTIPLIER_SCALE);
        uint8 feedDecimals = feed.decimals();
        if (feedDecimals >= USD_DECIMALS) {
            usd = raw / 10 ** (feedDecimals - USD_DECIMALS);
        } else {
            usd = raw * 10 ** (USD_DECIMALS - feedDecimals);
        }
    }

    // ───────────────────────────── budget ─────────────────────────────

    /// @dev Horloge = block.timestamp, jamais block.number (spec 1.1).
    function _rollDay() internal {
        uint32 day = uint32(block.timestamp / 1 days);
        if (day != currentDay) {
            currentDay = day;
            spentTodayUsd = 0;
            dailyBudgetUsd = nextDailyBudgetUsd;
            emit DayRolled(day, dailyBudgetUsd);
        }
    }

    /// @notice Force le changement de jour (utile aux lecteurs qui veulent un état frais).
    function rollDay() external {
        _rollDay();
    }

    /// @notice Le budget est décidé à l'avance : il s'applique à partir du lendemain, jamais au
    ///         jour en cours, pour que `spentTodayUsd <= dailyBudgetUsd` tienne toujours.
    function setDailyBudget(uint256 usd) external onlyOwner {
        nextDailyBudgetUsd = usd;
        emit DailyBudgetScheduled(usd);
    }

    /// @notice État du budget tel qu'il serait après `rollDay()`.
    function budgetState() external view returns (uint32 day, uint256 budget, uint256 spent) {
        day = uint32(block.timestamp / 1 days);
        if (day == currentDay) return (day, dailyBudgetUsd, spentTodayUsd);
        return (day, nextDailyBudgetUsd, 0);
    }

    // ───────────────────────────── inventaire ─────────────────────────────

    /// @notice Le keeper dépose des unités achetées d'avance. Le montant réellement reçu est ce qui
    ///         est enregistré (spec 5.5) : le keeper passe les montants réels, le vault les tire.
    function depositUnits(uint32 brandId, uint128[] calldata amounts) external onlyKeeper nonReentrant {
        if (amounts.length == 0) revert EmptyBatch();
        if (amounts.length > MAX_DEPOSIT_BATCH) revert BatchTooLarge(amounts.length);
        ISpotRegistry.Brand memory b = registry.getBrand(brandId);
        if (!b.active) revert BrandInactive(brandId);

        uint256 total = _pushAll(brandId, b.token, amounts);
        IERC20(b.token).safeTransferFrom(msg.sender, address(this), total);
        emit UnitsDeposited(brandId, b.token, amounts.length, total);
    }

    /// @notice Retrait d'inventaire par l'owner, UNIQUEMENT pour une marque inactive (invariant 5).
    function withdrawInventory(uint32 brandId, address to, uint8 maxUnits) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (registry.isBrandActive(brandId)) revert BrandStillActive(brandId);
        (address token, uint256 count, uint256 total) = _popUpTo(brandId, maxUnits);
        if (count == 0) revert EmptyBatch();
        IERC20(token).safeTransfer(to, total);
        emit InventoryWithdrawn(brandId, to, count, total);
    }

    function inventoryLength(uint32 brandId) external view returns (uint64) {
        return _inventory[brandId].length();
    }

    function inventoryTotal(uint32 brandId) external view returns (uint128) {
        return _inventory[brandId].total;
    }

    function inventoryAt(uint32 brandId, uint64 offset) external view returns (UnitQueue.Unit memory) {
        return _inventory[brandId].at(offset);
    }

    function inventoryHead(uint32 brandId) external view returns (UnitQueue.Unit memory) {
        return _inventory[brandId].peek();
    }

    function _pushAll(uint32 brandId, address token, uint128[] calldata amounts)
        internal
        returns (uint256 total)
    {
        UnitQueue.Queue storage q = _inventory[brandId];
        for (uint256 i = 0; i < amounts.length; ++i) {
            q.push(token, amounts[i]);
            total += amounts[i];
        }
        reserved[token] += total;
    }

    function _popUpTo(uint32 brandId, uint8 maxUnits)
        internal
        returns (address token, uint256 count, uint256 total)
    {
        UnitQueue.Queue storage q = _inventory[brandId];
        while (count < maxUnits && !q.isEmpty()) {
            UnitQueue.Unit memory u = q.pop();
            token = u.token;
            total += u.amount;
            count += 1;
        }
        if (count > 0) reserved[token] -= total;
    }

    // ───────────────────────────── pause asymétrique ─────────────────────────────

    /// @notice Suspend l'entrée de NOUVEAUX vouchers. Tout voucher émis avant cet instant reste
    ///         exécutable jusqu'à sa deadline. Le guardian ne peut rien faire de plus.
    function pauseEntry() external onlyGuardian {
        if (entryPausedAt != 0) revert AlreadyPaused();
        entryPausedAt = uint64(block.timestamp);
        emit EntryPaused(entryPausedAt);
    }

    function resumeEntry() external onlyOwner {
        if (entryPausedAt == 0) revert NotPaused();
        entryPausedAt = 0;
        emit EntryResumed();
    }

    // ───────────────────────────── migration (rotation du signer) ─────────────────────────────

    /// @notice `signer` est immuable : pour le changer, on déploie un nouveau vault (construit avec
    ///         `migrationSource == address(this)`) et on y migre l'inventaire. Appelable une seule fois.
    function migrate(address newVault) external onlyOwner {
        if (migrationTarget != address(0)) revert AlreadyMigrating();
        if (newVault.code.length == 0) revert MigrationTargetNotContract();
        migrationTarget = newVault;
        emit MigrationStarted(newVault);
    }

    /// @notice Déplace jusqu'à `maxUnits` unités d'une marque vers le nouveau vault, qui les
    ///         ré-enregistre unité par unité. Les claims restent possibles pendant la migration.
    function migrateBrand(uint32 brandId, uint8 maxUnits) external onlyOwner nonReentrant {
        address target = migrationTarget;
        if (target == address(0)) revert NotMigrating();
        UnitQueue.Queue storage q = _inventory[brandId];
        uint256 n = q.length();
        if (n > maxUnits) n = maxUnits;
        if (n == 0) revert EmptyBatch();

        uint128[] memory amounts = new uint128[](n);
        address token;
        uint256 total;
        for (uint256 i = 0; i < n; ++i) {
            UnitQueue.Unit memory u = q.pop();
            token = u.token;
            amounts[i] = u.amount;
            total += u.amount;
        }
        reserved[token] -= total;

        IERC20(token).safeTransfer(target, total);
        SpotVault(target).receiveMigration(brandId, amounts);
        emit BrandMigrated(brandId, n, total);
    }

    /// @notice Réception d'inventaire depuis l'ancien vault. Vérifie que les tokens sont bien là.
    function receiveMigration(uint32 brandId, uint128[] calldata amounts) external nonReentrant {
        if (msg.sender != migrationSource) revert NotMigrationSource();
        if (amounts.length == 0) revert EmptyBatch();
        if (amounts.length > MAX_DEPOSIT_BATCH) revert BatchTooLarge(amounts.length);
        ISpotRegistry.Brand memory b = registry.getBrand(brandId);

        uint256 total = _pushAll(brandId, b.token, amounts);
        uint256 balance = IERC20(b.token).balanceOf(address(this));
        if (balance < reserved[b.token]) revert MigrationShortfall(b.token, reserved[b.token], balance);
        emit MigrationReceived(brandId, amounts.length, total);
    }
}
