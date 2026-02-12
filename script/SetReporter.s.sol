// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { HealthReporter } from "../src/HealthReporter.sol";

contract SetReporter is Script {
    function run() external {
        address reporterAddr = 0x4feF295fA8eB6b0A387d2a0Dd397827eF1815a8d;
        address newReporter = vm.envAddress("NEW_REPORTER");
        
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        HealthReporter reporter = HealthReporter(reporterAddr);
        
        console.log("Current reporter:", reporter.reporter());
        console.log("Setting new reporter to:", newReporter);
        
        reporter.setReporter(newReporter);
        
        console.log("Reporter updated successfully!");

        vm.stopBroadcast();
    }
}
