// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/core/HealthMonitor.sol";
import "../src/core/HealthReporter.sol";
import "../src/registries/OrbitChainRegistry.sol";
import "../src/response/SecureIncidentManager.sol";

contract SimpleDeployment is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // Deploy OrbitChainRegistry first
        OrbitChainRegistry registry = new OrbitChainRegistry();
        console.log("OrbitChainRegistry deployed at:", address(registry));

        // Deploy SecureIncidentManager
        SecureIncidentManager incidentManager = new SecureIncidentManager();
        console.log("SecureIncidentManager deployed at:", address(incidentManager));

        // Deploy HealthMonitor with registry
        HealthMonitor healthMonitor = new HealthMonitor(address(registry));
        console.log("HealthMonitor deployed at:", address(healthMonitor));

        // Deploy HealthReporter with all three addresses
        HealthReporter healthReporter = new HealthReporter(
            address(registry),
            address(incidentManager),
            msg.sender  // reporter address is the deployer
        );
        console.log("HealthReporter deployed at:", address(healthReporter));

        vm.stopBroadcast();

        // Write addresses to file
        string memory addresses = string(abi.encodePacked(
            '{"registry":"', vm.toString(address(registry)),
            '","incidentManager":"', vm.toString(address(incidentManager)),
            '","healthMonitor":"', vm.toString(address(healthMonitor)),
            '","healthReporter":"', vm.toString(address(healthReporter)),
            '"}'
        ));
        
        vm.writeFile("deployment-addresses.json", addresses);
        console.log("Addresses saved to deployment-addresses.json");
    }
}
