// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISpotRegistry} from "./interfaces/ISpotRegistry.sol";
import {ISpotVault} from "./interfaces/ISpotVault.sol";

/// @title SpotSwapper — achat d'inventaire, keeper uniquement (spec 5.5)
/// @notice ETH → (Uniswap V4) → USDG → Stock Token, route directe quand un pool WETH existe.
///         La route est construite off-chain par le keeper et exécutée contre un routeur IMMUABLE.
///         `minAmountOut` est calculé off-chain (tolérance 1 %) et passé en paramètre ; au-delà, revert,
///         le keeper réessaie plus petit. Le slippage est absorbé par la trésorerie, jamais par la
///         valeur du fragment. Le vault enregistre le montant RÉELLEMENT reçu.
/// @dev Ce contrat est le `keeper` du SpotVault : c'est lui qui appelle `depositUnits`.
contract SpotSwapper is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Garde-fou spec 6.1 : jamais plus de 80 % du solde ETH en un cycle. Appliqué par appel ;
    ///      le keeper applique la même règle par cycle sur l'ensemble des appels.
    uint256 public constant MAX_ETH_SHARE_BPS = 8000;
    uint256 public constant MAX_UNITS_PER_SWAP = 200;

    ISpotRegistry public immutable registry;
    ISpotVault public immutable vault;
    /// @dev Le routeur de swap (Universal Router / V4). Immuable : le keeper ne choisit pas la cible,
    ///      seulement la route.
    address public immutable router;

    address public keeper;

    event Swapped(
        uint32 indexed brandId, address token, uint256 ethIn, uint256 received, uint256 minAmountOut, uint256 units
    );
    event KeeperSet(address keeper);
    event EthReceived(address from, uint256 amount);
    event EthWithdrawn(address to, uint256 amount);

    error NotKeeper();
    error ZeroAddress();
    error BrandInactive(uint32 brandId);
    error EthShareExceeded(uint256 requested, uint256 maxAllowed);
    error RouterCallFailed(bytes reason);
    error SlippageExceeded(uint256 received, uint256 minAmountOut);
    error NothingReceived();
    error ZeroUnitSize();
    error TooManyUnits(uint256 count);
    error EthTransferFailed();

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    constructor(address initialOwner, ISpotRegistry registry_, ISpotVault vault_, address router_)
        Ownable(initialOwner)
    {
        if (address(registry_) == address(0) || address(vault_) == address(0) || router_ == address(0)) {
            revert ZeroAddress();
        }
        registry = registry_;
        vault = vault_;
        router = router_;
    }

    receive() external payable {
        emit EthReceived(msg.sender, msg.value);
    }

    function setKeeper(address keeper_) external onlyOwner {
        if (keeper_ == address(0)) revert ZeroAddress();
        keeper = keeper_;
        emit KeeperSet(keeper_);
    }

    /// @notice Exécute la route contre le routeur avec `ethIn`, mesure ce qui est réellement reçu,
    ///         découpe en unités de `unitSize` (la dernière porte le reliquat) et dépose dans le vault.
    function swapAndDeposit(
        uint32 brandId,
        uint256 ethIn,
        uint256 minAmountOut,
        uint128 unitSize,
        bytes calldata routeCalldata
    ) external onlyKeeper nonReentrant returns (uint256 received, uint256 units) {
        if (unitSize == 0) revert ZeroUnitSize();
        ISpotRegistry.Brand memory b = registry.getBrand(brandId);
        if (!b.active) revert BrandInactive(brandId);

        uint256 maxEth = (address(this).balance * MAX_ETH_SHARE_BPS) / 10_000;
        if (ethIn > maxEth) revert EthShareExceeded(ethIn, maxEth);

        IERC20 token = IERC20(b.token);
        uint256 before = token.balanceOf(address(this));
        (bool ok, bytes memory reason) = router.call{value: ethIn}(routeCalldata);
        if (!ok) revert RouterCallFailed(reason);
        received = token.balanceOf(address(this)) - before;
        if (received == 0) revert NothingReceived();
        if (received < minAmountOut) revert SlippageExceeded(received, minAmountOut);

        units = received / unitSize;
        uint256 remainder = received - units * unitSize;
        if (remainder > 0) units += 1;
        if (units > MAX_UNITS_PER_SWAP) revert TooManyUnits(units);

        uint128[] memory amounts = new uint128[](units);
        for (uint256 i = 0; i < units; ++i) {
            amounts[i] = unitSize;
        }
        if (remainder > 0) amounts[units - 1] = uint128(remainder);

        token.forceApprove(address(vault), received);
        vault.depositUnits(brandId, amounts);
        emit Swapped(brandId, b.token, ethIn, received, minAmountOut, units);
    }

    /// @notice Récupération de trésorerie par l'owner. Aucun token de marque ne transite ici : ils
    ///         partent au vault dans la même transaction que l'achat.
    function withdrawEth(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
        emit EthWithdrawn(to, amount);
    }
}
