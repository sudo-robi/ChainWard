// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "src/security/SecurityMonitor.sol";
import "src/governance/GovernanceHelper.sol";
import "src/governance/MultiSigGovernance.sol";
import "src/governance/Timelock.sol";
import "src/security/RateLimiter.sol";

/**
 * @title GovernanceIntegrationTests
 * @dev Tests for governance utilities &security monitoring
 */
contract GovernanceIntegrationTests is Test {
    SecurityMonitor monitor;
    GovernanceHelper helper;
    MultiSigGovernance multiSig;
    Timelock timelock;
    RateLimiter rateLimiter;

    address admin = address(0x1);
    address signer1 = address(0x2);
    address signer2 = address(0x3);
    address signer3 = address(0x4);

    function setUp() public {
        vm.startPrank(admin);

        // Deploy multi-sig
        address[] memory signers = new address[](3);
        signers[0] = signer1;
        signers[1] = signer2;
        signers[2] = signer3;
        multiSig = new MultiSigGovernance(signers, 2);

        // Deploy timelock
        timelock = new Timelock(address(multiSig), 2 days);

        // Deploy rate limiter with admin as manager (for testing)
        rateLimiter = new RateLimiter(admin);

        // Deploy monitor
        monitor = new SecurityMonitor();

        // Deploy helper
        helper = new GovernanceHelper(address(multiSig), address(timelock));

        vm.stopPrank();
    }

    // ============ SecurityMonitor Tests ============

    function test_MonitorLogsSecurityEvent() public {
        vm.prank(admin);
        monitor.logSecurityEvent(
            "INCIDENT_REPORTED",
            address(0x123),
            "Test incident"
        );

        assert(monitor.getAuditLogLength() == 1);
        
        SecurityMonitor.SecurityEvent memory evt = monitor.getAuditLogEntry(0);
        assert(keccak256(bytes(evt.eventType)) == keccak256(bytes("INCIDENT_REPORTED")));
        assert(evt.actor == address(0x123));
    }

    function test_MonitorRecordsReporterIncident() public {
        address reporter = address(0x5);
        
        vm.prank(admin);
        monitor.recordReporterIncident(reporter);

        // Note: recordReporterIncident can be called by owner or manager
        // This test shows the recording mechanism
    }

    function test_MonitorHealthStatus() public {
        (bool healthy, uint256 score, ) = monitor.getSystemHealth();

        assert(healthy); // Should be healthy initially
        assert(score >= 75);
    }

    function test_MonitorSetThresholds() public {
        vm.prank(admin);
        monitor.setHealthThresholds(10, 7, 50);

        // Thresholds updated
    }

    // ============ GovernanceHelper Tests ============

    function test_HelperProposeRateLimit() public {
        vm.prank(admin);
        uint256 txIndex = helper.proposeSetRateLimit(
            address(rateLimiter),
            20,
            2 days,
            "Increase rate limit"
        );

        assert(txIndex == 0);
    }

    function test_HelperConfirmAction() public {
        // Submit proposal
        vm.prank(admin);
        uint256 txIndex = helper.proposeSetRateLimit(
            address(rateLimiter),
            20,
            2 days,
            "Test proposal"
        );

        // Signers confirm
        vm.prank(signer1);
        helper.confirmGovernanceAction(txIndex);

        vm.prank(signer2);
        helper.confirmGovernanceAction(txIndex);

        // Verify confirmations
        (
            ,
            ,
            ,
            ,
            uint256 confirmations
        ) = multiSig.getTransaction(txIndex);

        assert(confirmations == 2);
    }

    function test_HelperGetPendingTransactions() public {
        // Submit proposals
        vm.prank(admin);
        helper.proposeSetRateLimit(
            address(rateLimiter),
            20,
            2 days,
            "Proposal 1"
        );

        vm.prank(admin);
        helper.proposeSetRateLimit(
            address(rateLimiter),
            30,
            3 days,
            "Proposal 2"
        );

        uint256[] memory pending = helper.getPendingMultiSigTransactions();
        assert(pending.length == 2);
    }

    function test_HelperGetTransactionDetails() public {
        vm.prank(admin);
        uint256 txIndex = helper.proposeSetRateLimit(
            address(rateLimiter),
            20,
            2 days,
            "Test"
        );

        (
            address target,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 confirmations
        ) = helper.getMultiSigTransactionDetails(txIndex);

        assert(target == address(rateLimiter));
        assert(value == 0);
        assert(!executed);
        assert(confirmations == 0);
    }

    // ============ Integration Tests ============

    function test_EndToEndGovernanceFlow() public {
        // 1. Propose action via helper
        vm.prank(admin);
        uint256 txIndex = helper.proposeSetRateLimit(
            address(rateLimiter),
            20,
            2 days,
            "Increase rate limit to 20/day"
        );

        // 2. Get pending transactions
        uint256[] memory pending = helper.getPendingMultiSigTransactions();
        assert(pending.length >= 1);

        // 3. Signers confirm
        vm.prank(signer1);
        helper.confirmGovernanceAction(txIndex);

        vm.prank(signer2);
        helper.confirmGovernanceAction(txIndex);

        // 4. Execute
        vm.prank(signer3);
        helper.executeGovernanceAction(txIndex);

        // 5. Verify execution
        (
            ,
            ,
            ,
            bool executed,

        ) = multiSig.getTransaction(txIndex);

        assert(executed);
    }

    function test_MonitoringIntegration() public {
        // Monitor records governance action
        vm.prank(admin);
        monitor.logSecurityEvent(
            "GOVERNANCE_ACTION",
            signer1,
            "Rate limit changed"
        );

        // Monitor tracks metrics
        vm.prank(admin);
        monitor.recordReporterIncident(address(0x5));

        // Monitor provides health status
        (bool healthy, uint256 score, ) = monitor.getSystemHealth();
        assert(healthy && score > 0);
    }

    function test_AuditTrail() public {
        // Log multiple events
        vm.prank(admin);
        monitor.logSecurityEvent("EVENT_1", address(0x1), "First event");

        vm.prank(admin);
        monitor.logSecurityEvent("EVENT_2", address(0x2), "Second event");

        vm.prank(admin);
        monitor.logSecurityEvent("EVENT_3", address(0x3), "Third event");

        // Verify audit log
        uint256 length = monitor.getAuditLogLength();
        assert(length == 3);

        SecurityMonitor.SecurityEvent memory evt1 = monitor.getAuditLogEntry(0);
        SecurityMonitor.SecurityEvent memory evt2 = monitor.getAuditLogEntry(1);
        SecurityMonitor.SecurityEvent memory evt3 = monitor.getAuditLogEntry(2);

        assert(keccak256(bytes(evt1.eventType)) == keccak256(bytes("EVENT_1")));
        assert(keccak256(bytes(evt2.eventType)) == keccak256(bytes("EVENT_2")));
        assert(keccak256(bytes(evt3.eventType)) == keccak256(bytes("EVENT_3")));
    }
}
