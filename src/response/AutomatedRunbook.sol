// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AutomatedRunbook
 * @notice Defines &manages automated incident response runbooks
 * @dev Allows creation of runbooks with pre-defined response workflows
 */
contract AutomatedRunbook is AccessControl {
    bytes32 public constant RUNBOOK_ADMIN = keccak256("RUNBOOK_ADMIN");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    struct RunbookAction {
        string actionType; // e.g., "pause", "alert", "escalate", "rollback"
        address targetContract;
        bytes callData;
        uint256 gasLimit;
        bool required; // If true, runbook fails if this action fails
    }

    struct Runbook {
        uint256 id;
        string name;
        string description;
        string triggerCondition; // e.g., "block_lag > 10", "sequencer_down"
        RunbookAction[] actions;
        bool active;
        uint256 createdAt;
        uint256 lastUpdated;
        address creator;
        uint256 executionCount;
        uint256 successCount;
    }

    struct RunbookExecution {
        uint256 runbookId;
        uint256 incidentId;
        uint256 executionTime;
        bool success;
        string failureReason;
        uint256 gasUsed;
        address executor;
    }

    // State variables
    mapping(uint256 => Runbook) public runbooks;
    mapping(uint256 => RunbookExecution[]) public executionHistory;
    mapping(string => uint256[]) public runbooksByTrigger; // trigger -> runbook IDs
    
    uint256 public runbookCount;
    uint256 public totalExecutions;

    // Events
    event RunbookCreated(
        uint256 indexed runbookId,
        string name,
        string triggerCondition,
        address indexed creator
    );
    
    event RunbookUpdated(
        uint256 indexed runbookId,
        string name,
        uint256 actionCount
    );
    
    event RunbookActivated(uint256 indexed runbookId);
    event RunbookDeactivated(uint256 indexed runbookId);
    
    event RunbookExecuted(
        uint256 indexed runbookId,
        uint256 indexed incidentId,
        bool success,
        uint256 gasUsed
    );
    
    event ActionExecuted(
        uint256 indexed runbookId,
        uint256 actionIndex,
        string actionType,
        bool success
    );
    
    event ExecutionFailed(
        uint256 indexed runbookId,
        uint256 indexed incidentId,
        string reason
    );

    // Modifiers
    modifier onlyRunbookAdmin() {
        require(hasRole(RUNBOOK_ADMIN, msg.sender), "not runbook admin");
        _;
    }

    modifier onlyExecutor() {
        require(hasRole(EXECUTOR_ROLE, msg.sender), "not executor");
        _;
    }

    modifier runbookExists(uint256 _runbookId) {
        require(_runbookId > 0 && _runbookId <= runbookCount, "runbook not found");
        _;
    }

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RUNBOOK_ADMIN, msg.sender);
        _grantRole(EXECUTOR_ROLE, msg.sender);
    }

    /**
     * @dev Create a new runbook with predefined actions
     */
    function createRunbook(
        string calldata _name,
        string calldata _description,
        string calldata _triggerCondition,
        RunbookAction[] calldata _actions
    ) external onlyRunbookAdmin returns (uint256) {
        require(bytes(_name).length > 0, "invalid name");
        require(_actions.length > 0, "no actions");
        require(_actions.length <= 20, "too many actions");

        uint256 runbookId = ++runbookCount;
        
        Runbook storage rb = runbooks[runbookId];
        rb.id = runbookId;
        rb.name = _name;
        rb.description = _description;
        rb.triggerCondition = _triggerCondition;
        rb.active = true;
        rb.createdAt = block.timestamp;
        rb.lastUpdated = block.timestamp;
        rb.creator = msg.sender;

        // Add actions
        for (uint256 i = 0; i < _actions.length; i++) {
            require(bytes(_actions[i].actionType).length > 0, "invalid action type");
            require(_actions[i].targetContract != address(0), "invalid target");
            require(_actions[i].gasLimit > 0, "invalid gas limit");
            
            rb.actions.push(_actions[i]);
        }

        // Register in trigger mapping
        runbooksByTrigger[_triggerCondition].push(runbookId);

        emit RunbookCreated(runbookId, _name, _triggerCondition, msg.sender);
        return runbookId;
    }

    /**
     * @dev Update runbook (deactivate old, create new)
     */
    function updateRunbook(
        uint256 _runbookId,
        string calldata _name,
        string calldata _description,
        RunbookAction[] calldata _actions
    ) external onlyRunbookAdmin runbookExists(_runbookId) {
        require(bytes(_name).length > 0, "invalid name");
        require(_actions.length > 0, "no actions");

        Runbook storage rb = runbooks[_runbookId];
        
        // Clear old actions
        delete rb.actions;
        
        // Add new actions
        for (uint256 i = 0; i < _actions.length; i++) {
            require(bytes(_actions[i].actionType).length > 0, "invalid action");
            require(_actions[i].targetContract != address(0), "invalid target");
            
            rb.actions.push(_actions[i]);
        }

        rb.name = _name;
        rb.description = _description;
        rb.lastUpdated = block.timestamp;

        emit RunbookUpdated(_runbookId, _name, _actions.length);
    }

    /**
     * @dev Execute a runbook for an incident
     */
    function executeRunbook(
        uint256 _runbookId,
        uint256 _incidentId
    ) external onlyExecutor runbookExists(_runbookId) returns (bool) {
        Runbook storage rb = runbooks[_runbookId];
        require(rb.active, "runbook inactive");

        uint256 startGas = gasleft();
        bool success = true;
        string memory failureReason = "";

        // Execute each action
        for (uint256 i = 0; i < rb.actions.length; i++) {
            RunbookAction storage action = rb.actions[i];
            
            // Execute action with gas limit
            (bool actionSuccess, bytes memory result) = action.targetContract.call{
                gas: action.gasLimit
            }(action.callData);

            emit ActionExecuted(_runbookId, i, action.actionType, actionSuccess);

            if (!actionSuccess) {
                if (action.required) {
                    success = false;
                    failureReason = "required action failed";
                    break;
                }
                // Continue if action is optional
            }
        }

        uint256 gasUsed = startGas - gasleft();
        rb.executionCount++;
        if (success) {
            rb.successCount++;
        }
        totalExecutions++;

        // Record execution
        RunbookExecution memory exec = RunbookExecution({
            runbookId: _runbookId,
            incidentId: _incidentId,
            executionTime: block.timestamp,
            success: success,
            failureReason: failureReason,
            gasUsed: gasUsed,
            executor: msg.sender
        });
        executionHistory[_runbookId].push(exec);

        if (success) {
            emit RunbookExecuted(_runbookId, _incidentId, true, gasUsed);
        } else {
            emit ExecutionFailed(_runbookId, _incidentId, failureReason);
        }

        return success;
    }

    /**
     * @dev Activate a runbook
     */
    function activateRunbook(uint256 _runbookId) 
        external 
        onlyRunbookAdmin 
        runbookExists(_runbookId) 
    {
        runbooks[_runbookId].active = true;
        emit RunbookActivated(_runbookId);
    }

    /**
     * @dev Deactivate a runbook (stop automatic execution)
     */
    function deactivateRunbook(uint256 _runbookId) 
        external 
        onlyRunbookAdmin 
        runbookExists(_runbookId) 
    {
        runbooks[_runbookId].active = false;
        emit RunbookDeactivated(_runbookId);
    }

    /**
     * @dev Get runbook details
     */
    function getRunbook(uint256 _runbookId) 
        external 
        view 
        runbookExists(_runbookId) 
        returns (
            string memory name,
            string memory description,
            string memory triggerCondition,
            bool active,
            uint256 actionCount,
            uint256 executionCount,
            uint256 successCount
        ) 
    {
        Runbook storage rb = runbooks[_runbookId];
        return (
            rb.name,
            rb.description,
            rb.triggerCondition,
            rb.active,
            rb.actions.length,
            rb.executionCount,
            rb.successCount
        );
    }

    /**
     * @dev Get runbook actions
     */
    function getRunbookActions(uint256 _runbookId) 
        external 
        view 
        runbookExists(_runbookId) 
        returns (RunbookAction[] memory) 
    {
        return runbooks[_runbookId].actions;
    }

    /**
     * @dev Get runbooks by trigger condition
     */
    function getRunbooksByTrigger(string calldata _trigger) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return runbooksByTrigger[_trigger];
    }

    /**
     * @dev Get execution history for a runbook
     */
    function getExecutionHistory(uint256 _runbookId) 
        external 
        view 
        runbookExists(_runbookId) 
        returns (RunbookExecution[] memory) 
    {
        return executionHistory[_runbookId];
    }

    /**
     * @dev Get recent executions
     */
    function getRecentExecutions(uint256 _runbookId, uint256 _count) 
        external 
        view 
        runbookExists(_runbookId) 
        returns (RunbookExecution[] memory) 
    {
        RunbookExecution[] storage history = executionHistory[_runbookId];
        uint256 start = history.length > _count ? history.length - _count : 0;
        uint256 resultCount = history.length - start;
        
        RunbookExecution[] memory result = new RunbookExecution[](resultCount);
        for (uint256 i = 0; i < resultCount; i++) {
            result[i] = history[start + i];
        }
        return result;
    }

    /**
     * @dev Get success rate for a runbook
     */
    function getSuccessRate(uint256 _runbookId) 
        external 
        view 
        runbookExists(_runbookId) 
        returns (uint256) 
    {
        Runbook storage rb = runbooks[_runbookId];
        if (rb.executionCount == 0) return 100;
        return (rb.successCount * 100) / rb.executionCount;
    }

    /**
     * @dev Grant executor role
     */
    function grantExecutor(address _executor) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        grantRole(EXECUTOR_ROLE, _executor);
    }

    /**
     * @dev Revoke executor role
     */
    function revokeExecutor(address _executor) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        revokeRole(EXECUTOR_ROLE, _executor);
    }
}
