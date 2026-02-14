// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { OrbitChainRegistry } from "src/registries/OrbitChainRegistry.sol";
import { IncidentManager } from "src/core/IncidentManager.sol";
import { HealthReporter } from "src/core/HealthReporter.sol";

contract Deploy is Script {
    address constant DEMO_REPORTER = 0xB7cB63B75ffD4ce00C6B7B85e1C59501A338Da3a;

    function run() external returns (address registryAddr, address incidentsAddr, address reporterAddr) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        address registryAddrEnv = vm.envOr("REGISTRY_ADDRESS", address(0));
        OrbitChainRegistry registry;
        if (registryAddrEnv == address(0)) {
            registry = new OrbitChainRegistry();
        } else {
            registry = OrbitChainRegistry(registryAddrEnv);
        }
        IncidentManager incidents = new IncidentManager();
        HealthReporter reporter = new HealthReporter(address(registry), address(incidents), DEMO_REPORTER);

        incidents.setReporterAuthorization(DEMO_REPORTER, true);

        vm.stopBroadcast();

        console2.log("OrbitChainRegistry:", address(registry));
        return (address(registry), address(incidents), address(reporter));
}}