// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "src/governance/MultiSigGovernance.sol";
import "src/governance/Timelock.sol";
import "src/governance/EmergencyPause.sol";
import "src/security/RateLimiter.sol";
import "src/registries/ReporterReputation.sol";
import "src/response/SecureIncidentManager.sol";

/**
 * @title SecurityImplementationTests
 * @dev Comprehensive test suite for all security components
 */
contract SecurityImplementationTests is Test {
    // Test contracts
    MultiSigGovernance multiSig;
    Timelock timelock;
    EmergencyPause emergencyPause;
    RateLimiter rateLimiter;
    ReporterReputation reputation;
    SecureIncidentManager incidentManager;

    // Test accounts
    address admin = address(0x1);
    address signer1 = address(0x2);
    address signer2 = address(0x3);
    address signer3 = address(0x4);
    address reporter = address(0x5);
    address validator = address(0x6);
    address emergency = address(0x7);

    function setUp() public {
        vm.startPrank(admin);

        // Deploy multi-sig governance with 2-of-3 signers
        address[] memory signers = new address[](3);
        signers[0] = signer1;
        signers[1] = signer2;
        signers[2] = signer3;
        multiSig = new MultiSigGovernance(signers, 2);

        // Deploy timelock with 2-day delay
        timelock = new Timelock(address(multiSig), 2 days);

        // Deploy emergency pause
        emergencyPause = new EmergencyPause(address(multiSig));

        // Deploy incident manager first (we'll need its address)
        incidentManager = new SecureIncidentManager();

        // Deploy rate limiter with incident manager
        rateLimiter = new RateLimiter(address(incidentManager));

        // Deploy reputation system with incident manager
        reputation = new ReporterReputation(address(incidentManager));

        // Setup integrations
        incidentManager.setIntegrations(
            address(rateLimiter),
            address(reputation),
            address(emergencyPause),
            address(timelock)
        );

        // Grant roles
        incidentManager.grantRole(
            incidentManager.REPORTER_ROLE(),
            reporter
        );
        incidentManager.grantRole(
            incidentManager.VALIDATOR_ROLE(),
            validator
        );
        incidentManager.grantRole(
            incidentManager.GOVERNANCE_ROLE(),
            address(multiSig)
        );
        incidentManager.grantRole(
            incidentManager.EMERGENCY_ROLE(),
            emergency
        );

        vm.stopPrank();
    }

    // ============ MultiSigGovernance Tests ============

    function test_MultiSigSignerManagement() public {
        vm.prank(admin);
        assert(multiSig.getSignerCount() == 3);
        assert(multiSig.getSigner(0) == signer1);
        assert(multiSig.requiredConfirmations() == 2);
    }

    function test_MultiSigSubmitTransaction() public {
        vm.prank(signer1);
        uint256 txIndex = multiSig.submitTransaction(
            address(incidentManager),
            0,
            new bytes(0)
        );
        assert(txIndex == 0);

        (address target, , , bool executed, ) = multiSig.getTransaction(txIndex);
        assert(target == address(incidentManager));
        assert(!executed);
    }

    function test_MultiSigConfirmAndExecute() public {
        // Submit transaction
        vm.prank(signer1);
        uint256 txIndex = multiSig.submitTransaction(
            address(incidentManager),
            0,
            new bytes(0)
        );

        // First signer confirms
        vm.prank(signer1);
        multiSig.confirmTransaction(txIndex);

        // Second signer confirms
        vm.prank(signer2);
        multiSig.confirmTransaction(txIndex);

        // Execute
        vm.prank(signer1);
        multiSig.executeTransaction(txIndex);

        (, , , bool executed, ) = multiSig.getTransaction(txIndex);
        assert(executed);
    }

    function test_MultiSigRejectWithoutEnoughSignatures() public {
        vm.prank(signer1);
        uint256 txIndex = multiSig.submitTransaction(
            address(incidentManager),
            0,
            new bytes(0)
        );

        vm.prank(signer1);
        multiSig.confirmTransaction(txIndex);

        // Try to execute with only 1 signature (need 2)
        vm.prank(signer1);
        vm.expectRevert("not confirmed");
        multiSig.executeTransaction(txIndex);
    }

    // ============ Timelock Tests ============

    function test_TimelockQueue() public {
        vm.prank(address(multiSig));
        bytes32 txHash = timelock.queueTransaction(
            address(incidentManager),
            0,
            "",
            new bytes(0)
        );

        assert(timelock.isQueued(
            address(incidentManager),
            0,
            "",
            new bytes(0)
        ));
    }

    function test_TimelockCannotExecuteBeforeDelay() public {
        vm.prank(address(multiSig));
        timelock.queueTransaction(
            address(incidentManager),
            0,
            "",
            new bytes(0)
        );

        vm.expectRevert("delay not met");
        timelock.executeTransaction(
            address(incidentManager),
            0,
            "",
            new bytes(0)
        );
    }

    function test_TimelockExecuteAfterDelay() public {
        vm.prank(address(multiSig));
        timelock.queueTransaction(
            address(incidentManager),
            0,
            "",
            new bytes(0)
        );

        // Fast forward 2 days
        vm.warp(block.timestamp + 2 days + 1);

        vm.prank(address(multiSig));
        timelock.executeTransaction(
            address(incidentManager),
            0,
            "",
            new bytes(0)
        );
    }

    // ============ EmergencyPause Tests ============

    function test_AddPauser() public {
        vm.prank(admin);
        emergencyPause.addPauser(emergency, 100);

        assert(emergencyPause.isPauser(emergency) == true);
    }

    function test_SystemPause() public {
        vm.prank(admin);
        emergencyPause.addPauser(emergency, 100);

        vm.prank(emergency);
        emergencyPause.pauseSystem("Critical vulnerability");

        assert(emergencyPause.isPaused());
    }

    function test_SystemAutoUnpause() public {
        vm.prank(admin);
        emergencyPause.addPauser(emergency, 100);

        vm.prank(emergency);
        emergencyPause.pauseSystem("Critical vulnerability");

        // Fast forward 7 days
        vm.warp(block.timestamp + 7 days + 1);

        emergencyPause.autoUnpause();
        assert(!emergencyPause.isPaused());
    }

    function test_FunctionPause() public {
        vm.prank(admin);
        emergencyPause.addPauser(emergency, 100);

        vm.prank(emergency);
        bytes4 reportSelector = bytes4(keccak256("reportIncident(string,uint256,string)"));
        emergencyPause.pauseFunction(
            address(incidentManager),
            reportSelector,
            "Spam detected"
        );

        assert(emergencyPause.isFunctionPaused(
            address(incidentManager),
            reportSelector
        ));
    }

    // ============ RateLimiter Tests ============

    function test_RateLimiterConfiguration() public {
        vm.prank(admin);
        (uint256 max, uint256 window, bool enabled) = rateLimiter.getGlobalLimit();

        assert(max == 10);
        assert(window == 1 days);
        assert(enabled);
    }

    function test_RateLimiterAllowsSubmission() public {
        vm.prank(admin);
        bool allowed = rateLimiter.checkAndRecordSubmission(reporter);
        assert(allowed);

        // Check remaining
        (, , , uint256 remaining) = rateLimiter.getReporterRecord(reporter);
        assert(remaining == 9);
    }

    function test_RateLimiterWhitelist() public {
        vm.prank(admin);
        rateLimiter.whitelistReporter(reporter);

        bool allowed = rateLimiter.checkAndRecordSubmission(reporter);
        assert(allowed);

        // Whitelist allows unlimited
        (, , , uint256 remaining) = rateLimiter.getReporterRecord(reporter);
        assert(remaining == type(uint256).max);
    }

    // ============ ReporterReputation Tests ============

    function test_ReporterJoin() public {
        vm.prank(reporter);
        vm.deal(reporter, 10 ether);
        reputation.joinAsReporter{value: 1 ether}(1 ether);

        (uint256 staked, uint256 rep, , , ) = reputation.getReporterStats(reporter);
        assert(staked == 1 ether);
        assert(rep == 100);
    }

    function test_ReporterAddStake() public {
        vm.prank(reporter);
        vm.deal(reporter, 10 ether);
        reputation.joinAsReporter{value: 1 ether}(1 ether);

        vm.prank(reporter);
        reputation.addStake{value: 1 ether}();

        (uint256 staked, , , , ) = reputation.getReporterStats(reporter);
        assert(staked == 2 ether);
    }

    function test_ReporterValidateReport() public {
        vm.prank(reporter);
        vm.deal(reporter, 10 ether);
        reputation.joinAsReporter{value: 1 ether}(1 ether);

        vm.prank(admin);
        reputation.validateReport(reporter);

        (uint256 staked, uint256 rep, uint256 success, , ) = reputation.getReporterStats(reporter);
        assert(staked == 1 ether);
        assert(rep == 110); // +10 for validation
        assert(success == 1);
    }

    function test_ReporterDisputeReport() public {
        vm.prank(reporter);
        vm.deal(reporter, 10 ether);
        reputation.joinAsReporter{value: 1 ether}(1 ether);

        vm.prank(admin);
        reputation.disputeReport(reporter);

        (uint256 staked, uint256 rep, , uint256 failed, ) = reputation.getReporterStats(reporter);
        // Stake Service Level Agreementshed by 20%
        assert(staked == 0.8 ether);
        // Reputation penalized by 50
        assert(rep == 50);
        assert(failed == 1);
    }

    // ============ SecureIncidentManager Tests ============

    function test_AuthorizeReporter() public {
        vm.prank(admin);
        incidentManager.grantRole(
            incidentManager.GOVERNANCE_ROLE(),
            admin
        );

        vm.prank(admin);
        incidentManager.authorizeReporter(reporter);

        assert(incidentManager.isReporterAuthorized(reporter));
    }

    function test_ReportIncident() public {
        vm.prank(reporter);
        uint256 incidentId = incidentManager.reportIncident(
            "SequencerStall",
            2,
            "Sequencer stopped responding"
        );

        assert(incidentId == 1);

        SecureIncidentManager.Incident memory incident = incidentManager.getIncident(incidentId);
        assert(incident.severity == 2);
        assert(incident.reporter == reporter);
    }

    function test_ValidateIncident() public {
        vm.prank(reporter);
        uint256 incidentId = incidentManager.reportIncident(
            "SequencerStall",
            2,
            "Sequencer stopped responding"
        );

        vm.prank(validator);
        incidentManager.validateIncident(
            incidentId,
            true,
            "Confirmed via monitoring"
        );

        SecureIncidentManager.Incident memory incident = incidentManager.getIncident(incidentId);
        assert(incident.validations == 1);
    }

    function test_ResolveIncident() public {
        vm.prank(reporter);
        uint256 incidentId = incidentManager.reportIncident(
            "SequencerStall",
            2,
            "Sequencer stopped responding"
        );

        vm.prank(admin);
        incidentManager.grantRole(
            incidentManager.GOVERNANCE_ROLE(),
            admin
        );

        vm.prank(admin);
        incidentManager.resolveIncident(incidentId);

        SecureIncidentManager.Incident memory incident = incidentManager.getIncident(incidentId);
        assert(incident.resolved);
    }

    // ============ Integration Tests ============

    function test_EndToEndSecurityFlow() public {
        // 1. Reporter joins reputation system
        vm.prank(reporter);
        vm.deal(reporter, 10 ether);
        reputation.joinAsReporter{value: 1 ether}(1 ether);

        // 2. Reporter submits incident (rate limited, reputation checked)
        vm.prank(reporter);
        uint256 incidentId = incidentManager.reportIncident(
            "BlockLag",
            1,
            "Block lag detected"
        );

        // 3. Validator validates incident
        vm.prank(validator);
        incidentManager.validateIncident(
            incidentId,
            true,
            "Confirmed"
        );

        // 4. Governance resolves
        vm.prank(admin);
        incidentManager.grantRole(
            incidentManager.GOVERNANCE_ROLE(),
            admin
        );

        vm.prank(admin);
        incidentManager.resolveIncident(incidentId);

        // 5. Reporter reputation increased
        vm.prank(admin);
        reputation.validateReport(reporter);

        (uint256 staked, uint256 rep, uint256 success, , ) = reputation.getReporterStats(reporter);
        assert(staked == 1 ether);
        assert(rep > 100);
        assert(success == 1);
    }

    function test_EmergencyPauseBlocksIncidents() public {
        // Setup pause
        vm.prank(admin);
        emergencyPause.addPauser(emergency, 100);

        // Pause system
        vm.prank(emergency);
        emergencyPause.pauseSystem("Critical emergency");

        // Setup reporter for reputation system integration
        vm.prank(reporter);
        vm.deal(reporter, 10 ether);
        reputation.joinAsReporter{value: 1 ether}(1 ether);

        // Try to report (should fail due to pause check)
        vm.prank(reporter);
        vm.expectRevert("system paused");
        incidentManager.reportIncident(
            "Test",
            0,
            "Should fail"
        );
    }
}
