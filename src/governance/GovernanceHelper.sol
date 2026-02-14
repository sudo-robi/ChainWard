// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title GovernanceHelper
 * @dev Helper contract for common governance operations
 * Simplifies interaction with MultiSigGovernance &Timelock
 */

interface IMultiSigGovernance {
    function submitTransaction(
        address target,
        uint256 value,
        bytes calldata data
    ) external returns (uint256);

    function confirmTransaction(uint256 txIndex) external;

    function executeTransaction(uint256 txIndex) external;

    function getTransactionCount() external view returns (uint256);

    function getTransaction(uint256 txIndex)
        external
        view
        returns (
            address target,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 numConfirmations
        );
}

interface ITimelock {
    function queueTransaction(
        address target,
        uint256 value,
        string calldata signature,
        bytes calldata data
    ) external returns (bytes32);

    function executeTransaction(
        address target,
        uint256 value,
        string calldata signature,
        bytes calldata data
    ) external payable returns (bytes memory);
}

contract GovernanceHelper {
    // Constants for common operations
    bytes4 public constant SET_RATE_LIMIT_SIG =
        bytes4(keccak256("setGlobalLimit(uint256,uint256)"));
    bytes4 public constant ADD_PAUSER_SIG =
        bytes4(keccak256("addPauser(address,uint256)"));
    bytes4 public constant PAUSE_SYSTEM_SIG =
        bytes4(keccak256("pauseSystem(string)"));

    address public owner;
    IMultiSigGovernance public multiSig;
    ITimelock public timelock;

    event GovernanceActionProposed(
        string actionType,
        address indexed target,
        string description
    );
    event GovernanceActionExecuted(
        string actionType,
        address indexed target,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor(address _multiSig, address _timelock) {
        owner = msg.sender;
        multiSig = IMultiSigGovernance(_multiSig);
        timelock = ITimelock(_timelock);
    }

    /**
     * @dev Propose to update rate limiter global limit
     * @param newMax New maximum submissions
     * @param newWindow New time window
     */
    function proposeSetRateLimit(
        address rateLimiterAddress,
        uint256 newMax,
        uint256 newWindow,
        string calldata description
    ) external onlyOwner returns (uint256 txIndex) {
        bytes memory data = abi.encodeWithSelector(
            SET_RATE_LIMIT_SIG,
            newMax,
            newWindow
        );

        txIndex = multiSig.submitTransaction(rateLimiterAddress, 0, data);

        emit GovernanceActionProposed("SET_RATE_LIMIT", rateLimiterAddress, description);

        return txIndex;
    }

    /**
     * @dev Propose to add a new pauser
     * @param emergencyPauseAddress Address of EmergencyPause contract
     * @param newPauser Address to grant pause authority
     * @param weight Weight of the pauser
     */
    function proposeAddPauser(
        address emergencyPauseAddress,
        address newPauser,
        uint256 weight,
        string calldata description
    ) external onlyOwner returns (uint256 txIndex) {
        bytes memory data = abi.encodeWithSelector(
            ADD_PAUSER_SIG,
            newPauser,
            weight
        );

        txIndex = multiSig.submitTransaction(emergencyPauseAddress, 0, data);

        emit GovernanceActionProposed("ADD_PAUSER", emergencyPauseAddress, description);

        return txIndex;
    }

    /**
     * @dev Confirm a proposed governance action
     * @param txIndex Index of the transaction
     */
    function confirmGovernanceAction(uint256 txIndex) external {
        multiSig.confirmTransaction(txIndex);
    }

    /**
     * @dev Execute a confirmed governance action
     * @param txIndex Index of the transaction
     */
    function executeGovernanceAction(uint256 txIndex) external {
        multiSig.executeTransaction(txIndex);

        (address target, , , , ) = multiSig.getTransaction(txIndex);

        emit GovernanceActionExecuted("MULTI_SIG", target, block.timestamp);
    }

    /**
     * @dev Queue action via timelock
     * @param target Target contract
     * @param value ETH value
     * @param signature Function signature
     * @param data Encoded parameters
     */
    function queueTimelockAction(
        address target,
        uint256 value,
        string calldata signature,
        bytes calldata data,
        string calldata description
    ) external onlyOwner returns (bytes32 txHash) {
        txHash = timelock.queueTransaction(target, value, signature, data);

        emit GovernanceActionProposed("TIMELOCK_QUEUE", target, description);

        return txHash;
    }

    /**
     * @dev Execute timelock action after delay
     * @param target Target contract
     * @param value ETH value
     * @param signature Function signature
     * @param data Encoded parameters
     */
    function executeTimelockAction(
        address target,
        uint256 value,
        string calldata signature,
        bytes calldata data
    ) external payable returns (bytes memory result) {
        result = timelock.executeTransaction(target, value, signature, data);

        emit GovernanceActionExecuted("TIMELOCK_EXECUTE", target, block.timestamp);

        return result;
    }

    /**
     * @dev Get pending multi-sig transactions
     */
    function getPendingMultiSigTransactions()
        external
        view
        returns (uint256[] memory)
    {
        uint256 total = multiSig.getTransactionCount();
        uint256[] memory pending = new uint256[](total);
        uint256 count = 0;

        for (uint256 i = 0; i < total; i++) {
            (, , , bool executed, ) = multiSig.getTransaction(i);
            if (!executed) {
                pending[count] = i;
                count++;
            }
        }

        // Trim array to actual size
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = pending[i];
        }

        return result;
    }

    /**
     * @dev Get transaction details
     */
    function getMultiSigTransactionDetails(uint256 txIndex)
        external
        view
        returns (
            address target,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 confirmations
        )
    {
        return multiSig.getTransaction(txIndex);
    }
}
