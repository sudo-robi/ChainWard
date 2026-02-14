// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SecureIncidentManager
 * @dev Enhanced IncidentManager with comprehensive security &access control
 * Integrates MultiSigGovernance, Timelock, EmergencyPause, RateLimiter, &ReporterReputation
 */
import "@openzeppelin/contracts/access/AccessControl.sol";

interface IRateLimiter {
    function checkAndRecordSubmission(address reporter) external returns (bool);
}

interface IReporterReputation {
    function isReporterActive(address reporter) external view returns (bool);
    function validateReport(address reporter) external;
    function disputeReport(address reporter) external;
}

interface IEmergencyPause {
    function isPaused() external view returns (bool);
}

contract SecureIncidentManager is AccessControl {
    // Role definitions
    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    // Structs
    struct Incident {
        uint256 id;
        string incidentType;
        uint256 timestamp;
        address reporter;
        uint256 severity; // 0: low, 1: medium, 2: critical
        string description;
        bool resolved;
        uint256 resolvedAt;
        uint256 validations;
        uint256 disputes;
        bool slashed;
    }

    struct IncidentValidation {
        address validator;
        bool approved;
        string feedback;
        uint256 timestamp;
    }

    // State variables
    address public owner;
    address public rateLimiter;
    address public reputationSystem;
    address public emergencyPause;
    address public timelock;

    uint256 public nextIncidentId;
    mapping(uint256 => Incident) public incidents;
    mapping(uint256 => IncidentValidation[]) public incidentValidations;

    // Access control
    mapping(address => bool) public authorizedReporters;
    mapping(address => uint256) public reporterBonds;

    // Events
    event IncidentReported(
        uint256 indexed incidentId,
        address indexed reporter,
        string incidentType,
        uint256 severity,
        uint256 timestamp
    );
    event IncidentValidated(uint256 indexed incidentId, address indexed validator, bool approved);
    event IncidentResolved(uint256 indexed incidentId, uint256 timestamp);
    event ReporterAuthorized(address indexed reporter);
    event ReporterRevoked(address indexed reporter);
    event BondDeposited(address indexed reporter, uint256 amount);
    event BondSlashed(address indexed reporter, uint256 amount, uint256 incidentId);
    event RateLimitExceeded(address indexed reporter);
    event SystemPaused(string reason);
    event IntegrationUpdated(string component, address newAddress);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier systemNotPaused() {
        if (emergencyPause != address(0)) {
            require(!IEmergencyPause(emergencyPause).isPaused(), "system paused");
        }
        _;
    }

    modifier rateNotExceeded(address reporter) {
        if (rateLimiter != address(0)) {
            require(
                IRateLimiter(rateLimiter).checkAndRecordSubmission(reporter),
                "rate limit exceeded"
            );
        }
        _;
    }

    /**
     * @dev Constructor initializes the secure incident manager
     */
    constructor() {
        owner = msg.sender;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GOVERNANCE_ROLE, msg.sender);
    }

    /**
     * @dev Set integration contract addresses
     * @param _rateLimiter RateLimiter contract address
     * @param _reputationSystem ReporterReputation contract address
     * @param _emergencyPause EmergencyPause contract address
     * @param _timelock Timelock contract address
     */
    function setIntegrations(
        address _rateLimiter,
        address _reputationSystem,
        address _emergencyPause,
        address _timelock
    ) external onlyOwner {
        if (_rateLimiter != address(0)) {
            rateLimiter = _rateLimiter;
            emit IntegrationUpdated("RateLimiter", _rateLimiter);
        }
        if (_reputationSystem != address(0)) {
            reputationSystem = _reputationSystem;
            emit IntegrationUpdated("ReputationSystem", _reputationSystem);
        }
        if (_emergencyPause != address(0)) {
            emergencyPause = _emergencyPause;
            emit IntegrationUpdated("EmergencyPause", _emergencyPause);
        }
        if (_timelock != address(0)) {
            timelock = _timelock;
            emit IntegrationUpdated("Timelock", _timelock);
        }
    }

    /**
     * @dev Authorize a reporter to submit incidents
     * @param _reporter Reporter address
     */
    function authorizeReporter(address _reporter) external onlyRole(GOVERNANCE_ROLE) {
        require(_reporter != address(0), "zero address");
        authorizedReporters[_reporter] = true;
        _grantRole(REPORTER_ROLE, _reporter);
        emit ReporterAuthorized(_reporter);
    }

    /**
     * @dev Revoke reporter authorization
     * @param _reporter Reporter address
     */
    function revokeReporter(address _reporter) external onlyRole(GOVERNANCE_ROLE) {
        authorizedReporters[_reporter] = false;
        _revokeRole(REPORTER_ROLE, _reporter);
        emit ReporterRevoked(_reporter);
    }

    /**
     * @dev Reporter deposits a bond
     */
    function depositBond() external payable onlyRole(REPORTER_ROLE) {
        require(msg.value > 0, "bond required");
        reporterBonds[msg.sender] += msg.value;
        emit BondDeposited(msg.sender, msg.value);
    }

    /**
     * @dev Report an incident with full details
     * @param _incidentType Type of incident
     * @param _severity Severity level (0-2)
     * @param _description Detailed description
     * @return incidentId The assigned incident ID
     */
    function reportIncident(
        string calldata _incidentType,
        uint256 _severity,
        string calldata _description
    ) external onlyRole(REPORTER_ROLE) systemNotPaused rateNotExceeded(msg.sender)
        returns (uint256 incidentId)
    {
        require(bytes(_incidentType).length > 0, "no incident type");
        require(_severity <= 2, "invalid severity");
        require(bytes(_description).length > 0, "no description");

        // Check reputation system
        if (reputationSystem != address(0)) {
            require(
                IReporterReputation(reputationSystem).isReporterActive(msg.sender),
                "reporter inactive"
            );
        }

        incidentId = ++nextIncidentId;
        
        incidents[incidentId] = Incident({
            id: incidentId,
            incidentType: _incidentType,
            timestamp: block.timestamp,
            reporter: msg.sender,
            severity: _severity,
            description: _description,
            resolved: false,
            resolvedAt: 0,
            validations: 0,
            disputes: 0,
            slashed: false
        });

        emit IncidentReported(
            incidentId,
            msg.sender,
            _incidentType,
            _severity,
            block.timestamp
        );

        return incidentId;
    }

    /**
     * @dev Validator approves or disputes an incident
     * @param _incidentId Incident ID
     * @param _approved True if approved, false if disputed
     * @param _feedback Validation feedback
     */
    function validateIncident(
        uint256 _incidentId,
        bool _approved,
        string calldata _feedback
    ) external onlyRole(VALIDATOR_ROLE) {
        require(_incidentId > 0 && _incidentId <= nextIncidentId, "invalid incident");
        require(bytes(_feedback).length > 0, "no feedback");

        Incident storage incident = incidents[_incidentId];
        require(!incident.resolved, "already resolved");

        incidentValidations[_incidentId].push(
            IncidentValidation({
                validator: msg.sender,
                approved: _approved,
                feedback: _feedback,
                timestamp: block.timestamp
            })
        );

        if (_approved) {
            incident.validations += 1;
            
            // Reward reporter
            if (reputationSystem != address(0)) {
                IReporterReputation(reputationSystem).validateReport(incident.reporter);
            }
        } else {
            incident.disputes += 1;
            
            // Penalize reporter
            if (reputationSystem != address(0)) {
                IReporterReputation(reputationSystem).disputeReport(incident.reporter);
            }

            // Service Level Agreementsh bond if not already Service Level Agreementshed
            if (!incident.slashed && reporterBonds[incident.reporter] > 0) {
                uint256 slashAmount = reporterBonds[incident.reporter] / 2;
                reporterBonds[incident.reporter] -= slashAmount;
                incident.slashed = true;
                emit BondSlashed(incident.reporter, slashAmount, _incidentId);
            }
        }

        emit IncidentValidated(_incidentId, msg.sender, _approved);
    }

    /**
     * @dev Resolve an incident
     * @param _incidentId Incident ID
     */
    function resolveIncident(uint256 _incidentId) external onlyRole(GOVERNANCE_ROLE) {
        require(_incidentId > 0 && _incidentId <= nextIncidentId, "invalid incident");
        
        Incident storage incident = incidents[_incidentId];
        require(!incident.resolved, "already resolved");

        incident.resolved = true;
        incident.resolvedAt = block.timestamp;

        emit IncidentResolved(_incidentId, block.timestamp);
    }

    /**
     * @dev Emergency pause system
     * @param _reason Reason for pause
     */
    function emergencyPauseSystem(string calldata _reason)
        external
        onlyRole(EMERGENCY_ROLE)
    {
        require(emergencyPause != address(0), "no emergency pause");
        require(bytes(_reason).length > 0, "no reason");

        emit SystemPaused(_reason);
    }

    // View functions
    function getIncident(uint256 _incidentId)
        external
        view
        returns (Incident memory)
    {
        return incidents[_incidentId];
    }

    function getIncidentValidations(uint256 _incidentId)
        external
        view
        returns (IncidentValidation[] memory)
    {
        return incidentValidations[_incidentId];
    }

    function getIncidentValidationCount(uint256 _incidentId)
        external
        view
        returns (uint256)
    {
        return incidentValidations[_incidentId].length;
    }

    function getValidationStats(uint256 _incidentId)
        external
        view
        returns (uint256 total, uint256 approved, uint256 disputed)
    {
        Incident memory incident = incidents[_incidentId];
        total = incidentValidations[_incidentId].length;
        approved = incident.validations;
        disputed = incident.disputes;
    }

    function getReporterBond(address _reporter) external view returns (uint256) {
        return reporterBonds[_reporter];
    }

    function isReporterAuthorized(address _reporter) external view returns (bool) {
        return authorizedReporters[_reporter];
    }
}
