// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MultiSigGovernance
 * @dev Multi-signature governance for critical operations
 * Requires M of N signatures from designated signers to approve sensitive actions
 */
contract MultiSigGovernance {
    // Constants
    uint256 public constant MAX_SIGNERS = 10;

    // Structs
    struct Transaction {
        address target;
        uint256 value;
        bytes data;
        bool executed;
        uint256 numConfirmations;
        uint256 createdAt;
        uint256 expiresAt;
    }

    // State variables
    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256 public requiredConfirmations;
    
    Transaction[] public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmations;

    // Events
    event SignersUpdated(address[] newSigners, uint256 requiredConfirmations);
    event TransactionSubmitted(
        uint256 indexed txIndex,
        address indexed target,
        uint256 value,
        bytes data
    );
    event TransactionConfirmed(uint256 indexed txIndex, address indexed signer);
    event TransactionUnconfirmed(uint256 indexed txIndex, address indexed signer);
    event TransactionExecuted(uint256 indexed txIndex);
    event TransactionRevoked(uint256 indexed txIndex);

    // Modifiers
    modifier onlySigner() {
        require(isSigner[msg.sender], "not signer");
        _;
    }

    modifier txExists(uint256 _txIndex) {
        require(_txIndex < transactions.length, "tx does not exist");
        _;
    }

    modifier notExecuted(uint256 _txIndex) {
        require(!transactions[_txIndex].executed, "tx already executed");
        _;
    }

    modifier notConfirmed(uint256 _txIndex) {
        require(!confirmations[_txIndex][msg.sender], "tx already confirmed");
        _;
    }

    /**
     * @dev Constructor initializes signers &required confirmations
     * @param _signers List of signer addresses
     * @param _requiredConfirmations Number of signatures required
     */
    constructor(address[] memory _signers, uint256 _requiredConfirmations) {
        require(_signers.length > 0, "no signers");
        require(
            _requiredConfirmations > 0 && _requiredConfirmations <= _signers.length,
            "invalid required confirmations"
        );
        require(_signers.length <= MAX_SIGNERS, "too many signers");

        // Remove duplicates &set up signers
        for (uint256 i = 0; i < _signers.length; i++) {
            address signer = _signers[i];
            require(signer != address(0), "zero address");
            require(!isSigner[signer], "duplicate signer");
            isSigner[signer] = true;
            signers.push(signer);
        }

        requiredConfirmations = _requiredConfirmations;
    }

    /**
     * @dev Update signers &required confirmations (only callable by governance)
     * @param _signers New list of signers
     * @param _requiredConfirmations New required confirmations
     */
    function updateSigners(
        address[] memory _signers,
        uint256 _requiredConfirmations
    ) external {
        require(_signers.length > 0, "no signers");
        require(
            _requiredConfirmations > 0 && _requiredConfirmations <= _signers.length,
            "invalid required confirmations"
        );
        require(_signers.length <= MAX_SIGNERS, "too many signers");

        // Clear old signers
        for (uint256 i = 0; i < signers.length; i++) {
            isSigner[signers[i]] = false;
        }
        delete signers;

        // Set new signers
        for (uint256 i = 0; i < _signers.length; i++) {
            address signer = _signers[i];
            require(signer != address(0), "zero address");
            require(!isSigner[signer], "duplicate signer");
            isSigner[signer] = true;
            signers.push(signer);
        }

        requiredConfirmations = _requiredConfirmations;
        emit SignersUpdated(_signers, _requiredConfirmations);
    }

    /**
     * @dev Submit a transaction for approval
     * @param _target Target contract address
     * @param _value ETH value to send
     * @param _data Calldata for the transaction
     */
    function submitTransaction(
        address _target,
        uint256 _value,
        bytes calldata _data
    ) external onlySigner returns (uint256) {
        uint256 txIndex = transactions.length;
        
        transactions.push(
            Transaction({
                target: _target,
                value: _value,
                data: _data,
                executed: false,
                numConfirmations: 0,
                createdAt: block.timestamp,
                expiresAt: block.timestamp + 7 days
            })
        );

        emit TransactionSubmitted(txIndex, _target, _value, _data);
        return txIndex;
    }

    /**
     * @dev Confirm a transaction
     * @param _txIndex Index of the transaction
     */
    function confirmTransaction(uint256 _txIndex)
        external
        onlySigner
        txExists(_txIndex)
        notExecuted(_txIndex)
        notConfirmed(_txIndex)
    {
        confirmations[_txIndex][msg.sender] = true;
        transactions[_txIndex].numConfirmations += 1;
        emit TransactionConfirmed(_txIndex, msg.sender);
    }

    /**
     * @dev Execute a transaction if it has enough confirmations
     * @param _txIndex Index of the transaction
     */
    function executeTransaction(uint256 _txIndex)
        external
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];
        
        require(transaction.numConfirmations >= requiredConfirmations, "not confirmed");
        require(block.timestamp <= transaction.expiresAt, "tx expired");

        transaction.executed = true;

        (bool success, ) = transaction.target.call{value: transaction.value}(
            transaction.data
        );
        require(success, "tx failed");

        emit TransactionExecuted(_txIndex);
    }

    /**
     * @dev Unconfirm a transaction
     * @param _txIndex Index of the transaction
     */
    function unconfirmTransaction(uint256 _txIndex)
        external
        onlySigner
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        require(confirmations[_txIndex][msg.sender], "tx not confirmed");
        confirmations[_txIndex][msg.sender] = false;
        transactions[_txIndex].numConfirmations -= 1;
        emit TransactionUnconfirmed(_txIndex, msg.sender);
    }

    /**
     * @dev Revoke a transaction before execution
     * @param _txIndex Index of the transaction
     */
    function revokeTransaction(uint256 _txIndex)
        external
        onlySigner
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        require(confirmations[_txIndex][msg.sender], "tx not confirmed");
        confirmations[_txIndex][msg.sender] = false;
        transactions[_txIndex].numConfirmations -= 1;
        emit TransactionRevoked(_txIndex);
    }

    // View functions
    function getSignerCount() external view returns (uint256) {
        return signers.length;
    }

    function getSigner(uint256 _index) external view returns (address) {
        return signers[_index];
    }

    function getTransactionCount() external view returns (uint256) {
        return transactions.length;
    }

    function getTransaction(uint256 _txIndex)
        external
        view
        returns (
            address target,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 numConfirmations
        )
    {
        Transaction storage transaction = transactions[_txIndex];
        return (
            transaction.target,
            transaction.value,
            transaction.data,
            transaction.executed,
            transaction.numConfirmations
        );
    }

    function isConfirmed(uint256 _txIndex, address _signer)
        external
        view
        returns (bool)
    {
        return confirmations[_txIndex][_signer];
    }
}
