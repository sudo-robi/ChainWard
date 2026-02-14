// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ResponseAction
 * @notice Pre-built response actions for automated incident handling
 * @dev Provides common actions like pause, alert, escalate, &rollback
 */
contract ResponseAction is AccessControl {
    bytes32 public constant ACTION_ADMIN = keccak256("ACTION_ADMIN");

    enum ActionType {
        Pause,      // 0: Pause system operations
        Alert,      // 1: Send alert/notification
        Escalate,   // 2: Escalate to human operators
        Rollback,   // 3: Rollback recent changes
        Drain,      // 4: Drain liquidity pools
        MintBridge, // 5: Mint bridged tokens for recovery
        SlashCollateral,      // 6: Slash staked collateral
        Checkpoint  // 7: Create recovery checkpoint
    }

    struct ActionConfig {
        ActionType actionType;
        string name;
        string description;
        address targetContract;
        bytes actionData;
        uint256 gasLimit;
        uint256 cooldownPeriod;
        bool requiresApproval;
        bool enabled;
    }

    struct ActionExecution {
        uint256 actionId;
        uint256 incidentId;
        uint256 executionTime;
        bool success;
        string result;
        address executor;
    }

    // State variables
    mapping(uint256 => ActionConfig) public actions;
    mapping(uint256 => ActionExecution[]) public executionLog;
    mapping(ActionType => uint256[]) public actionsByType;
    
    uint256 public actionCount;
    uint256 public constant MAX_EXECUTION_TIME = 5 minutes;

    // Recent execution tracking for cooldown
    mapping(uint256 => uint256) public lastExecutionTime;

    // Events
    event ActionConfigured(
        uint256 indexed actionId,
        ActionType actionType,
        string name,
        address targetContract
    );

    event ActionExecuted(
        uint256 indexed actionId,
        uint256 indexed incidentId,
        bool success,
        string result
    );

    event ActionEnabled(uint256 indexed actionId);
    event ActionDisabled(uint256 indexed actionId);

    event CooldownTriggered(
        uint256 indexed actionId,
        uint256 cooldownUntil
    );

    modifier onlyAdmin() {
        require(hasRole(ACTION_ADMIN, msg.sender), "not action admin");
        _;
    }

    modifier notInCooldown(uint256 _actionId) {
        require(
            block.timestamp >= lastExecutionTime[_actionId],
            "action in cooldown"
        );
        _;
    }

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ACTION_ADMIN, msg.sender);
    }

    /**
     * @dev Configure a response action
     */
    function configureAction(
        ActionType _actionType,
        string calldata _name,
        string calldata _description,
        address _targetContract,
        bytes calldata _actionData,
        uint256 _gasLimit,
        uint256 _cooldownPeriod
    ) external onlyAdmin returns (uint256) {
        require(bytes(_name).length > 0, "invalid name");
        require(_targetContract != address(0), "invalid target");
        require(_gasLimit > 0, "invalid gas limit");

        uint256 actionId = ++actionCount;

        ActionConfig storage config = actions[actionId];
        config.actionType = _actionType;
        config.name = _name;
        config.description = _description;
        config.targetContract = _targetContract;
        config.actionData = _actionData;
        config.gasLimit = _gasLimit;
        config.cooldownPeriod = _cooldownPeriod;
        config.requiresApproval = false;
        config.enabled = true;

        actionsByType[_actionType].push(actionId);

        emit ActionConfigured(actionId, _actionType, _name, _targetContract);
        return actionId;
    }

    /**
     * @dev Execute a response action
     */
    function executeAction(
        uint256 _actionId,
        uint256 _incidentId
    ) external onlyAdmin notInCooldown(_actionId) returns (bool) {
        require(_actionId > 0 && _actionId <= actionCount, "action not found");

        ActionConfig storage config = actions[_actionId];
        require(config.enabled, "action disabled");

        // Execute the action
        (bool success, bytes memory result) = config.targetContract.call{
            gas: config.gasLimit
        }(config.actionData);

        // Record execution
        string memory resultStr = success ? "success" : "failed";
        ActionExecution memory exec = ActionExecution({
            actionId: _actionId,
            incidentId: _incidentId,
            executionTime: block.timestamp,
            success: success,
            result: resultStr,
            executor: msg.sender
        });
        executionLog[_actionId].push(exec);

        // Set cooldown
        lastExecutionTime[_actionId] = block.timestamp + config.cooldownPeriod;

        emit ActionExecuted(_actionId, _incidentId, success, resultStr);

        if (config.cooldownPeriod > 0) {
            emit CooldownTriggered(_actionId, lastExecutionTime[_actionId]);
        }

        return success;
    }

    /**
     * @dev Get action configuration
     */
    function getAction(uint256 _actionId) 
        external 
        view 
        returns (
            ActionType actionType,
            string memory name,
            string memory description,
            address targetContract,
            uint256 gasLimit,
            uint256 cooldownPeriod,
            bool enabled
        ) 
    {
        require(_actionId > 0 && _actionId <= actionCount, "not found");
        ActionConfig storage config = actions[_actionId];

        return (
            config.actionType,
            config.name,
            config.description,
            config.targetContract,
            config.gasLimit,
            config.cooldownPeriod,
            config.enabled
        );
    }

    /**
     * @dev Get actions by type
     */
    function getActionsByType(ActionType _actionType) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return actionsByType[_actionType];
    }

    /**
     * @dev Get execution log for an action
     */
    function getExecutionLog(uint256 _actionId) 
        external 
        view 
        returns (ActionExecution[] memory) 
    {
        require(_actionId > 0 && _actionId <= actionCount, "not found");
        return executionLog[_actionId];
    }

    /**
     * @dev Get recent executions
     */
    function getRecentExecutions(uint256 _actionId, uint256 _count) 
        external 
        view 
        returns (ActionExecution[] memory) 
    {
        require(_actionId > 0 && _actionId <= actionCount, "not found");
        
        ActionExecution[] storage log = executionLog[_actionId];
        uint256 start = log.length > _count ? log.length - _count : 0;
        uint256 resultCount = log.length - start;

        ActionExecution[] memory result = new ActionExecution[](resultCount);
        for (uint256 i = 0; i < resultCount; i++) {
            result[i] = log[start + i];
        }
        return result;
    }

    /**
     * @dev Check if action is in cooldown
     */
    function isInCooldown(uint256 _actionId) 
        external 
        view 
        returns (bool) 
    {
        require(_actionId > 0 && _actionId <= actionCount, "not found");
        return block.timestamp < lastExecutionTime[_actionId];
    }

    /**
     * @dev Get cooldown time remaining
     */
    function getCooldownRemaining(uint256 _actionId) 
        external 
        view 
        returns (uint256) 
    {
        require(_actionId > 0 && _actionId <= actionCount, "not found");
        
        uint256 cooldownEnd = lastExecutionTime[_actionId];
        if (block.timestamp >= cooldownEnd) return 0;
        return cooldownEnd - block.timestamp;
    }

    /**
     * @dev Enable an action
     */
    function enableAction(uint256 _actionId) 
        external 
        onlyAdmin 
    {
        require(_actionId > 0 && _actionId <= actionCount, "not found");
        actions[_actionId].enabled = true;
        emit ActionEnabled(_actionId);
    }

    /**
     * @dev Disable an action
     */
    function disableAction(uint256 _actionId) 
        external 
        onlyAdmin 
    {
        require(_actionId > 0 && _actionId <= actionCount, "not found");
        actions[_actionId].enabled = false;
        emit ActionDisabled(_actionId);
    }

    /**
     * @dev Update action configuration
     */
    function updateAction(
        uint256 _actionId,
        bytes calldata _newActionData,
        uint256 _newGasLimit,
        uint256 _newCooldown
    ) external onlyAdmin {
        require(_actionId > 0 && _actionId <= actionCount, "not found");
        require(_newGasLimit > 0, "invalid gas limit");

        ActionConfig storage config = actions[_actionId];
        config.actionData = _newActionData;
        config.gasLimit = _newGasLimit;
        config.cooldownPeriod = _newCooldown;
    }

    /**
     * @dev Check action execution success rate
     */
    function getSuccessRate(uint256 _actionId) 
        external 
        view 
        returns (uint256) 
    {
        require(_actionId > 0 && _actionId <= actionCount, "not found");
        
        ActionExecution[] storage log = executionLog[_actionId];
        if (log.length == 0) return 100;

        uint256 successCount = 0;
        for (uint256 i = 0; i < log.length; i++) {
            if (log[i].success) successCount++;
        }

        return (successCount * 100) / log.length;
    }
}
