// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IChainMonitor {
    function inIncident(uint256 chainId) external view returns (bool);
}

contract OrbitRegistry {
    address public owner;
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        _checkOnlyOwner();
        _;
    }

    function _checkOnlyOwner() internal view {
        require(msg.sender == owner, "only owner");
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), owner);
    }

    struct ChainInfo {
        address operator;
        string metadataURI;
        uint256 heartbeatThreshold; // seconds
        bool exists;
        address monitor;
    }

    mapping(uint256 => ChainInfo) public chains;
    // bond stored per chain
    mapping(uint256 => uint256) public bonds;

    // authorized monitor contract allowed to slash bonds
    address public monitor; // deprecated, use per-chain monitor instead

    event ChainRegistered(uint256 indexed chainId, address indexed operator, string metadataURI, uint256 heartbeatThreshold);
    event ChainUpdated(uint256 indexed chainId, address indexed operator, uint256 heartbeatThreshold);
    event BondWithdrawn(uint256 indexed chainId, address indexed operator, uint256 amount);

    // only contract owner can register chains to avoid front-running/confusion
    function registerChain(uint256 chainId, address operator, string calldata metadataURI, uint256 heartbeatThreshold) external onlyOwner {
        require(!chains[chainId].exists, "chain exists");
        require(operator != address(0), "invalid operator");
        chains[chainId] = ChainInfo({ operator: operator, metadataURI: metadataURI, heartbeatThreshold: heartbeatThreshold, exists: true, monitor: address(0) });
        emit ChainRegistered(chainId, operator, metadataURI, heartbeatThreshold);
    }

    // deposit a bond for this chain (operator only)
    function depositBond(uint256 chainId) external payable {
        require(chains[chainId].exists, "no chain");
        require(msg.sender == chains[chainId].operator, "not operator");
        require(msg.value > 0, "no value");
        bonds[chainId] += msg.value;
    }

    // operator can withdraw bond only when there is no active incident
    function withdrawBond(uint256 chainId, uint256 amount) external {
        require(chains[chainId].exists, "no chain");
        require(msg.sender == chains[chainId].operator, "not operator");
        uint256 b = bonds[chainId];
        require(amount > 0 && amount <= b, "invalid amount");
        address mon = chains[chainId].monitor;
        if (mon != address(0)) {
            // if monitor reports an incident, block withdraw
            require(!IChainMonitor(mon).inIncident(chainId), "in incident");
        }
        bonds[chainId] = b - amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer failed");
        emit BondWithdrawn(chainId, msg.sender, amount);
    }

    // set per-chain monitor (operator only)
    function setChainMonitor(uint256 chainId, address _monitor) external {
        require(chains[chainId].exists, "no chain");
        require(msg.sender == chains[chainId].operator, "not operator");
        require(_monitor != address(0), "zero monitor");
        chains[chainId].monitor = _monitor;
    }

    // allow monitor (per-chain) to slash bond on incidents
    function slashBond(uint256 chainId, uint256 amount, address payable recipient) external {
        require(chains[chainId].exists, "no chain");
        require(msg.sender == chains[chainId].monitor, "only monitor");
        uint256 b = bonds[chainId];
        if (amount > b) amount = b;
        if (amount == 0) return;
        bonds[chainId] = b - amount;
        (bool ok, ) = recipient.call{value: amount}("");
        require(ok, "transfer failed");
    }

    function updateOperator(uint256 chainId, address newOperator) external {
        require(chains[chainId].exists, "no chain");
        require(msg.sender == chains[chainId].operator, "not operator");
        require(newOperator != address(0), "invalid operator");
        // two-step operator transfer: propose and accept
        // For simplicity in this MVP, we will require a direct update but emit event for audit
        chains[chainId].operator = newOperator;
        emit ChainUpdated(chainId, newOperator, chains[chainId].heartbeatThreshold);
    }

    function setHeartbeatThreshold(uint256 chainId, uint256 heartbeatThreshold) external {
        require(chains[chainId].exists, "no chain");
        require(msg.sender == chains[chainId].operator, "not operator");
        chains[chainId].heartbeatThreshold = heartbeatThreshold;
        emit ChainUpdated(chainId, chains[chainId].operator, heartbeatThreshold);
    }

    // convenience accessors
    function getOperator(uint256 chainId) external view returns (address) {
        return chains[chainId].operator;
    }

    function getBond(uint256 chainId) external view returns (uint256) {
        return bonds[chainId];
    }

    function getHeartbeatThreshold(uint256 chainId) external view returns (uint256) {
        return chains[chainId].heartbeatThreshold;
    }

    function getChainMonitor(uint256 chainId) external view returns (address) {
        return chains[chainId].monitor;
    }
}
