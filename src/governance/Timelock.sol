// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Timelock
 * @dev Enforces a delay between proposal &execution of critical operations
 * Prevents flash loan attacks &gives the community time to react to malicious proposals
 */
contract Timelock {
    // Constants
    uint256 public constant MIN_DELAY = 2 days;
    uint256 public constant MAX_DELAY = 30 days;
    uint256 public constant GRACE_PERIOD = 14 days;

    // Structs
    struct ScheduledAction {
        address target;
        uint256 value;
        string signature;
        bytes data;
        uint256 scheduledAt;
        bool executed;
        bool cancelled;
    }

    // State variables
    address public admin;
    address public governance;
    uint256 public delay;

    mapping(bytes32 => ScheduledAction) public scheduledActions;
    mapping(bytes32 => bool) public queuedTransactions;

    // Events
    event NewDelay(uint256 indexed newDelay);
    event CancelTransaction(
        bytes32 indexed txHash,
        address indexed target,
        uint256 value,
        string signature,
        bytes data,
        uint256 eta
    );
    event ExecuteTransaction(
        bytes32 indexed txHash,
        address indexed target,
        uint256 value,
        string signature,
        bytes data,
        uint256 eta
    );
    event QueueTransaction(
        bytes32 indexed txHash,
        address indexed target,
        uint256 value,
        string signature,
        bytes data,
        uint256 eta
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin");
        _;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "only governance");
        _;
    }

    constructor(address _governance, uint256 _delay) {
        require(_governance != address(0), "zero governance");
        require(_delay >= MIN_DELAY && _delay <= MAX_DELAY, "invalid delay");

        admin = msg.sender;
        governance = _governance;
        delay = _delay;
    }

    /**
     * @dev Set governance contract address
     * @param _governance Address of governance contract
     */
    function setGovernance(address _governance) external onlyAdmin {
        require(_governance != address(0), "zero governance");
        governance = _governance;
    }

    /**
     * @dev Update delay for timelock
     * @param _delay New delay in seconds
     */
    function setDelay(uint256 _delay) external onlyAdmin {
        require(_delay >= MIN_DELAY && _delay <= MAX_DELAY, "invalid delay");
        delay = _delay;
        emit NewDelay(_delay);
    }

    /**
     * @dev Queue a transaction for execution
     * @param _target Target contract address
     * @param _value ETH value to send
     * @param _signature Function signature (e.g., "transfer(address,uint256)")
     * @param _data Encoded function parameters
     * @return Transaction hash
     */
    function queueTransaction(
        address _target,
        uint256 _value,
        string calldata _signature,
        bytes calldata _data
    ) external onlyGovernance returns (bytes32) {
        require(_target != address(0), "zero target");
        
        uint256 eta = block.timestamp + delay;
        bytes32 txHash = keccak256(abi.encode(_target, _value, _signature, _data, eta));
        
        require(!queuedTransactions[txHash], "already queued");

        queuedTransactions[txHash] = true;
        scheduledActions[txHash] = ScheduledAction({
            target: _target,
            value: _value,
            signature: _signature,
            data: _data,
            scheduledAt: block.timestamp,
            executed: false,
            cancelled: false
        });

        emit QueueTransaction(txHash, _target, _value, _signature, _data, eta);
        return txHash;
    }

    /**
     * @dev Cancel a queued transaction
     * @param _target Target contract address
     * @param _value ETH value to send
     * @param _signature Function signature
     * @param _data Encoded function parameters
     */
    function cancelTransaction(
        address _target,
        uint256 _value,
        string calldata _signature,
        bytes calldata _data
    ) external onlyGovernance {
        uint256 eta = block.timestamp + delay;
        bytes32 txHash = keccak256(abi.encode(_target, _value, _signature, _data, eta));
        
        require(queuedTransactions[txHash], "not queued");

        ScheduledAction storage action = scheduledActions[txHash];
        require(!action.executed, "already executed");
        require(!action.cancelled, "already cancelled");

        action.cancelled = true;
        queuedTransactions[txHash] = false;

        emit CancelTransaction(txHash, _target, _value, _signature, _data, eta);
    }

    /**
     * @dev Execute a queued transaction after the delay has passed
     * @param _target Target contract address
     * @param _value ETH value to send
     * @param _signature Function signature
     * @param _data Encoded function parameters
     */
    function executeTransaction(
        address _target,
        uint256 _value,
        string calldata _signature,
        bytes calldata _data
    ) external payable returns (bytes memory) {
        uint256 eta = block.timestamp + delay;
        bytes32 txHash = keccak256(abi.encode(_target, _value, _signature, _data, eta));
        
        require(queuedTransactions[txHash], "not queued");

        ScheduledAction storage action = scheduledActions[txHash];
        require(!action.executed, "already executed");
        require(!action.cancelled, "cancelled");
        require(block.timestamp >= action.scheduledAt + delay, "delay not met");
        require(block.timestamp <= action.scheduledAt + delay + GRACE_PERIOD, "tx expired");

        action.executed = true;

        bytes memory callData;
        if (bytes(_signature).length == 0) {
            callData = _data;
        } else {
            callData = abi.encodePacked(bytes4(keccak256(bytes(_signature))), _data);
        }

        (bool success, bytes memory returnData) = _target.call{value: _value}(callData);
        require(success, "execution failed");

        emit ExecuteTransaction(txHash, _target, _value, _signature, _data, eta);
        return returnData;
    }

    /**
     * @dev Check if a transaction is queued
     * @param _target Target contract address
     * @param _value ETH value to send
     * @param _signature Function signature
     * @param _data Encoded function parameters
     * @return True if queued
     */
    function isQueued(
        address _target,
        uint256 _value,
        string calldata _signature,
        bytes calldata _data
    ) external view returns (bool) {
        uint256 eta = block.timestamp + delay;
        bytes32 txHash = keccak256(abi.encode(_target, _value, _signature, _data, eta));
        return queuedTransactions[txHash];
    }

    /**
     * @dev Get action details
     * @param _txHash Transaction hash
     * @return Action details
     */
    function getAction(bytes32 _txHash)
        external
        view
        returns (ScheduledAction memory)
    {
        return scheduledActions[_txHash];
    }
}
