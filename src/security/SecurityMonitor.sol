// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SecurityMonitor
 * @dev Monitoring &auditing utilities for the security system
 * Tracks events, enforces invariants, &provides system health metrics
 */

interface ISecurityComponent {
    function isPaused() external view returns (bool);
}

contract SecurityMonitor {
    // Monitoring structures
    struct SystemMetrics {
        uint256 totalIncidents;
        uint256 reportersActive;
        uint256 reportersBanned;
        uint256 averageReputation;
        uint256 totalStaked;
        uint256 systemPausedUntil;
        bool isSystemHealthy;
    }

    struct ReporterMetrics {
        address reporter;
        uint256 totalReports;
        uint256 approvedReports;
        uint256 disputedReports;
        uint256 currentReputation;
        uint256 currentStake;
        uint256 lastReportTime;
        bool isActive;
    }

    struct SecurityEvent {
        uint256 timestamp;
        string eventType;
        address actor;
        string details;
    }

    // State variables
    address public owner;
    address public incidentManager;
    address public reputationSystem;
    address public emergencyPause;

    SecurityEvent[] public auditLog;
    mapping(address => uint256) public reporterIncidentCount;
    mapping(address => uint256) public reporterLastReportTime;

    // Thresholds for health monitoring
    uint256 public minHealthyReporters = 5;
    uint256 public maxPauseDurationDays = 7;
    uint256 public minAverageReputationScore = 50;

    // Events
    event SystemHealthAlert(string severity, string message);
    event AuditLogEntry(uint256 indexed timestamp, string eventType, address indexed actor);
    event MetricsCalculated(uint256 totalIncidents, uint256 activeReporters);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Set addresses of other security components
     */
    function setComponentAddresses(
        address _incidentManager,
        address _reputationSystem,
        address _emergencyPause
    ) external onlyOwner {
        incidentManager = _incidentManager;
        reputationSystem = _reputationSystem;
        emergencyPause = _emergencyPause;
    }

    /**
     * @dev Log a security event to audit trail
     */
    function logSecurityEvent(
        string memory eventType,
        address actor,
        string memory details
    ) public {
        require(msg.sender == incidentManager || msg.sender == owner, "unauthorized");

        auditLog.push(
            SecurityEvent({
                timestamp: block.timestamp,
                eventType: eventType,
                actor: actor,
                details: details
            })
        );

        emit AuditLogEntry(block.timestamp, eventType, actor);
    }

    /**
     * @dev Record a reporter's incident submission
     */
    function recordReporterIncident(address reporter) external {
        require(msg.sender == incidentManager, "only manager");

        reporterIncidentCount[reporter] += 1;
        reporterLastReportTime[reporter] = block.timestamp;
    }

    /**
     * @dev Get system health status
     */
    function getSystemHealth() external view returns (
        bool isHealthy,
        uint256 healthScore,
        string memory status
    ) {
        // Check if system is paused
        bool paused = _isSystemPaused();

        // Calculate health based on multiple factors
        uint256 score = 100;

        if (paused) {
            score -= 50; // Major issue if paused
        }

        // Additional health factors can be added here

        isHealthy = score >= 75;

        if (score >= 90) {
            status = "EXCELLENT";
        } else if (score >= 75) {
            status = "GOOD";
        } else if (score >= 50) {
            status = "DEGRADED";
        } else {
            status = "CRITICAL";
        }

        return (isHealthy, score, status);
    }

    /**
     * @dev Get audit log entry
     */
    function getAuditLogEntry(uint256 index)
        external
        view
        returns (SecurityEvent memory)
    {
        require(index < auditLog.length, "invalid index");
        return auditLog[index];
    }

    /**
     * @dev Get audit log length
     */
    function getAuditLogLength() external view returns (uint256) {
        return auditLog.length;
    }

    /**
     * @dev Get reporter metrics
     */
    function getReporterMetrics(address reporter)
        external
        view
        returns (ReporterMetrics memory metrics)
    {
        metrics.reporter = reporter;
        metrics.totalReports = reporterIncidentCount[reporter];
        metrics.lastReportTime = reporterLastReportTime[reporter];
        // Additional metrics would come from reputation &incident systems
    }

    /**
     * @dev Raise a health alert
     */
    function raiseHealthAlert(string calldata severity, string calldata message)
        external
        onlyOwner
    {
        emit SystemHealthAlert(severity, message);
        logSecurityEvent("HEALTH_ALERT", msg.sender, string(message));
    }

    /**
     * @dev Set health monitoring thresholds
     */
    function setHealthThresholds(
        uint256 _minReporters,
        uint256 _maxPauseDays,
        uint256 _minReputation
    ) external onlyOwner {
        minHealthyReporters = _minReporters;
        maxPauseDurationDays = _maxPauseDays;
        minAverageReputationScore = _minReputation;
    }

    // Internal functions
    function _isSystemPaused() internal view returns (bool) {
        if (emergencyPause == address(0)) {
            return false;
        }
        try ISecurityComponent(emergencyPause).isPaused() returns (bool paused) {
            return paused;
        } catch {
            return false;
        }
    }
}
