// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "src/registries/OrbitChainRegistry.sol";
import "src/core/HealthMonitor.sol";
import "src/core/HealthReporter.sol";
import "src/core/IncidentManager.sol";

contract MultiChainIntegrationTest is Test {
    OrbitChainRegistry public registry;
    HealthReporter public reporter;
    IncidentManager public incidentManager;

    address public admin = address(0x1);
    address public reporterAddr = address(0x2);

    uint256 public constant CHAIN_A = 421614;
    uint256 public constant CHAIN_B = 421615;

    event CascadingFailureDetected(uint256 activeIncidents, uint256 timestamp);

    function setUp() public {
        vm.warp(2000);
        vm.startPrank(admin);

        registry = new OrbitChainRegistry();
        incidentManager = new IncidentManager();
        reporter = new HealthReporter(address(registry), address(incidentManager), reporterAddr);

        incidentManager.setReporterContract(address(reporter));
        incidentManager.setReporterAuthorization(reporterAddr, true);

        registry.registerChain(CHAIN_A, reporterAddr, 250, 10, "Arbitrum Sepolia A");
        registry.registerChain(CHAIN_B, reporterAddr, 250, 10, "Arbitrum Sepolia B");

        vm.stopPrank();
    }

    function testChainDiscovery() public {
        uint256[] memory ids = registry.getChainIds();
        assertEq(ids.length, 2);
        assertEq(ids[0], CHAIN_A);
        assertEq(ids[1], CHAIN_B);
    }

    function testCascadingFailureDetection() public {
        vm.startPrank(reporterAddr);
        
        // Raise 2 incidents
        incidentManager.raiseIncident(CHAIN_A, IncidentManager.FailureType.BlockLag, IncidentManager.IncidentSeverity.Critical, IncidentManager.Priority.P1, 100, block.timestamp, "A failed", 0);
        incidentManager.raiseIncident(CHAIN_B, IncidentManager.FailureType.SequencerStall, IncidentManager.IncidentSeverity.Critical, IncidentManager.Priority.P0, 200, block.timestamp, "B failed", 0);
        
        // Third incident triggers cascading failure event
        vm.expectEmit(false, false, false, true);
        emit CascadingFailureDetected(3, block.timestamp);
        incidentManager.raiseIncident(CHAIN_A, IncidentManager.FailureType.BridgeStall, IncidentManager.IncidentSeverity.Critical, IncidentManager.Priority.P1, 100, block.timestamp, "Bridge collapsed", 0);
        
        assertEq(incidentManager.totalActiveIncidents(), 3);
        vm.stopPrank();
    }

    function testBridgeStallDetection() public {
        vm.startPrank(reporterAddr);
        
        // Submit unhealthy bridge signal
        reporter.submitHealthSignal(
            CHAIN_A, 
            100, 
            block.timestamp, 
            1, 
            true, // sequencer ok
            50,   // l1 batch ok
            block.timestamp - 10, 
            false, // bridge stalled
            "Bridge stuck"
        );
        
        uint256 incidentId = reporter.activeIncidentId(CHAIN_A);
        assertTrue(incidentId != 0);
        assertEq(uint8(incidentManager.getIncident(incidentId).failureType), uint8(IncidentManager.FailureType.BridgeStall));
        
        vm.stopPrank();
    }
}
