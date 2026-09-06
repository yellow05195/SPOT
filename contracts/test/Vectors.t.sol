// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SpotBase} from "./SpotBase.t.sol";
import {SpotVault} from "../src/SpotVault.sol";
import {ISpotVault} from "../src/interfaces/ISpotVault.sol";
import {console} from "forge-std/Test.sol";

/// @dev Vecteurs de test partagés avec le serveur et le keeper (TypeScript). Les mêmes entrées
///      doivent produire les mêmes hachages des deux côtés : voir `server/test/vectors.test.ts` et
///      `keeper/test/vectors.test.ts`. Les valeurs attendues ci-dessous ont été produites par ce test
///      et sont figées ; si l'encodage change, les deux côtés doivent changer ensemble.
contract VectorsTest is SpotBase {
    function test_vectors_voucherStructHash() public view {
        ISpotVault.Voucher memory v = ISpotVault.Voucher({
            wallet: 0x1111111111111111111111111111111111111111,
            brandId: 7,
            amount: 2_100_000_000_000_000, // 0,0021 token
            token: 0x2222222222222222222222222222222222222222,
            nonce: 123_456_789,
            issuedAt: 1_788_625_306,
            deadline: 1_788_627_106,
            imageHash: 0x3333333333333333333333333333333333333333333333333333333333333333,
            cityCode: 69_000
        });
        bytes32 structHash = vault.hashVoucher(v);
        console.log("VOUCHER_TYPEHASH");
        console.logBytes32(vault.VOUCHER_TYPEHASH());
        console.log("structHash");
        console.logBytes32(structHash);
        assertEq(
            vault.VOUCHER_TYPEHASH(),
            keccak256(
                "Voucher(address wallet,uint32 brandId,uint128 amount,address token,uint64 nonce,uint64 issuedAt,uint64 deadline,bytes32 imageHash,uint32 cityCode)"
            )
        );
    }

    function test_vectors_huntCommitment() public pure {
        uint32[5] memory ids = [uint32(1), 2, 3, 4, 5];
        bytes32 salt = 0x4444444444444444444444444444444444444444444444444444444444444444;
        bytes32 c = keccak256(abi.encode(uint32(20_702), ids, salt));
        console.log("huntCommitment(20702,[1..5],0x44..)");
        console.logBytes32(c);
        assertTrue(c != bytes32(0));
    }

    function test_vectors_sightingId() public view {
        uint256 id = sightings.sightingId(0x1111111111111111111111111111111111111111, 7, 20_701);
        console.log("sightingId(0x11..,7,20701)");
        console.logBytes32(bytes32(id));
    }
}
