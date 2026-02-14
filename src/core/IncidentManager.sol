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

    enum Priority {
        P0, // Immediate action required
        P1, // High priority
        P2, // Medium priority
        P3  // Low priority/Info
    }

    enum FailureType {
        SequencerStall,
        BlockLag,
        MessageQueueFailure,
        OperatorError,
        BridgeStall,
        CascadingFailure,
        Unknown
    }

    struct Incident {
        uint256 chainId;
        uint256 detectedAt; 
        uint256 resolvedAt;
        FailureType failureType;
        IncidentSeverity severity;
        Priority priority;
        uint256 lastHealthyBlock;
        uint256 lastHealthyTimestamp;
        string description;
        bool resolved;
        uint256 parentIncidentId; // For aggregation
        string rcaTag; // Root Cause Analysis
    }

    address public owner;
    address public registry;
    address public reporterContract; 
    mapping(uint256 => Incident) public incidents;
    uint256[] public allIncidentIds;
    uint256 public totalActiveIncidents;
    mapping(uint256 => bool) public incidentExists;
    mapping(uint256 => uint256[]) public chainIncidents; // chainId => incident IDs
    mapping(address => bool) public authorizedReporters;
    mapping(uint256 => string[]) public incidentComments;

    event IncidentRaised(
        uint256 indexed incidentId,
        uint256 indexed chainId,
        uint8 indexed failureType,
        uint8 severity,
        uint8 priority,
        string description,
        uint256 timestamp
    );
    event IncidentResolved(uint256 indexed incidentId, uint256 indexed chainId, string reason, uint256 timestamp, uint256 resolvedAt);
    event IncidentCommentAdded(uint256 indexed incidentId, string comment, uint256 timestamp);
    event RCATagSet(uint256 indexed incidentId, string tag);
    event CascadingFailureDetected(uint256 activeIncidents, uint256 timestamp);
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
        require(msg.sender == reporterContract || msg.sender == owner || authorizedReporters[msg.sender], "unauthorized");
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
        Priority priority,
        uint256 lastHealthyBlock,
        uint256 lastHealthyTimestamp,
        string calldata description,
        uint256 parentIncidentId
    ) external returns (uint256) {
        require(msg.sender == reporterContract || msg.sender == owner || authorizedReporters[msg.sender], "unauthorized");
        
        uint256 r = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, block.prevrandao)));
        uint256 incidentId = (r % 9900) + 100;
        
        while (incidentExists[incidentId]) {
            incidentId++;
            if (incidentId >= 10000) incidentId = 100;
        }

        incidents[incidentId] = Incident({
                chainId: chainId,
                detectedAt: block.timestamp,
                resolvedAt: 0,
                failureType: failureType,
                severity: severity,
                priority: priority,
                lastHealthyBlock: lastHealthyBlock,
                lastHealthyTimestamp: lastHealthyTimestamp,
                description: description,
                resolved: false,
                parentIncidentId: parentIncidentId,
                rcaTag: ""
            });
        
        allIncidentIds.push(incidentId);
        chainIncidents[chainId].push(incidentId);
        incidentExists[incidentId] = true;
        totalActiveIncidents++;

        // Detect Cascading Failure
        if (totalActiveIncidents >= 3) {
            emit CascadingFailureDetected(totalActiveIncidents, block.timestamp);
        }

        emit IncidentRaised(
            incidentId, chainId, uint8(failureType), uint8(severity), uint8(priority), description, block.timestamp
        );
        return incidentId;
    }

    function resolveIncident(uint256 incidentId, string calldata reason) external {
        require(msg.sender == registry || msg.sender == owner || msg.sender == reporterContract || authorizedReporters[msg.sender], "unauthorized resolution");
        require(incidentExists[incidentId], "no incident");
        require(bytes(reason).length > 0, "empty reason");
        Incident storage inc = incidents[incidentId];
        require(!inc.resolved, "already resolved");

        inc.resolved = true;
        inc.resolvedAt = block.timestamp;
        if (totalActiveIncidents > 0) totalActiveIncidents--;
        emit IncidentResolved(incidentId, inc.chainId, reason, block.timestamp, block.timestamp);
    }

    function addComment(uint256 incidentId, string calldata comment) external {
        require(incidentExists[incidentId], "no incident");
        require(bytes(comment).length > 0, "empty comment");
        require(msg.sender == registry || msg.sender == owner || authorizedReporters[msg.sender], "unauthorized comment");
        incidentComments[incidentId].push(comment);
        emit IncidentCommentAdded(incidentId, comment, block.timestamp);
    }

    function setRCATag(uint256 incidentId, string calldata tag) external onlyOwner {
        require(incidentExists[incidentId], "no incident");
        incidents[incidentId].rcaTag = tag;
        emit RCATagSet(incidentId, tag);
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

    function getIncidentComments(uint256 incidentId) external view returns (string[] memory) {
        return incidentComments[incidentId];
    }

    function getChainIncidents(uint256 chainId) external view returns (uint256[] memory) {
        return chainIncidents[chainId];
    }

    function getIncidentCount() external view returns (uint256) {
        return allIncidentIds.length;
    }
}
