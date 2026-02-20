// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "src/response/AutomatedRunbook.sol";
import "src/response/WorkflowExecutor.sol";
import "src/response/ResponseAction.sol";

/**
 * @title IncidentResponseOrchestrator
 * @notice Orchestrates automated response to incidents detected by SecureIncidentManager
 * @dev Bridges incident detection with runbook execution
 */
contract IncidentResponseOrchestrator is AccessControl {
    bytes32 public constant ORCHESTRATOR_ADMIN = keccak256("ORCHESTRATOR_ADMIN");
    bytes32 public constant INCIDENT_MANAGER = keccak256("INCIDENT_MANAGER");

    struct IncidentResponse {
        uint256 incidentId;
        string incidentType;
        uint256 detectionTime;
        uint256 responseStartTime;
        uint256 responseCompleteTime;
        bool autoResponded;
        uint256 executionPlanId;
        uint256 workflowExecutionId;
        string responseStatus; // "pending", "executing", "completed", "failed"
        string responseDetails;
    }

    struct ResponsePolicy {
        string incidentType;
        bool autoRespond;
        uint256 maxResponseTime;
        uint256[] applicableRunbookIds;
        uint256[] applicableActionIds;
        uint256 escalationThreshold;
        bool requiresApproval;
    }

    // State variables
    mapping(uint256 => IncidentResponse) public incidentResponses;
    mapping(string => ResponsePolicy) public responsePolicies;
    
    AutomatedRunbook public runbookManager;
    WorkflowExecutor public workflowExecutor;
    ResponseAction public actionManager;

    uint256 public totalResponsesTriggered;
    uint256 public successfulAutoResponses;
    uint256 public failedAutoResponses;

    // Events
    event ResponsePolicyConfigured(
        string indexed incidentType,
        bool autoRespond,
        uint256 runbookCount,
        uint256 actionCount
    );

    event IncidentResponseTriggered(
        uint256 indexed incidentId,
        string incidentType,
        uint256 executionPlanId,
        bool autoRespond
    );

    event ResponseStarted(
        uint256 indexed incidentId,
        uint256 indexed executionPlanId
    );

    event ResponseCompleted(
        uint256 indexed incidentId,
        bool success,
        uint256 duration,
        string details
    );

    event ResponseEscalated(
        uint256 indexed incidentId,
        string reason
    );

    event AutoResponseDisabled(
        uint256 indexed incidentId,
        string reason
    );

    modifier onlyAdmin() {
        require(hasRole(ORCHESTRATOR_ADMIN, msg.sender), "not admin");
        _;
    }

    modifier onlyIncidentManager() {
        require(hasRole(INCIDENT_MANAGER, msg.sender), "not incident manager");
        _;
    }

    constructor(
        address _runbookManager,
        address _workflowExecutor,
        address _actionManager
    ) {
        require(_runbookManager != address(0), "invalid runbook manager");
        require(_workflowExecutor != address(0), "invalid executor");
        require(_actionManager != address(0), "invalid action manager");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORCHESTRATOR_ADMIN, msg.sender);
        _grantRole(INCIDENT_MANAGER, msg.sender);

        runbookManager = AutomatedRunbook(_runbookManager);
        workflowExecutor = WorkflowExecutor(_workflowExecutor);
        actionManager = ResponseAction(_actionManager);
    }

    /**
     * @dev Configure response policy for incident type
     */
    function configureResponsePolicy(
        string calldata _incidentType,
        bool _autoRespond,
        uint256 _maxResponseTime,
        uint256[] calldata _runbookIds,
        uint256[] calldata _actionIds,
        uint256 _escalationThreshold
    ) external onlyAdmin {
        require(bytes(_incidentType).length > 0, "invalid incident type");
        require(_maxResponseTime > 0, "invalid response time");
        require(_runbookIds.length > 0 || _actionIds.length > 0, "no responses configured");

        ResponsePolicy storage policy = responsePolicies[_incidentType];
        policy.incidentType = _incidentType;
        policy.autoRespond = _autoRespond;
        policy.maxResponseTime = _maxResponseTime;
        policy.escalationThreshold = _escalationThreshold;
        policy.requiresApproval = !_autoRespond;

        // Set runbooks
        delete policy.applicableRunbookIds;
        for (uint256 i = 0; i < _runbookIds.length; i++) {
            policy.applicableRunbookIds.push(_runbookIds[i]);
        }

        // Set actions
        delete policy.applicableActionIds;
        for (uint256 i = 0; i < _actionIds.length; i++) {
            policy.applicableActionIds.push(_actionIds[i]);
        }

        emit ResponsePolicyConfigured(
            _incidentType,
            _autoRespond,
            _runbookIds.length,
            _actionIds.length
        );
    }

    /**
     * @dev Trigger response to an incident
     */
    function triggerIncidentResponse(
        uint256 _incidentId,
        string calldata _incidentType
    ) external onlyIncidentManager returns (uint256) {
        ResponsePolicy storage policy = responsePolicies[_incidentType];
        require(bytes(policy.incidentType).length > 0, "no policy for incident type");

        totalResponsesTriggered++;

        // Create execution plan
        uint256 executionPlanId = workflowExecutor.createExecutionPlan(_incidentId, _incidentType);

        // Record response
        IncidentResponse storage response = incidentResponses[_incidentId];
        response.incidentId = _incidentId;
        response.incidentType = _incidentType;
        response.detectionTime = block.timestamp;
        response.executionPlanId = executionPlanId;
        response.autoResponded = policy.autoRespond;
        // Status will be set in executeAutoResponse or if manual response is needed
        if (!policy.autoRespond) {
            response.responseStatus = "pending";
        }

        emit IncidentResponseTriggered(
            _incidentId,
            _incidentType,
            executionPlanId,
            policy.autoRespond
        );

        // Auto-execute if configured
        if (policy.autoRespond) {
            executeAutoResponse(_incidentId);
        }

        return executionPlanId;
    }

    /**
     * @dev Execute automatic response
     */
    function executeAutoResponse(uint256 _incidentId) 
        public 
        onlyIncidentManager 
        returns (bool) 
    {
        IncidentResponse storage response = incidentResponses[_incidentId];
        require(response.incidentId > 0, "response not found");
        // Allow if no status yet or if it's currently pending
        bytes32 statusHash = keccak256(bytes(response.responseStatus));
        require(statusHash == keccak256(bytes("")) || statusHash == keccak256(bytes("pending")), "already responded");

        response.responseStatus = "executing";
        response.responseStartTime = block.timestamp;

        emit ResponseStarted(_incidentId, response.executionPlanId);

        // Execute runbooks
        bool success = workflowExecutor.executeRunbooks(response.executionPlanId);

        // Execute actions
        ResponsePolicy storage policy = responsePolicies[response.incidentType];
        for (uint256 i = 0; i < policy.applicableActionIds.length; i++) {
            uint256 actionId = policy.applicableActionIds[i];
            try actionManager.executeAction(actionId, _incidentId) {
                // Action executed
            } catch {
                // Continue on action failure
            }
        }

        uint256 duration = block.timestamp - response.responseStartTime;
        response.responseCompleteTime = block.timestamp;
        response.responseStatus = success ? "completed" : "failed";

        if (success) {
            successfulAutoResponses++;
        } else {
            failedAutoResponses++;
        }

        emit ResponseCompleted(_incidentId, success, duration, response.responseStatus);

        return success;
    }

    /**
     * @dev Manually execute response for incident
     */
    function manuallyExecuteResponse(uint256 _incidentId) 
        external 
        onlyAdmin 
        returns (bool) 
    {
        return executeAutoResponse(_incidentId);
    }

    /**
     * @dev Escalate incident response to human operators
     */
    function escalateResponse(uint256 _incidentId, string calldata _reason) 
        external 
        onlyAdmin 
    {
        IncidentResponse storage response = incidentResponses[_incidentId];
        require(response.incidentId > 0, "response not found");

        response.responseStatus = "escalated";
        response.responseDetails = _reason;

        emit ResponseEscalated(_incidentId, _reason);
    }

    /**
     * @dev Disable auto-response for an incident
     */
    function disableAutoResponse(uint256 _incidentId, string calldata _reason) 
        external 
        onlyAdmin 
    {
        IncidentResponse storage response = incidentResponses[_incidentId];
        require(response.incidentId > 0, "response not found");

        response.autoResponded = false;
        response.responseStatus = "disabled";
        response.responseDetails = _reason;

        emit AutoResponseDisabled(_incidentId, _reason);
    }

    /**
     * @dev Get incident response status
     */
    function getIncidentResponse(uint256 _incidentId) 
        external 
        view 
        returns (
            string memory incidentType,
            uint256 detectionTime,
            bool autoResponded,
            string memory status,
            uint256 executionPlanId,
            uint256 duration
        ) 
    {
        IncidentResponse storage response = incidentResponses[_incidentId];
        require(response.incidentId > 0, "response not found");

        uint256 dur = response.responseCompleteTime > 0 
            ? response.responseCompleteTime - response.detectionTime
            : block.timestamp - response.detectionTime;

        return (
            response.incidentType,
            response.detectionTime,
            response.autoResponded,
            response.responseStatus,
            response.executionPlanId,
            dur
        );
    }

    /**
     * @dev Get response policy for incident type
     */
    function getResponsePolicy(string calldata _incidentType) 
        external 
        view 
        returns (
            bool autoRespond,
            uint256 maxResponseTime,
            uint256 runbookCount,
            uint256 actionCount,
            bool requiresApproval
        ) 
    {
        ResponsePolicy storage policy = responsePolicies[_incidentType];
        require(bytes(policy.incidentType).length > 0, "policy not found");

        return (
            policy.autoRespond,
            policy.maxResponseTime,
            policy.applicableRunbookIds.length,
            policy.applicableActionIds.length,
            policy.requiresApproval
        );
    }

    /**
     * @dev Get response metrics
     */
    function getResponseMetrics() 
        external 
        view 
        returns (
            uint256 total,
            uint256 successful,
            uint256 failed,
            uint256 successRate
        ) 
    {
        uint256 rate = totalResponsesTriggered > 0 
            ? (successfulAutoResponses * 100) / totalResponsesTriggered
            : 100;

        return (
            totalResponsesTriggered,
            successfulAutoResponses,
            failedAutoResponses,
            rate
        );
    }

    /**
     * @dev Check if incident response completed within Service Level Agreement
     */
    function isSlaMet(uint256 _incidentId) 
        external 
        view 
        returns (bool) 
    {
        IncidentResponse storage response = incidentResponses[_incidentId];
        require(response.incidentId > 0, "response not found");

        ResponsePolicy storage policy = responsePolicies[response.incidentType];
        require(bytes(policy.incidentType).length > 0, "policy not found");

        if (response.responseCompleteTime == 0) {
            return (block.timestamp - response.detectionTime) <= policy.maxResponseTime;
        }

        uint256 duration = response.responseCompleteTime - response.detectionTime;
        return duration <= policy.maxResponseTime;
    }

    /**
     * @dev Get applicable responses for incident type
     */
    function getApplicableResponses(string calldata _incidentType) 
        external 
        view 
        returns (
            uint256[] memory runbookIds,
            uint256[] memory actionIds
        ) 
    {
        ResponsePolicy storage policy = responsePolicies[_incidentType];
        require(bytes(policy.incidentType).length > 0, "policy not found");

        return (
            policy.applicableRunbookIds,
            policy.applicableActionIds
        );
    }
}
