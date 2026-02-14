// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ResponseWorkflow
 * @notice Manages complex incident response workflows with state transitions
 * @dev Orchestrates multi-step incident response procedures
 */
contract ResponseWorkflow is AccessControl {
    bytes32 public constant WORKFLOW_ADMIN = keccak256("WORKFLOW_ADMIN");
    bytes32 public constant ORCHESTRATOR_ROLE = keccak256("ORCHESTRATOR_ROLE");

    enum WorkflowStage {
        Detection,      // 0: Incident detected
        Triage,         // 1: Initial assessment
        Containment,    // 2: Stop further damage
        Remediation,    // 3: Fix the issue
        Recovery,       // 4: Restore normal operation
        PostIncident    // 5: Post-mortem &cleanup
    }

    struct WorkflowStep {
        string description;
        string action;
        uint256 timeoutSeconds;
        bool optional;
        uint256 requiredRoles; // Bitmask of required roles
    }

    struct Workflow {
        uint256 id;
        string name;
        string incidentType; // e.g., "SEQUENCER_DOWN", "BLOCK_LAG_CRITICAL"
        WorkflowStep[] steps;
        bool active;
        uint256 createdAt;
        address creator;
    }

    struct WorkflowExecution {
        uint256 workflowId;
        uint256 incidentId;
        WorkflowStage currentStage;
        uint256 currentStep;
        uint256 startTime;
        uint256 lastUpdated;
        bool completed;
        bool successful;
        string completionReason;
        uint256 duration;
    }

    // State variables
    mapping(uint256 => Workflow) public workflows;
    mapping(uint256 => WorkflowExecution) public executions;
    mapping(string => uint256) public workflowsByType; // incidentType -> workflowId
    
    uint256 public workflowCount;
    uint256 public executionCount;

    // Events
    event WorkflowCreated(
        uint256 indexed workflowId,
        string name,
        string incidentType,
        uint256 stepCount
    );

    event WorkflowExecutionStarted(
        uint256 indexed executionId,
        uint256 indexed workflowId,
        uint256 indexed incidentId
    );

    event StageTransitioned(
        uint256 indexed executionId,
        WorkflowStage fromStage,
        WorkflowStage toStage,
        uint256 stepIndex
    );

    event StepCompleted(
        uint256 indexed executionId,
        uint256 stepIndex,
        bool success,
        string action
    );

    event WorkflowCompleted(
        uint256 indexed executionId,
        bool successful,
        uint256 duration
    );

    event WorkflowFailed(
        uint256 indexed executionId,
        string reason
    );

    modifier onlyAdmin() {
        require(hasRole(WORKFLOW_ADMIN, msg.sender), "not workflow admin");
        _;
    }

    modifier onlyOrchestrator() {
        require(hasRole(ORCHESTRATOR_ROLE, msg.sender), "not orchestrator");
        _;
    }

    modifier executionExists(uint256 _executionId) {
        require(_executionId > 0 && _executionId <= executionCount, "execution not found");
        _;
    }

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(WORKFLOW_ADMIN, msg.sender);
        _grantRole(ORCHESTRATOR_ROLE, msg.sender);
    }

    /**
     * @dev Create a new workflow for an incident type
     */
    function createWorkflow(
        string calldata _name,
        string calldata _incidentType,
        WorkflowStep[] calldata _steps
    ) external onlyAdmin returns (uint256) {
        require(bytes(_name).length > 0, "invalid name");
        require(bytes(_incidentType).length > 0, "invalid incident type");
        require(_steps.length > 0 && _steps.length <= 50, "invalid step count");
        require(workflowsByType[_incidentType] == 0, "workflow exists for type");

        uint256 workflowId = ++workflowCount;

        Workflow storage wf = workflows[workflowId];
        wf.id = workflowId;
        wf.name = _name;
        wf.incidentType = _incidentType;
        wf.active = true;
        wf.createdAt = block.timestamp;
        wf.creator = msg.sender;

        // Add steps
        for (uint256 i = 0; i < _steps.length; i++) {
            require(bytes(_steps[i].description).length > 0, "invalid step description");
            require(bytes(_steps[i].action).length > 0, "invalid step action");
            require(_steps[i].timeoutSeconds > 0, "invalid timeout");

            wf.steps.push(_steps[i]);
        }

        workflowsByType[_incidentType] = workflowId;

        emit WorkflowCreated(workflowId, _name, _incidentType, _steps.length);
        return workflowId;
    }

    /**
     * @dev Start workflow execution for an incident
     */
    function startWorkflow(
        uint256 _workflowId,
        uint256 _incidentId
    ) external onlyOrchestrator returns (uint256) {
        require(_workflowId > 0 && _workflowId <= workflowCount, "workflow not found");
        
        Workflow storage wf = workflows[_workflowId];
        require(wf.active, "workflow inactive");

        uint256 executionId = ++executionCount;

        WorkflowExecution storage exec = executions[executionId];
        exec.workflowId = _workflowId;
        exec.incidentId = _incidentId;
        exec.currentStage = WorkflowStage.Detection;
        exec.currentStep = 0;
        exec.startTime = block.timestamp;
        exec.lastUpdated = block.timestamp;
        exec.completed = false;
        exec.successful = false;

        emit WorkflowExecutionStarted(executionId, _workflowId, _incidentId);
        return executionId;
    }

    /**
     * @dev Advance to next workflow step
     */
    function advanceStep(
        uint256 _executionId,
        bool _stepSuccessful
    ) external onlyOrchestrator executionExists(_executionId) {
        WorkflowExecution storage exec = executions[_executionId];
        require(!exec.completed, "workflow completed");

        Workflow storage wf = workflows[exec.workflowId];
        require(exec.currentStep < wf.steps.length, "no more steps");

        uint256 currentStep = exec.currentStep;
        WorkflowStep storage step = wf.steps[currentStep];

        // Validate step timeout
        if (block.timestamp > exec.lastUpdated + step.timeoutSeconds && !step.optional) {
            exec.completed = true;
            exec.successful = false;
            exec.completionReason = "step timeout";
            emit WorkflowFailed(_executionId, "step timeout");
            return;
        }

        emit StepCompleted(_executionId, currentStep, _stepSuccessful, step.action);

        if (!_stepSuccessful && !step.optional) {
            // Required step failed
            exec.completed = true;
            exec.successful = false;
            exec.completionReason = "required step failed";
            emit WorkflowFailed(_executionId, "required step failed");
            return;
        }

        // Move to next step
        exec.currentStep++;
        exec.lastUpdated = block.timestamp;

        // Check if workflow is complete
        if (exec.currentStep >= wf.steps.length) {
            completeWorkflow(_executionId, true, "all steps completed");
        }
    }

    /**
     * @dev Transition to next stage
     */
    function transitionStage(
        uint256 _executionId,
        WorkflowStage _nextStage
    ) external onlyOrchestrator executionExists(_executionId) {
        WorkflowExecution storage exec = executions[_executionId];
        require(!exec.completed, "workflow completed");
        require(uint256(_nextStage) <= uint256(WorkflowStage.PostIncident), "invalid stage");

        WorkflowStage prevStage = exec.currentStage;
        exec.currentStage = _nextStage;
        exec.lastUpdated = block.timestamp;

        emit StageTransitioned(_executionId, prevStage, _nextStage, exec.currentStep);
    }

    /**
     * @dev Complete workflow successfully or with failure
     */
    function completeWorkflow(
        uint256 _executionId,
        bool _successful,
        string memory _reason
    ) public onlyOrchestrator executionExists(_executionId) {
        WorkflowExecution storage exec = executions[_executionId];
        require(!exec.completed, "already completed");

        exec.completed = true;
        exec.successful = _successful;
        exec.completionReason = _reason;
        exec.duration = block.timestamp - exec.startTime;
        exec.lastUpdated = block.timestamp;

        emit WorkflowCompleted(_executionId, _successful, exec.duration);
    }

    /**
     * @dev Get workflow details
     */
    function getWorkflow(uint256 _workflowId) 
        external 
        view 
        returns (
            string memory name,
            string memory incidentType,
            uint256 stepCount,
            bool active
        ) 
    {
        require(_workflowId > 0 && _workflowId <= workflowCount, "not found");
        Workflow storage wf = workflows[_workflowId];
        return (wf.name, wf.incidentType, wf.steps.length, wf.active);
    }

    /**
     * @dev Get workflow steps
     */
    function getWorkflowSteps(uint256 _workflowId) 
        external 
        view 
        returns (WorkflowStep[] memory) 
    {
        require(_workflowId > 0 && _workflowId <= workflowCount, "not found");
        return workflows[_workflowId].steps;
    }

    /**
     * @dev Get execution status
     */
    function getExecutionStatus(uint256 _executionId) 
        external 
        view 
        executionExists(_executionId) 
        returns (
            uint256 workflowId,
            uint256 incidentId,
            WorkflowStage stage,
            uint256 currentStep,
            bool completed,
            bool successful,
            uint256 duration
        ) 
    {
        WorkflowExecution storage exec = executions[_executionId];
        return (
            exec.workflowId,
            exec.incidentId,
            exec.currentStage,
            exec.currentStep,
            exec.completed,
            exec.successful,
            exec.duration
        );
    }

    /**
     * @dev Get workflow by incident type
     */
    function getWorkflowByType(string calldata _incidentType) 
        external 
        view 
        returns (uint256) 
    {
        return workflowsByType[_incidentType];
    }
}
