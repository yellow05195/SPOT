// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {UnitQueue} from "../src/libraries/UnitQueue.sol";

contract UnitQueueHarness {
    using UnitQueue for UnitQueue.Queue;

    UnitQueue.Queue internal q;
    address public constant TOKEN = address(0xABCD);

    function push(uint128 amount) external {
        q.push(TOKEN, amount);
    }

    function pop() external returns (UnitQueue.Unit memory) {
        return q.pop();
    }

    function take(uint128 amount, uint8 maxUnits) external returns (uint8) {
        return q.take(amount, maxUnits);
    }

    function length() external view returns (uint64) {
        return q.length();
    }

    function total() external view returns (uint128) {
        return q.total;
    }

    function peek() external view returns (UnitQueue.Unit memory) {
        return q.peek();
    }

    function at(uint64 i) external view returns (UnitQueue.Unit memory) {
        return q.at(i);
    }

    function isEmpty() external view returns (bool) {
        return q.isEmpty();
    }
}

contract UnitQueueTest is Test {
    UnitQueueHarness internal h;

    function setUp() public {
        vm.warp(1_788_625_306);
        h = new UnitQueueHarness();
    }

    function test_emptyByDefault() public view {
        assertTrue(h.isEmpty());
        assertEq(h.length(), 0);
        assertEq(h.total(), 0);
    }

    function test_pushIncrementsLengthAndTotal() public {
        h.push(10);
        h.push(20);
        assertEq(h.length(), 2);
        assertEq(h.total(), 30);
        assertEq(h.peek().amount, 10);
        assertEq(h.peek().boughtAt, uint32(vm.getBlockTimestamp()));
        assertEq(h.peek().token, h.TOKEN());
        assertEq(h.at(1).amount, 20);
    }

    function test_pushZeroReverts() public {
        vm.expectRevert(UnitQueue.ZeroAmount.selector);
        h.push(0);
    }

    function test_popIsFifo() public {
        h.push(10);
        h.push(20);
        h.push(30);
        assertEq(h.pop().amount, 10);
        assertEq(h.pop().amount, 20);
        assertEq(h.length(), 1);
        assertEq(h.total(), 30);
        assertEq(h.pop().amount, 30);
        assertTrue(h.isEmpty());
    }

    function test_popEmptyReverts() public {
        vm.expectRevert(UnitQueue.EmptyQueue.selector);
        h.pop();
    }

    function test_peekEmptyReverts() public {
        vm.expectRevert(UnitQueue.EmptyQueue.selector);
        h.peek();
    }

    function test_atOutOfRangeReverts() public {
        h.push(1);
        vm.expectRevert(UnitQueue.EmptyQueue.selector);
        h.at(1);
    }

    function test_takeExactUnit() public {
        h.push(10);
        h.push(20);
        assertEq(h.take(10, 8), 1);
        assertEq(h.length(), 1);
        assertEq(h.total(), 20);
        assertEq(h.peek().amount, 20);
    }

    function test_takePartialLeavesRemainder() public {
        h.push(10);
        h.push(20);
        assertEq(h.take(4, 8), 0);
        assertEq(h.length(), 2);
        assertEq(h.total(), 26);
        assertEq(h.peek().amount, 6);
    }

    function test_takeSpansUnits() public {
        h.push(10);
        h.push(20);
        h.push(30);
        assertEq(h.take(25, 8), 1); // 10 entière + 15 sur la deuxième, qui reste en tête
        assertEq(h.length(), 2);
        assertEq(h.peek().amount, 5);
        assertEq(h.total(), 35);
    }

    function test_takeMoreThanTotalReverts() public {
        h.push(10);
        vm.expectRevert(abi.encodeWithSelector(UnitQueue.InsufficientUnits.selector, 11, 10));
        h.take(11, 8);
    }

    function test_takeTooFragmentedReverts() public {
        for (uint256 i = 0; i < 5; ++i) {
            h.push(1);
        }
        vm.expectRevert(abi.encodeWithSelector(UnitQueue.TooFragmented.selector, 3));
        h.take(4, 3);
        // la borne est stricte sur les unités VISITÉES : 3 unités visitées pour 3 consommées, ok
        assertEq(h.take(3, 3), 3);
    }

    function test_takeZeroReverts() public {
        h.push(1);
        vm.expectRevert(UnitQueue.ZeroAmount.selector);
        h.take(0, 8);
    }

    function testFuzz_totalMatchesSumAfterOps(uint128[8] memory pushes, uint128 takeAmount) public {
        uint256 sum;
        for (uint256 i = 0; i < 8; ++i) {
            uint128 a = uint128(bound(pushes[i], 1, type(uint64).max));
            h.push(a);
            sum += a;
        }
        takeAmount = uint128(bound(takeAmount, 1, sum));
        h.take(takeAmount, 8);
        assertEq(h.total(), sum - takeAmount);
        // la somme réelle des unités vivantes est bien égale au total maintenu
        uint256 live;
        for (uint64 i = 0; i < h.length(); ++i) {
            live += h.at(i).amount;
        }
        assertEq(live, h.total());
    }
}
