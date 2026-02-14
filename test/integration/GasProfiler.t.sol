// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "src/core/HealthReporter.sol";
import "src/core/IncidentManager.sol";
import "src/registries/OrbitChainRegistry.sol";

contract GasProfiler is Test {
    HealthReporter public reporter;
    IncidentManager public manager;
    OrbitChainRegistry public registry;

    address public admin = address(0x1);
    address public op = address(0x2);
    address public rep = address(0x3);

    function setUp() public {
        vm.startPrank(admin);
        vm.warp(1000000); // Prevent timestamp underflow
        vm.prevrandao(bytes32(uint256(123456)));
        registry = new OrbitChainRegistry();
        manager = new IncidentManager();
        reporter = new HealthReporter(address(registry), address(manager), rep);
        
        manager.setRegistry(address(registry));
        manager.setReporterContract(address(reporter));
        manager.setReporterAuthorization(rep, true);
        
        registry.registerChain(42161, op, 12, 10, "Arbitrum One");
        vm.stopPrank();
    }

    function testGas_submitHealthSignal() public {
        vm.prank(address(manager));
        reporter.setReporter(rep);

        vm.warp(block.timestamp + 60); // Bypass rate limit
        vm.prank(rep);
        uint256 startGas = gasleft();
        reporter.submitHealthSignal(42161, 100, block.timestamp, 1, true, 10, block.timestamp, true, "Stable");
        uint256 gasUsed = startGas - gasleft();
        emit log_named_uint("Gas used for submitHealthSignal", gasUsed);
    }

    function testGas_raiseIncident() public {
        vm.prank(admin);
        manager.setReporterAuthorization(rep, true);

        vm.prank(rep);
        uint256 startGas = gasleft();
        manager.raiseIncident(
            42161,
            IncidentManager.FailureType.SequencerStall,
            IncidentManager.IncidentSeverity.Critical,
            IncidentManager.Priority.P0,
            99,
            block.timestamp - 100,
            "Sequencer down",
            0
        );
        uint256 gasUsed = startGas - gasleft();
        emit log_named_uint("Gas used for raiseIncident", gasUsed);
    }

    function testGas_resolveIncident() public {
        vm.startPrank(admin);
        manager.setReporterAuthorization(rep, true);
        uint256 id = manager.raiseIncident(
            42161,
            IncidentManager.FailureType.SequencerStall,
            IncidentManager.IncidentSeverity.Critical,
            IncidentManager.Priority.P0,
            99,
            block.timestamp - 100,
            "Sequencer down",
            0
        );
        vm.stopPrank();

        vm.prank(admin);
        uint256 startGas = gasleft();
        manager.resolveIncident(id, "Fixed");
        uint256 gasUsed = startGas - gasleft();
        emit log_named_uint("Gas used for resolveIncident", gasUsed);
    }
}
