// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "src/response/SecureHealthReporter.sol";

contract SimulateSecuredHealth is Script {
    function run() external {
        uint256 reporterKey = vm.envUint("PRIVATE_KEY");
        
        address secureReporterAddr = 0x7a5e0237E45574727aA4352244B1f72559BbA229;
        SecureHealthReporter reporter = SecureHealthReporter(secureReporterAddr);
        
        vm.startBroadcast(reporterKey);

        console.log("Submitting healthy signal for chain 421614...");
        // Submit healthy signal
        try reporter.submitHealthSignal(
            421614, // chainId
            block.number,
            block.timestamp,
            100, // sequencerNumber
            true, // sequencerHealthy
            50, // l1BatchNumber
            block.timestamp,
            true, // bridgeHealthy
            "All systems operational"
        ) {
            console.log("Healthy signal submitted successfully.");
        } catch Error(string memory reason) {
            console.log("Failed to submit healthy signal:", reason);
        }

        vm.stopBroadcast();
    }
}
