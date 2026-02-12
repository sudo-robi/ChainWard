// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { OrbitChainRegistry } from "../src/OrbitChainRegistry.sol";
import { IncidentManager } from "../src/IncidentManager.sol";
import { HealthReporter } from "../src/HealthReporter.sol";

contract Deploy is Script {
    address constant DEMO_REPORTER = 0xB7cB63B75ffD4ce00C6B7B85e1C59501A338Da3a;

    function run() external returns (address registryAddr, address incidentsAddr, address reporterAddr) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // OrbitChainRegistry registry = new OrbitChainRegistry();
        OrbitChainRegistry registry = OrbitChainRegistry(0x6034278203dd70Ec929aC14DCd3ea507f3ba51D2);
        IncidentManager incidents = new IncidentManager();
        HealthReporter reporter = new HealthReporter(address(registry), address(incidents), DEMO_REPORTER);
        
        incidents.setReporterAuthorization(DEMO_REPORTER, true);

        vm.stopBroadcast();

        console.log("OrbitChainRegistry:", address(registry));
        console.log("IncidentManager:", address(incidents));
        console.log("HealthReporter:", address(reporter));
        console.log("REPORTER_ROLE granted to:", DEMO_REPORTER);

        return (address(registry), address(incidents), address(reporter));
    }
}