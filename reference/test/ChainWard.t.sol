// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Test } from "../lib/forge-std/src/Test.sol";
import { OrbitChainRegistry } from "../src/OrbitChainRegistry.sol";
import { IncidentManager } from "../src/IncidentManager.sol";
import { HealthReporter } from "../src/HealthReporter.sol";

contract ChainWardTest is Test {
    OrbitChainRegistry registry;
    IncidentManager incidents;
    HealthReporter reporter;

    address owner = address(0x1);
    address chainOperator = address(0x2);
    address healthReporter = address(0x3);

    uint256 chainId = 42; // Orbit chain ID
    uint256 expectedBlockTime = 2; // 2 seconds between blocks
    uint256 maxBlockLag = 10; // 10 second lag is unacceptable

    function setUp() public {
        vm.prank(owner);
        registry = new OrbitChainRegistry();

        incidents = new IncidentManager();
        
        // Create HealthReporter first
        reporter = new HealthReporter(address(registry), address(incidents), healthReporter);
        
        // Link IncidentManager to registry &reporter contract
        incidents.setRegistry(address(registry));
        incidents.setReporterContract(address(reporter));

        // Register chain
        vm.prank(owner);
        registry.registerChain(
            chainId, chainOperator, expectedBlockTime, maxBlockLag, "Orbit Chain Test"
        );
    }

    function testChainRegistration() public view {
        OrbitChainRegistry.ChainConfig memory config = registry.getChain(chainId);
        assertEq(config.operator, chainOperator);
        assertEq(config.expectedBlockTime, expectedBlockTime);
        assertEq(config.maxBlockLag, maxBlockLag);
        assertTrue(config.isActive);
    }

    function testHealthSignalWithinThreshold() public {
        uint256 blockNum1 = 1000;
        uint256 timestamp1 = 1000;

        vm.prank(healthReporter);
        reporter.submitHealthSignal(
            chainId, blockNum1, timestamp1, 1, true, "Block 1000 healthy"
        );

        // Advance time by 30+ seconds (rate limit window)
        vm.warp(block.timestamp + 31);

        // Second signal 2 seconds later (within expected block time)
        uint256 blockNum2 = 1001;
        uint256 timestamp2 = 1002; // 2 seconds later in block time

        vm.prank(healthReporter);
        reporter.submitHealthSignal(
            chainId, blockNum2, timestamp2, 2, true, "Block 1001 healthy"
        );

        // No incidents should be raised
        assertEq(incidents.getIncidentCount(), 0);
    }

    function testBlockLagIncident() public {
        uint256 blockNum1 = 1000;
        uint256 timestamp1 = 1000;

        vm.prank(healthReporter);
        reporter.submitHealthSignal(
            chainId, blockNum1, timestamp1, 1, true, "Block 1000 healthy"
        );

        // Advance time by 31 seconds (past rate limit)
        vm.warp(block.timestamp + 31);

        // Second signal 15 seconds later (exceeds max lag of 10s)
        uint256 blockNum2 = 1001;
        uint256 timestamp2 = 1015; // 15 seconds later

        vm.prank(healthReporter);
        reporter.submitHealthSignal(
            chainId, blockNum2, timestamp2, 2, true, "Block 1001 delayed"
        );

        // Incident should be raised
        assertEq(incidents.getIncidentCount(), 1);
        IncidentManager.Incident memory inc = incidents.getIncident(0);
        assertEq(inc.chainId, chainId);
        assertEq(uint256(inc.failureType), uint256(IncidentManager.FailureType.BlockLag));
        assertEq(uint256(inc.severity), uint256(IncidentManager.IncidentSeverity.Critical));
        assertFalse(inc.resolved);
    }

    function testSequencerStallIncident() public {
        uint256 blockNum = 1000;
        uint256 timestamp = 1000;

        vm.prank(healthReporter);
        reporter.submitHealthSignal(
            chainId, blockNum, timestamp, 1, false, "Sequencer unhealthy"
        );

        // Incident should be raised
        assertEq(incidents.getIncidentCount(), 1);
        IncidentManager.Incident memory inc = incidents.getIncident(0);
        assertEq(inc.chainId, chainId);
        assertEq(uint256(inc.failureType), uint256(IncidentManager.FailureType.SequencerStall));
        assertEq(uint256(inc.severity), uint256(IncidentManager.IncidentSeverity.Critical));
    }

    function testIncidentResolution() public {
        // Raise an incident
        vm.prank(healthReporter);
        reporter.submitHealthSignal(chainId, 1000, 1000, 1, false, "Sequencer unhealthy");

        assertEq(incidents.getIncidentCount(), 1);

        // Resolve the incident (only IncidentManager registry can do this)
        vm.prank(address(registry));
        incidents.resolveIncident(0, "Sequencer restarted &healthy");
        IncidentManager.Incident memory inc = incidents.getIncident(0);
        assertTrue(inc.resolved);
    }

    function testChainIncidentHistory() public {
        // Raise first incident (sequencer stall)
        vm.prank(healthReporter);
        reporter.submitHealthSignal(chainId, 1000, 1000, 1, false, "First incident");
        assertEq(incidents.getIncidentCount(), 1);

        // Advance time past incident cooldown (300s)
        vm.warp(block.timestamp + 301);
        
        // Raise second incident (block lag - 20s > 10s max)
        vm.prank(healthReporter);
        reporter.submitHealthSignal(chainId, 1001, 1020, 2, true, "Second incident");
        
        // Both incidents should be recorded
        assertEq(incidents.getIncidentCount(), 2);
        uint256[] memory chainIncs = incidents.getChainIncidents(chainId);
        assertEq(chainIncs.length, 2);
        assertEq(chainIncs[0], 0);
        assertEq(chainIncs[1], 1);
    }

    function testUnauthorizedHealthSignal() public {
        vm.prank(address(0x99)); // unauthorized
        vm.expectRevert("only reporter");
        reporter.submitHealthSignal(chainId, 1000, 1000, 1, true, "Unauthorized");
    }
}
