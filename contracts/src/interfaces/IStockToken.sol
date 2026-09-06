// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Robinhood Stock Token (ERC-20, 18 décimales, spec 1.2).
/// @dev Dividendes et splits sont gérés par un multiplicateur on-chain. `currentMultiplier()` est
///      exprimé en point fixe 18 décimales (1e18 == x1,00). Il doit être appliqué PARTOUT où un prix
///      est lu : valeur_usd(1 unité brute) = prix_feed * currentMultiplier / 1e18.
///      A CONFIRMER sur le contrat réel avant mainnet : nom exact du getter et échelle du
///      multiplicateur. Le vault revert si l'appel échoue — jamais de valeur par défaut silencieuse.
interface IStockToken is IERC20 {
    function decimals() external view returns (uint8);
    function currentMultiplier() external view returns (uint256);
}
