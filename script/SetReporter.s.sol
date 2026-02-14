// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { HealthReporter } from "src/core/HealthReporter.sol";

contract SetReporter is Script {
    function run() external {
        address reporterAddr = 0x4feF295fA8eB6b0A387d2a0Dd397827eF1815a8d;
        address newReporter = vm.envAddress("NEW_REPORTER");
        
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        HealthReporter reporter = HealthReporter(reporterAddr);
        
        console2.log("Current reporter:", reporter.reporter());
        console2.log("Setting new reporter to:", newReporter);
        
        reporter.setReporter(newReporter);
        
        console2.log("Reporter updated successfully!");

        vm.stopBroadcast();
    }
}
