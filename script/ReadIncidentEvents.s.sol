// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "src/core/IncidentManager.sol";

contract ReadIncidentEvents is Script {
    function run() external view {
        IncidentManager manager = IncidentManager(vm.envAddress("INCIDENT_MANAGER_ADDRESS"));
        uint256 count = manager.getIncidentCount();
        
        for (uint256 i = 0; i < count; i++) {
            IncidentManager.Incident memory incident = manager.getIncident(i);
            console.log("Incident ID:", i);
            console.log("Chain ID:", incident.chainId);
            console.log("Detected At:", incident.detectedAt);
            console.log("Severity:", uint256(incident.severity));
        }
    }
}
