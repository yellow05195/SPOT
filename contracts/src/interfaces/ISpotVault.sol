// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface ISpotVault {
    /// @dev Le voucher de la spec 4.8, étendu de trois champs justifiés par « une prise = une
    ///      transaction » : `imageHash` et `cityCode` (nécessaires pour frapper la fiche dans le même
    ///      claim, puisque `mintSighting` est `onlyVault`) et `issuedAt` (nécessaire à la pause
    ///      asymétrique : un voucher signé AVANT la pause s'exécute toujours, cf. SECURITY.md).
    struct Voucher {
        address wallet;
        uint32 brandId;
        uint128 amount; // montant de tokens (18 déc.), calculé serveur
        address token;
        uint64 nonce; // unique, anti-rejeu
        uint64 issuedAt; // timestamp de signature
        uint64 deadline; // timestamp ; deadline - issuedAt <= MAX_VOUCHER_LIFETIME
        bytes32 imageHash; // sha256 de l'image traitée
        uint32 cityCode;
    }

    function claim(Voucher calldata v, bytes calldata sig) external returns (bool paid);
    function depositUnits(uint32 brandId, uint128[] calldata amounts) external;
}
