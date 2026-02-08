// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import { OrbitChainRegistry } from "../src/OrbitChainRegistry.sol";
import { IncidentManager } from "../src/IncidentManager.sol";
import { HealthReporter } from "../src/HealthReporter.sol";

contract Deploy is Script {
    function run() external returns (address registryAddr, address incidentsAddr, address reporterAddr) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        OrbitChainRegistry registry = new OrbitChainRegistry();
        IncidentManager incidents = new IncidentManager();
        address reporterKey = address(uint160(uint256(keccak256(abi.encodePacked("reporter")))));
        HealthReporter reporter = new HealthReporter(address(registry), address(incidents), reporterKey);

        vm.stopBroadcast();

        console.log("OrbitChainRegistry:", address(registry));
        console.log("IncidentManager:", address(incidents));
        console.log("HealthReporter:", address(reporter));

        return (address(registry), address(incidents), address(reporter));
    }
}
