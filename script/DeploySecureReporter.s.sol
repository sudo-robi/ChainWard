// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "src/response/SecureHealthReporter.sol";
import "src/response/SecureIncidentManager.sol";

contract DeploySecureReporter is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        // Addresses from config/contracts.json
        address registry = 0x5dF982674c638D38d16cB9D1d6d07fC3d93BfBe4;
        address incidentManagerAddr = 0x926e9c2885B7a75BDe8baeBa8d9738Aa28aA4DdB;
        SecureIncidentManager incidentManager = SecureIncidentManager(incidentManagerAddr);

        vm.startBroadcast(deployerPrivateKey);

        console.log("Deploying SecureHealthReporter with deployer:", deployer);
        console.log("Registry:", registry);
        console.log("IncidentManager:", incidentManagerAddr);

        SecureHealthReporter reporter = new SecureHealthReporter(
            registry,
            incidentManagerAddr,
            deployer // Initial reporter is the deployer
        );

        console.log("SecureHealthReporter deployed at:", address(reporter));

        // Authorize the new reporter contract in IncidentManager
        console.log("Authorizing SecureHealthReporter...");
        try incidentManager.authorizeReporter(address(reporter)) {
             console.log("Successfully authorized SecureHealthReporter in IncidentManager");
        } catch Error(string memory reason) {
             console.log("Failed to authorize reporter:", reason);
        } catch {
             console.log("Failed to authorize reporter (unknown error)");
        }

        vm.stopBroadcast();
    }
}
