// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title OrbitChainRegistry
 * @dev Declares monitored Orbit chains &their operational parameters.
 * This is the governance layer: which chains are we tracking, &what do we expect from them?
 */
contract OrbitChainRegistry {
    address public owner;
    address public pendingOwner; // 2-step owner transfer pattern

    struct ChainConfig {
        address operator;
        uint256 expectedBlockTime;
        uint256 maxBlockLag; 
        bool isActive;
        string name;
    }

    mapping(uint256 => ChainConfig) public chains;
    uint256[] public chainIds;
    mapping(uint256 => uint256) public bonds;

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
    event BondWithdrawn(uint256 indexed chainId, address indexed operator, uint256 amount);

    modifier onlyOwner() {
        _checkOnlyOwner();
        _;
    }

    function _checkOnlyOwner() internal view {
        require(msg.sender == owner, "only owner");
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
            expectedBlockTime: expectedBlockTime,
            maxBlockLag: maxBlockLag,
            isActive: true,
            name: name
        });
        chainIds.push(chainId);

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

    function getChain(uint256 chainId) external view returns (ChainConfig memory) {
        return chains[chainId];
    }

    // deposit a bond for this chain (operator only)
    function depositBond(uint256 chainId) external payable {
        require(chains[chainId].isActive, "no chain");
        require(msg.sender == chains[chainId].operator, "not operator");
        require(msg.value > 0, "no value");
        bonds[chainId] += msg.value;
    }

    // operator can withdraw bond
    function withdrawBond(uint256 chainId, uint256 amount) external {
        require(chains[chainId].isActive, "no chain");
        require(msg.sender == chains[chainId].operator, "not operator");
        uint256 b = bonds[chainId];
        require(amount > 0 && amount <= b, "invalid amount");
        
        bonds[chainId] = b - amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer failed");
        emit BondWithdrawn(chainId, msg.sender, amount);
    }

    function getBond(uint256 chainId) external view returns (uint256) {
        return bonds[chainId];
    }

    function getOperator(uint256 chainId) external view returns (address) {
        return chains[chainId].operator;
    }

    function getHeartbeatThreshold(uint256 chainId) external view returns (uint256) {
        return chains[chainId].maxBlockLag;
    }

    function getChainIds() external view returns (uint256[] memory) {
        return chainIds;
    }
}
