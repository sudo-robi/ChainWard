// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "src/registries/OrbitChainRegistry.sol";
import "src/core/HealthMonitor.sol";
import "src/core/HealthReporter.sol";
import "src/core/IncidentManager.sol";

contract IntegrationTest is Test {
    OrbitChainRegistry public registry;
    HealthMonitor public monitor;
    HealthReporter public reporter;
    IncidentManager public incidentManager;

    address public admin = address(0x1);
    address public reporterAddr = address(0x2);

    uint256 public constant CHAIN_ID = 421614;
    uint256 public constant EXPECTED_BLOCK_TIME = 250;
    uint256 public constant MAX_BLOCK_LAG = 10;

    event IncidentRaised(
        uint256 indexed incidentId,
        uint256 indexed chainId,
        uint8 indexed failureType,
        uint8 severity,
        uint8 priority,
        string description,
        uint256 timestamp
    );
    event IncidentResolved(uint256 indexed incidentId, uint256 indexed chainId, string reason, uint256 timestamp, uint256 resolvedAt);

    function setUp() public {
        vm.warp(2000);
        vm.startPrank(admin);

        registry = new OrbitChainRegistry();
        incidentManager = new IncidentManager();
        monitor = new HealthMonitor(address(registry));
        reporter = new HealthReporter(address(registry), address(incidentManager), reporterAddr);

        incidentManager.setReporterContract(address(reporter));
        incidentManager.setReporterAuthorization(reporterAddr, true);

        registry.registerChain(CHAIN_ID, reporterAddr, EXPECTED_BLOCK_TIME, MAX_BLOCK_LAG, "Arbitrum Sepolia");

        vm.stopPrank();
    }

    function testIncidentLifecycle() public {
        vm.startPrank(reporterAddr);
        uint256 incidentId = incidentManager.raiseIncident(CHAIN_ID, IncidentManager.FailureType.BlockLag, IncidentManager.IncidentSeverity.Critical, IncidentManager.Priority.P1, 123, block.timestamp - 100, "Block production stalled", 0);
        
        vm.expectEmit(true, true, false, true);
        emit IncidentResolved(incidentId, CHAIN_ID, "Sequencer resumed", block.timestamp, block.timestamp);
        incidentManager.resolveIncident(incidentId, "Sequencer resumed");
        
        IncidentManager.Incident memory inc = incidentManager.getIncident(incidentId);
        assertTrue(inc.resolved);
        vm.stopPrank();
    }

    function testIncidentAggregation() public {
        vm.startPrank(reporterAddr);
        uint256 parentId = incidentManager.raiseIncident(CHAIN_ID, IncidentManager.FailureType.BlockLag, IncidentManager.IncidentSeverity.Critical, IncidentManager.Priority.P1, 123, block.timestamp - 100, "Parent", 0);
        uint256 childId = incidentManager.raiseIncident(CHAIN_ID, IncidentManager.FailureType.BlockLag, IncidentManager.IncidentSeverity.Critical, IncidentManager.Priority.P2, 124, block.timestamp - 50, "Child", parentId);
        assertEq(incidentManager.getIncident(childId).parentIncidentId, parentId);
        vm.stopPrank();
    }

    function testIncidentComments() public {
        vm.startPrank(reporterAddr);
        uint256 incidentId = incidentManager.raiseIncident(CHAIN_ID, IncidentManager.FailureType.BlockLag, IncidentManager.IncidentSeverity.Critical, IncidentManager.Priority.P1, 123, block.timestamp - 100, "Test", 0);
        incidentManager.addComment(incidentId, "Investigating");
        assertEq(incidentManager.getIncidentComments(incidentId).length, 1);
        vm.stopPrank();
    }

    function testAutoResolution() public {
        vm.startPrank(reporterAddr);
        uint256 start = block.timestamp;
        reporter.submitHealthSignal(CHAIN_ID, 125, start, 1, false, 50, start, true, "Unhealthy");
        uint256 incidentId = reporter.activeIncidentId(CHAIN_ID);
        
        vm.warp(block.timestamp + 31);
        reporter.submitHealthSignal(CHAIN_ID, 126, start + 1, 2, true, 51, start + 1, true, "S1");
        vm.warp(block.timestamp + 31);
        reporter.submitHealthSignal(CHAIN_ID, 127, start + 2, 3, true, 52, start + 2, true, "S2");
        vm.warp(block.timestamp + 31);
        reporter.submitHealthSignal(CHAIN_ID, 128, start + 3, 4, true, 53, start + 3, true, "S3");

        assertTrue(incidentManager.getIncident(incidentId).resolved);
        vm.stopPrank();
    }
}
