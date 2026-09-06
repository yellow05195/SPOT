// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title UnitQueue — file FIFO d'unités d'inventaire (spec 5.2)
/// @notice Chaque marque possède une file d'unités achetées d'avance. On consomme d'abord les plus
///         anciennes. Toutes les opérations sont O(1) sauf `take`, bornée par `maxUnits`.
library UnitQueue {
    struct Unit {
        address token;
        uint128 amount;
        uint32 boughtAt;
    }

    struct Queue {
        uint64 head; // index de la première unité vivante
        uint64 tail; // index de la prochaine unité à écrire
        uint128 total; // somme des `amount` vivants — évite toute boucle de sommation
        mapping(uint64 => Unit) units;
    }

    error EmptyQueue();
    error ZeroAmount();
    error InsufficientUnits(uint128 requested, uint128 available);
    error TooFragmented(uint8 maxUnits);

    function length(Queue storage q) internal view returns (uint64) {
        return q.tail - q.head;
    }

    function isEmpty(Queue storage q) internal view returns (bool) {
        return q.tail == q.head;
    }

    function peek(Queue storage q) internal view returns (Unit memory) {
        if (isEmpty(q)) revert EmptyQueue();
        return q.units[q.head];
    }

    /// @notice Lecture par position relative à la tête (0 = la plus ancienne).
    function at(Queue storage q, uint64 offset) internal view returns (Unit memory) {
        if (offset >= length(q)) revert EmptyQueue();
        return q.units[q.head + offset];
    }

    function push(Queue storage q, address token, uint128 amount) internal {
        if (amount == 0) revert ZeroAmount();
        q.units[q.tail] = Unit({token: token, amount: amount, boughtAt: uint32(block.timestamp)});
        q.tail += 1;
        q.total += amount;
    }

    /// @notice Retire l'unité de tête, entière.
    function pop(Queue storage q) internal returns (Unit memory u) {
        if (isEmpty(q)) revert EmptyQueue();
        u = q.units[q.head];
        delete q.units[q.head];
        q.head += 1;
        q.total -= u.amount;
    }

    /// @notice Consomme exactement `amount` depuis la tête, en traversant au plus `maxUnits` unités.
    ///         Une unité partiellement consommée reste en tête avec son reliquat.
    /// @return unitsConsumed nombre d'unités entièrement retirées de la file
    function take(Queue storage q, uint128 amount, uint8 maxUnits) internal returns (uint8 unitsConsumed) {
        if (amount == 0) revert ZeroAmount();
        if (amount > q.total) revert InsufficientUnits(amount, q.total);
        uint128 remaining = amount;
        uint64 cursor = q.head;
        uint8 visited;
        while (remaining > 0) {
            if (visited == maxUnits) revert TooFragmented(maxUnits);
            Unit storage u = q.units[cursor];
            if (u.amount <= remaining) {
                remaining -= u.amount;
                delete q.units[cursor];
                cursor += 1;
                unitsConsumed += 1;
            } else {
                u.amount -= remaining;
                remaining = 0;
            }
            visited += 1;
        }
        q.head = cursor;
        q.total -= amount;
    }
}
