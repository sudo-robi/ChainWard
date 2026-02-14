// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "src/response/AutomatedRunbook.sol";

/**
 * @title WorkflowExecutor
 * @notice Orchestrates automated runbook &workflow execution
 * @dev Monitors incidents &triggers appropriate response workflows
 */
contract WorkflowExecutor is AccessControl {
    bytes32 public constant EXECUTOR_ADMIN = keccak256("EXECUTOR_ADMIN");
    bytes32 public constant MONITOR_ROLE = keccak256("MONITOR_ROLE");

    enum ResponsePriority {
        Low,        // 0: Non-critical issues
        Medium,     // 1: Important but not urgent
        High,       // 2: Critical - needs fast response
        Critical    // 3: Emergency - immediate action
    }

    enum ExecutionStatus {
        Queued,
        Running,
        Success,
        Failed,
        Timeout
    }

    struct ExecutionPlan {
        uint256 planId;
        uint256 incidentId;
        string incidentType;
        uint256[] runbookIds;
        ResponsePriority priority;
        uint256 createdAt;
        uint256 startTime;
        ExecutionStatus status;
        uint256 completedRunbooks;
        uint256 failedRunbooks;
        string failureReason;
    }

    struct ResponseMetrics {
        uint256 totalIncidents;
        uint256 respondedIncidents;
        uint256 autoResolvedIncidents;
        uint256 failedResponses;
        uint256 avgResponseTime;
        uint256 avgResolutionTime;
    }

    struct IncidentTrigger {
        string incidentType;
        uint256[] applicableRunbooks;
        ResponsePriority priority;
        uint256 timeoutSeconds;
        bool enabled;
    }

    // State variables
    mapping(uint256 => ExecutionPlan) public executionPlans;
    mapping(string => IncidentTrigger) public triggers;
    mapping(uint256 => ResponseMetrics) public metrics;

    AutomatedRunbook public runbookManager;
    
    uint256 public planCount;
    uint256 public constant EXECUTION_TIMEOUT = 1 hours;

    // Events
    event ExecutionPlanCreated(
        uint256 indexed planId,
        uint256 indexed incidentId,
        string incidentType,
        ResponsePriority priority,
        uint256 runbookCount
    );

    event ExecutionStarted(
        uint256 indexed planId,
        uint256 indexed incidentId
    );

    event RunbookQueued(
        uint256 indexed planId,
        uint256 runbookId,
        uint256 sequence
    );

    event ExecutionCompleted(
        uint256 indexed planId,
        uint256 indexed incidentId,
        bool success,
        uint256 duration
    );

    event TriggerConfigured(
        string incidentType,
        ResponsePriority priority,
        uint256 runbookCount
    );

    event ResponseMetricsUpdated(
        uint256 indexed planId,
        uint256 totalResponded,
        uint256 avgResponseTime
    );

    modifier onlyAdmin() {
        require(hasRole(EXECUTOR_ADMIN, msg.sender), "not executor admin");
        _;
    }

    modifier onlyMonitor() {
        require(hasRole(MONITOR_ROLE, msg.sender), "not monitor");
        _;
    }

    modifier planExists(uint256 _planId) {
        require(_planId > 0 && _planId <= planCount, "plan not found");
        _;
    }

    constructor(address _runbookManager) {
        require(_runbookManager != address(0), "invalid runbook manager");
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EXECUTOR_ADMIN, msg.sender);
        _grantRole(MONITOR_ROLE, msg.sender);

        runbookManager = AutomatedRunbook(_runbookManager);
    }

    /**
     * @dev Configure trigger for an incident type
     */
    function configureTrigger(
        string calldata _incidentType,
        uint256[] calldata _runbookIds,
        ResponsePriority _priority,
        uint256 _timeoutSeconds
    ) external onlyAdmin {
        require(bytes(_incidentType).length > 0, "invalid type");
        require(_runbookIds.length > 0 && _runbookIds.length <= 10, "invalid runbook count");
        require(_timeoutSeconds > 0, "invalid timeout");

        IncidentTrigger storage trigger = triggers[_incidentType];
        trigger.incidentType = _incidentType;
        trigger.priority = _priority;
        trigger.timeoutSeconds = _timeoutSeconds;
        trigger.enabled = true;

        // Set runbooks
        delete trigger.applicableRunbooks;
        for (uint256 i = 0; i < _runbookIds.length; i++) {
            trigger.applicableRunbooks.push(_runbookIds[i]);
        }

        emit TriggerConfigured(_incidentType, _priority, _runbookIds.length);
    }

    /**
     * @dev Create execution plan for an incident
     */
    function createExecutionPlan(
        uint256 _incidentId,
        string calldata _incidentType
    ) external onlyMonitor returns (uint256) {
        IncidentTrigger storage trigger = triggers[_incidentType];
        require(trigger.enabled, "trigger not configured");
        require(trigger.applicableRunbooks.length > 0, "no applicable runbooks");

        uint256 planId = ++planCount;

        ExecutionPlan storage plan = executionPlans[planId];
        plan.planId = planId;
        plan.incidentId = _incidentId;
        plan.incidentType = _incidentType;
        plan.priority = trigger.priority;
        plan.createdAt = block.timestamp;
        plan.status = ExecutionStatus.Queued;

        // Copy applicable runbooks
        for (uint256 i = 0; i < trigger.applicableRunbooks.length; i++) {
            plan.runbookIds.push(trigger.applicableRunbooks[i]);
        }

        emit ExecutionPlanCreated(
            planId,
            _incidentId,
            _incidentType,
            trigger.priority,
            trigger.applicableRunbooks.length
        );

        return planId;
    }

    /**
     * @dev Execute planned runbooks sequentially
     */
    function executeRunbooks(uint256 _planId) 
        external 
        onlyMonitor 
        planExists(_planId) 
        returns (bool) 
    {
        ExecutionPlan storage plan = executionPlans[_planId];
        require(plan.status == ExecutionStatus.Queued, "plan already executing");
        require(block.timestamp < plan.createdAt + EXECUTION_TIMEOUT, "plan timeout");

        plan.status = ExecutionStatus.Running;
        plan.startTime = block.timestamp;

        emit ExecutionStarted(plan.planId, plan.incidentId);

        uint256 successCount = 0;
        uint256 failureCount = 0;

        // Execute each runbook in sequence
        for (uint256 i = 0; i < plan.runbookIds.length; i++) {
            uint256 runbookId = plan.runbookIds[i];
            
            // Execute via runbook manager
            try runbookManager.executeRunbook(runbookId, plan.incidentId) returns (bool success) {
                if (success) {
                    successCount++;
                } else {
                    failureCount++;
                    // For high priority, continue even on failure
                    if (plan.priority < ResponsePriority.High) {
                        plan.failureReason = "runbook execution failed";
                        break;
                    }
                }
                emit RunbookQueued(_planId, runbookId, i);
            } catch {
                failureCount++;
                if (plan.priority < ResponsePriority.High) {
                    plan.failureReason = "runbook execution error";
                    break;
                }
            }
        }

        plan.completedRunbooks = successCount;
        plan.failedRunbooks = failureCount;

        // Determine final status
        bool planSuccess = failureCount == 0 && successCount > 0;
        plan.status = planSuccess ? ExecutionStatus.Success : ExecutionStatus.Failed;

        uint256 duration = block.timestamp - plan.startTime;
        emit ExecutionCompleted(_planId, plan.incidentId, planSuccess, duration);

        // Update metrics
        updateMetrics(_planId, planSuccess);

        return planSuccess;
    }

    /**
     * @dev Get execution plan details
     */
    function getExecutionPlan(uint256 _planId) 
        external 
        view 
        planExists(_planId) 
        returns (
            uint256 incidentId,
            string memory incidentType,
            ResponsePriority priority,
            ExecutionStatus status,
            uint256 runbookCount,
            uint256 completedRunbooks,
            uint256 failedRunbooks,
            uint256 duration
        ) 
    {
        ExecutionPlan storage plan = executionPlans[_planId];
        uint256 dur = plan.startTime > 0 ? block.timestamp - plan.startTime : 0;
        
        return (
            plan.incidentId,
            plan.incidentType,
            plan.priority,
            plan.status,
            plan.runbookIds.length,
            plan.completedRunbooks,
            plan.failedRunbooks,
            dur
        );
    }

    /**
     * @dev Get runbooks for execution plan
     */
    function getRunbooksForPlan(uint256 _planId) 
        external 
        view 
        planExists(_planId) 
        returns (uint256[] memory) 
    {
        return executionPlans[_planId].runbookIds;
    }

    /**
     * @dev Get trigger configuration
     */
    function getTrigger(string calldata _incidentType) 
        external 
        view 
        returns (
            ResponsePriority priority,
            uint256 runbookCount,
            uint256 timeoutSeconds,
            bool enabled
        ) 
    {
        IncidentTrigger storage trigger = triggers[_incidentType];
        return (
            trigger.priority,
            trigger.applicableRunbooks.length,
            trigger.timeoutSeconds,
            trigger.enabled
        );
    }

    /**
     * @dev Update response metrics
     */
    function updateMetrics(uint256 _planId, bool _success) 
        internal 
    {
        ExecutionPlan storage plan = executionPlans[_planId];
        ResponseMetrics storage metrics_ = metrics[_planId];

        metrics_.totalIncidents++;
        metrics_.respondedIncidents++;

        if (_success) {
            metrics_.autoResolvedIncidents++;
        } else {
            metrics_.failedResponses++;
        }

        if (plan.startTime > 0) {
            uint256 duration = block.timestamp - plan.startTime;
            metrics_.avgResponseTime = (metrics_.avgResponseTime + duration) / 2;
            metrics_.avgResolutionTime = (metrics_.avgResolutionTime + duration) / 2;
        }

        emit ResponseMetricsUpdated(
            _planId,
            metrics_.respondedIncidents,
            metrics_.avgResponseTime
        );
    }

    /**
     * @dev Get metrics for an execution
     */
    function getMetrics(uint256 _planId) 
        external 
        view 
        planExists(_planId) 
        returns (
            uint256 totalIncidents,
            uint256 responded,
            uint256 autoResolved,
            uint256 failed,
            uint256 avgResponse
        ) 
    {
        ResponseMetrics storage m = metrics[_planId];
        return (
            m.totalIncidents,
            m.respondedIncidents,
            m.autoResolvedIncidents,
            m.failedResponses,
            m.avgResponseTime
        );
    }

    /**
     * @dev Check if trigger is configured
     */
    function isTriggerConfigured(string calldata _incidentType) 
        external 
        view 
        returns (bool) 
    {
        return triggers[_incidentType].enabled;
    }

    /**
     * @dev Get applicable runbooks for incident type
     */
    function getApplicableRunbooks(string calldata _incidentType) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return triggers[_incidentType].applicableRunbooks;
    }

    /**
     * @dev Cancel execution plan
     */
    function cancelPlan(uint256 _planId) 
        external 
        onlyAdmin 
        planExists(_planId) 
    {
        ExecutionPlan storage plan = executionPlans[_planId];
        require(plan.status == ExecutionStatus.Queued, "cannot cancel");
        
        plan.status = ExecutionStatus.Failed;
        plan.failureReason = "cancelled by admin";
    }
}
