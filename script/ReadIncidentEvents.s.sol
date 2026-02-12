// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../contracts/IncidentManager.sol";

contract ReadIncidentEvents is Script {
    function run() external view returns (uint256[] memory ids, string[] memory types, uint256[] memory times, address[] memory reporters) {
        IncidentManager manager = IncidentManager(vm.envAddress("INCIDENT_MANAGER_ADDRESS"));
        uint256 count = manager.nextIncidentId();
        ids = new uint256[](count);
        types = new string[](count);
        times = new uint256[](count);
        reporters = new address[](count);
        for (uint256 i = 1; i <= count; i++) {
            (uint256 id, string memory t, uint256 ts, address r) = manager.getIncident(i);
            ids[i-1] = id;
            types[i-1] = t;
            times[i-1] = ts;
            reporters[i-1] = r;
        }
    }
}
