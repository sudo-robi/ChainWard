// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title OrbitChainRegistry
 * @dev Declares monitored Orbit chains and their operational parameters.
 * This is the governance layer: which chains are we tracking, and what do we expect from them?
 */
contract OrbitChainRegistry {
    address public owner;
    address public pendingOwner; // 2-step owner transfer pattern

    struct ChainConfig {
        address operator;
        address pendingOperator; // 2-step operator transfer pattern
        uint256 operatorTransferTime; // when 2-step transfer started
        uint256 expectedBlockTime; // seconds between blocks
        uint256 maxBlockLag; // max acceptable lag in seconds
        bool isActive;
        string name;
    }

    mapping(uint256 => ChainConfig) public chains;

    uint256 public constant OPERATOR_TRANSFER_DELAY = 2 days;

    event ChainRegistered(
        uint256 indexed chainId,
        address indexed operator,
        uint256 expectedBlockTime,
        uint256 maxBlockLag,
        string name
    );
    event ChainUpdated(uint256 indexed chainId, uint256 expectedBlockTime, uint256 maxBlockLag);
    event ChainDeactivated(uint256 indexed chainId);
    event OwnerTransferInitiated(address indexed newOwner);
    event OwnerTransferAccepted(address indexed newOwner);
    event OperatorTransferInitiated(uint256 indexed chainId, address indexed newOperator);
    event OperatorTransferAccepted(uint256 indexed chainId, address indexed newOperator);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @dev Initiate 2-step owner transfer (safer than single-step)
    function initiateOwnerTransfer(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        require(newOwner != owner, "same owner");
        pendingOwner = newOwner;
        emit OwnerTransferInitiated(newOwner);
    }

    /// @dev Accept pending owner transfer (must be called by pendingOwner)
    function acceptOwnerTransfer() external {
        require(msg.sender == pendingOwner, "not pending owner");
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnerTransferAccepted(owner);
    }

    /// @dev Cancel pending owner transfer
    function cancelOwnerTransfer() external onlyOwner {
        pendingOwner = address(0);
    }

    function registerChain(
        uint256 chainId,
        address operator,
        uint256 expectedBlockTime,
        uint256 maxBlockLag,
        string calldata name
    ) external onlyOwner {
        require(!chains[chainId].isActive, "chain exists");
        require(operator != address(0), "invalid operator");
        require(expectedBlockTime > 0 && maxBlockLag > 0, "invalid params");
        require(bytes(name).length > 0, "empty name");

        chains[chainId] = ChainConfig({
            operator: operator,
            pendingOperator: address(0),
            operatorTransferTime: 0,
            expectedBlockTime: expectedBlockTime,
            maxBlockLag: maxBlockLag,
            isActive: true,
            name: name
        });

        emit ChainRegistered(chainId, operator, expectedBlockTime, maxBlockLag, name);
    }

    function updateThresholds(uint256 chainId, uint256 expectedBlockTime, uint256 maxBlockLag)
        external
        onlyOwner
    {
        require(chains[chainId].isActive, "no chain");
        require(expectedBlockTime > 0 && maxBlockLag > 0, "invalid params");
        chains[chainId].expectedBlockTime = expectedBlockTime;
        chains[chainId].maxBlockLag = maxBlockLag;
        emit ChainUpdated(chainId, expectedBlockTime, maxBlockLag);
    }

    function deactivateChain(uint256 chainId) external onlyOwner {
        require(chains[chainId].isActive, "no chain");
        chains[chainId].isActive = false;
        emit ChainDeactivated(chainId);
    }

    /// @dev Initiate 2-step operator transfer (safer: pending operator must accept)
    function initiateOperatorTransfer(uint256 chainId, address newOperator) external onlyOwner {
        require(chains[chainId].isActive, "no chain");
        require(newOperator != address(0), "zero operator");
        require(newOperator != chains[chainId].operator, "same operator");
        
        chains[chainId].pendingOperator = newOperator;
        chains[chainId].operatorTransferTime = block.timestamp;
        emit OperatorTransferInitiated(chainId, newOperator);
    }

    /// @dev Accept pending operator transfer (must wait OPERATOR_TRANSFER_DELAY and be called by pending operator)
    function acceptOperatorTransfer(uint256 chainId) external {
        require(chains[chainId].isActive, "no chain");
        require(msg.sender == chains[chainId].pendingOperator, "not pending operator");
        require(
            (block.timestamp - chains[chainId].operatorTransferTime) >= OPERATOR_TRANSFER_DELAY,
            "transfer delay not elapsed"
        );
        
        chains[chainId].operator = chains[chainId].pendingOperator;
        chains[chainId].pendingOperator = address(0);
        chains[chainId].operatorTransferTime = 0;
        emit OperatorTransferAccepted(chainId, chains[chainId].operator);
    }

    /// @dev Cancel pending operator transfer
    function cancelOperatorTransfer(uint256 chainId) external onlyOwner {
        require(chains[chainId].isActive, "no chain");
        chains[chainId].pendingOperator = address(0);
        chains[chainId].operatorTransferTime = 0;
    }

    function getChain(uint256 chainId) external view returns (ChainConfig memory) {
        return chains[chainId];
    }
}
