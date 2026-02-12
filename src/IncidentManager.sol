// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IncidentManager
 * @dev Records Orbit chain incidents with full forensic detail.
 * This is the credibility layer: permanent, timestamped, auditable incident records.
 */
contract IncidentManager {
    enum IncidentSeverity {
        Warning,
        Critical,
        Resolved
    }

    enum FailureType {
        SequencerStall,
        BlockLag,
        MessageQueueFailure,
        OperatorError,
        Unknown
    }

    struct Incident {
        uint256 chainId;
        uint256 detectedAt; // block timestamp
        FailureType failureType;
        IncidentSeverity severity;
        uint256 lastHealthyBlock;
        uint256 lastHealthyTimestamp;
        string description;
        bool resolved;
    }

    address public owner;
    address public registry;
    address public reporterContract; // HealthReporter contract address

    mapping(uint256 => Incident) public incidents;
    uint256[] public allIncidentIds;
    mapping(uint256 => bool) public incidentExists;
    mapping(uint256 => uint256[]) public chainIncidents; // chainId => incident IDs
    mapping(address => bool) public authorizedReporters;

    event IncidentRaised(
        uint256 indexed incidentId,
        uint256 indexed chainId,
        uint8 indexed failureType,
        uint8 severity,
        string description,
        uint256 timestamp
    );
    event IncidentResolved(uint256 indexed incidentId, uint256 indexed chainId, string reason, uint256 timestamp);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        _checkOnlyOwner();
        _;
    }

    modifier onlyRegistry() {
        _checkOnlyRegistry();
        _;
    }

    modifier onlyReporterContract() {
        _checkOnlyReporterContract();
        _;
    }

    function _checkOnlyOwner() internal view {
        require(msg.sender == owner, "only owner");
    }

    function _checkOnlyRegistry() internal view {
        require(msg.sender == registry, "only registry");
    }

    function _checkOnlyReporterContract() internal view {
        require(msg.sender == reporterContract, "only reporter contract");
    }

    constructor() {
        owner = msg.sender;
    }

    function setRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "zero registry");
        registry = _registry;
    }

    function setReporterContract(address _reporter) external onlyOwner {
        require(_reporter != address(0), "zero reporter");
        reporterContract = _reporter;
    }

    function setReporterAuthorization(address reporter, bool authorized) external onlyOwner {
        authorizedReporters[reporter] = authorized;
    }

    function raiseIncident(
        uint256 chainId,
        FailureType failureType,
        IncidentSeverity severity,
        uint256 lastHealthyBlock,
        uint256 lastHealthyTimestamp,
        string calldata description
    ) external returns (uint256) {
        require(msg.sender == reporterContract || msg.sender == owner || authorizedReporters[msg.sender], "unauthorized");
        
        // Generate pseudo-random ID between 100 and 10000
        uint256 r = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, block.prevrandao)));
        uint256 incidentId = (r % 9900) + 100;
        
        // Simple linear probing for collision resolution
        while (incidentExists[incidentId]) {
            incidentId++;
            if (incidentId >= 10000) incidentId = 100;
        }

        incidents[incidentId] = Incident({
                chainId: chainId,
                detectedAt: block.timestamp,
                failureType: failureType,
                severity: severity,
                lastHealthyBlock: lastHealthyBlock,
                lastHealthyTimestamp: lastHealthyTimestamp,
                description: description,
                resolved: false
            });
        
        allIncidentIds.push(incidentId);
        chainIncidents[chainId].push(incidentId);
        incidentExists[incidentId] = true;

        emit IncidentRaised(
            incidentId, chainId, uint8(failureType), uint8(severity), description, block.timestamp
        );
        return incidentId;
    }

    function resolveIncident(uint256 incidentId, string calldata reason) external onlyRegistry {
        require(incidentExists[incidentId], "no incident");
        require(bytes(reason).length > 0, "empty reason");
        Incident storage inc = incidents[incidentId];
        require(!inc.resolved, "already resolved");

        inc.resolved = true;
        emit IncidentResolved(incidentId, inc.chainId, reason, block.timestamp);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function getIncident(uint256 incidentId) external view returns (Incident memory) {
        require(incidentExists[incidentId], "no incident");
        return incidents[incidentId];
    }

    function getChainIncidents(uint256 chainId) external view returns (uint256[] memory) {
        return chainIncidents[chainId];
    }

    function getIncidentCount() external view returns (uint256) {
        return allIncidentIds.length;
    }
}
