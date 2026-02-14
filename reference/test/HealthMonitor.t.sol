// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Test } from "../lib/forge-std/src/Test.sol";
import { OrbitRegistry } from "../src/OrbitRegistry.sol";
import { HealthMonitor } from "../src/HealthMonitor.sol";

contract HealthMonitorTest is Test {
    OrbitRegistry registry;
    HealthMonitor monitor;
    address operator = address(0xBEEF);
    uint256 chainId = 1;
    event BondWithdrawn(uint256 indexed chainId, address indexed operator, uint256 amount);

    function setUp() public {
        registry = new OrbitRegistry();
        monitor = new HealthMonitor(address(registry));
        // register the chain with a small threshold (5 seconds)
        registry.registerChain(chainId, operator, "ipfs://meta", 5);
        // authorize monitor for this chain in registry (operator must set)
        vm.deal(operator, 1 ether);
        vm.prank(operator);
        registry.setChainMonitor(chainId, address(monitor));
        // deposit a small bond by operator
        vm.prank(operator);
        registry.depositBond{value: 1 ether}(chainId);
    }

    function testHeartbeatThenNoIncident() public {
        // operator submits heartbeat
        vm.prank(operator);
        monitor.submitHeartbeat(chainId, 1, 100);

        uint256 t = monitor.lastHeartbeat(chainId);
        assertGt(t, 0);
        assertFalse(monitor.inIncident(chainId));

        // advance time less than threshold &ensure no incident
        vm.warp(block.timestamp + 3);
        monitor.triggerIncidentIfExpired(chainId);
        assertFalse(monitor.inIncident(chainId));
    }

    function testTriggerIncidentAndClear() public {
        // heartbeat
        vm.prank(operator);
        monitor.submitHeartbeat(chainId, 2, 101);

        // warp beyond threshold
        vm.warp(block.timestamp + 10);
        monitor.triggerIncidentIfExpired(chainId);
        // after incident, bond should be reduced (Service Level Agreementshed) by Service Level AgreementSH_AMOUNT (1 wei)
        uint256 b = registry.getBond(chainId);
        assertEq(b, 1 ether - 1);
        assertTrue(monitor.inIncident(chainId));

        // only operator can clear
        vm.prank(operator);
        monitor.clearIncident(chainId);
        assertFalse(monitor.inIncident(chainId));
    }

    function testWithdrawBondWhenNoIncident() public {
        // deposit done in setUp
        uint256 beforeBal = registry.getBond(chainId);
        vm.expectEmit(true, true, false, true);
        emit BondWithdrawn(chainId, operator, 1 ether / 2);
        vm.prank(operator);
        registry.withdrawBond(chainId, 1 ether / 2);
        uint256 afterBal = registry.getBond(chainId);
        assertEq(afterBal, beforeBal - 1 ether / 2);
    }

    function testWithdrawFailsDuringIncident() public {
        // submit heartbeat, then cause incident
        vm.prank(operator);
        monitor.submitHeartbeat(chainId, 3, 102);
        vm.warp(block.timestamp + 10);
        monitor.triggerIncidentIfExpired(chainId);
        assertTrue(monitor.inIncident(chainId));

        // operator withdraw should revert
        vm.prank(operator);
        vm.expectRevert("in incident");
        registry.withdrawBond(chainId, 1 wei);
    }
}
