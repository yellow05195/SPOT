// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title DecimalMath — normalisation des décimales (spec 5.5)
/// @notice USDG a 6 décimales, CBBTC 8, les Stock Tokens 18. Tout ce qui compare ou additionne des
///         montants de tokens différents passe par `normalizeTo18`. Testé sur les trois.
library DecimalMath {
    error DecimalsTooLarge(uint8 decimals);

    function normalizeTo18(uint256 amount, uint8 decimals) internal pure returns (uint256) {
        if (decimals == 18) return amount;
        if (decimals > 18) {
            if (decimals > 36) revert DecimalsTooLarge(decimals);
            return amount / 10 ** (decimals - 18);
        }
        return amount * 10 ** (18 - decimals);
    }

    function denormalizeFrom18(uint256 amount18, uint8 decimals) internal pure returns (uint256) {
        if (decimals == 18) return amount18;
        if (decimals > 18) {
            if (decimals > 36) revert DecimalsTooLarge(decimals);
            return amount18 * 10 ** (decimals - 18);
        }
        return amount18 / 10 ** (18 - decimals);
    }
}
