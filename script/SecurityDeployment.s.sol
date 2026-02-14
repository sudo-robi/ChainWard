// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SecurityDeployment
 * @dev Deployment script for all security contracts
 * Run with: forge script script/SecurityDeployment.s.sol:SecurityDeployment --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
 */

import "forge-std/Script.sol";
import "src/governance/MultiSigGovernance.sol";
import "src/governance/Timelock.sol";
import "src/governance/EmergencyPause.sol";
import "src/security/RateLimiter.sol";
import "src/registries/ReporterReputation.sol";
import "src/response/SecureIncidentManager.sol";

contract SecurityDeployment is Script {
    // Configuration (update these for your deployment)
    address[] signers;
    uint256 requiredConfirmations = 2;
    uint256 timelockDelay = 2 days;
    
    // Emergency responders
    address emergencyResponder;
    uint256 emergencyResponderWeight = 100;

    // Deployed contracts (for reference)
    MultiSigGovernance multiSig;
    Timelock timelock;
    EmergencyPause emergencyPause;
    RateLimiter rateLimiter;
    ReporterReputation reputation;
    SecureIncidentManager incidentManager;

    function setUp() external {
        // Add your signers here (using test addresses)
        signers.push(0x1234567890123456789012345678901234567890); // Signer 1
        signers.push(0x0987654321098765432109876543210987654321); // Signer 2
        signers.push(0x2222222222222222222222222222222222222222); // Signer 3

        // Set emergency responder (use valid address)
        emergencyResponder = address(0x1111111111111111111111111111111111111111);
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        console.log("=== ChainWard Security Stack Deployment ===");

        // 1. Deploy MultiSigGovernance
        console.log("\n1. Deploying MultiSigGovernance...");
        multiSig = new MultiSigGovernance(signers, requiredConfirmations);
        console.log("   MultiSigGovernance deployed at:", address(multiSig));

        // 2. Deploy Timelock
        console.log("\n2. Deploying Timelock...");
        timelock = new Timelock(address(multiSig), timelockDelay);
        console.log("   Timelock deployed at:", address(timelock));
        console.log("   Delay:", timelockDelay / 1 days, "days");

        // 3. Deploy EmergencyPause
        console.log("\n3. Deploying EmergencyPause...");
        emergencyPause = new EmergencyPause(address(multiSig));
        console.log("   EmergencyPause deployed at:", address(emergencyPause));

        // 4. Add emergency responder
        console.log("\n   Adding emergency responder...");
        emergencyPause.addPauser(emergencyResponder, emergencyResponderWeight);
        console.log("   Emergency responder added:", emergencyResponder);

        // 5. Deploy RateLimiter
        console.log("\n4. Deploying RateLimiter...");
        rateLimiter = new RateLimiter(address(0)); // Manager will be set later
        console.log("   RateLimiter deployed at:", address(rateLimiter));

        // 6. Deploy ReporterReputation
        console.log("\n5. Deploying ReporterReputation...");
        reputation = new ReporterReputation(address(0)); // Manager will be set later
        console.log("   ReporterReputation deployed at:", address(reputation));

        // 7. Deploy SecureIncidentManager
        console.log("\n6. Deploying SecureIncidentManager...");
        incidentManager = new SecureIncidentManager();
        console.log("   SecureIncidentManager deployed at:", address(incidentManager));

        // 8. Setup integrations
        console.log("\n7. Setting up integrations...");
        incidentManager.setIntegrations(
            address(rateLimiter),
            address(reputation),
            address(emergencyPause),
            address(timelock)
        );
        console.log("   Integrations configured");

        // 9. Configure RateLimiter
        console.log("\n8. Configuring RateLimiter...");
        rateLimiter.setGlobalLimit(10, 1 days);
        console.log("   Global limit: 10 submissions per day");

        // 10. Configure ReputationSystem
        console.log("\n9. Configuring ReporterReputation...");
        reputation.setReputationParameters(10, 50); // +10 for accurate, -50 for false
        reputation.setSlashingPercentage(20); // 20% slashing
        console.log("   Reputation parameters configured");

        // 11. Setup roles in IncidentManager
        console.log("\n10. Setting up access control...");
        bytes32 governanceRole = incidentManager.GOVERNANCE_ROLE();
        bytes32 emergencyRole = incidentManager.EMERGENCY_ROLE();
        
        incidentManager.grantRole(governanceRole, address(multiSig));
        incidentManager.grantRole(emergencyRole, emergencyResponder);
        console.log("   Roles configured");

        vm.stopBroadcast();

        // Print summary
        printDeploymentSummary();
    }

    function printDeploymentSummary() internal view {
        console.log("========== ChainWard Security Stack Deployment Summary ==========");
        console.log("Contract Addresses:");
        console.log("------------------------------------------");
        console.log("MultiSigGovernance:       ", address(multiSig));
        console.log("Timelock:                 ", address(timelock));
        console.log("EmergencyPause:           ", address(emergencyPause));
        console.log("RateLimiter:              ", address(rateLimiter));
        console.log("ReporterReputation:       ", address(reputation));
        console.log("SecureIncidentManager:    ", address(incidentManager));
        console.log("------------------------------------------");
        console.log("Configuration:");
        console.log("------------------------------------------");
        console.log("Multi-Sig Signers:        ", _uint256ToString(signers.length));
        console.log("Required Confirmations:   ", _uint256ToString(requiredConfirmations));
        console.log("Timelock Delay:           2 days");
        console.log("Rate Limit:               10 submissions/day");
        console.log("Initial Rep:              100 points");
        console.log("Max Rep:                  1000 points");
        console.log("===============================================");

        console.log("\nNext Steps:");
        console.log("1. Verify all contracts are deployed correctly");
        console.log("2. Run integration tests: forge test");
        console.log("3. Add trusted reporters to the system");
        console.log("4. Configure rate limits for each reporter");
        console.log("5. Initialize governance voting");
    }

    function _uint256ToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
