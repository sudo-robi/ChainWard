// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IOrbitRegistry {
    function getOperator(uint256 chainId) external view returns (address);
    function getHeartbeatThreshold(uint256 chainId) external view returns (uint256);
    function slashBond(uint256 chainId, uint256 amount, address payable recipient) external;
    function getBond(uint256 chainId) external view returns (uint256);
    function getChainMonitor(uint256 chainId) external view returns (address);
}

contract HealthMonitor {
    IOrbitRegistry public registry;

    // minimal slashing amount per incident (demo purpose)
    uint256 public constant SLASH_AMOUNT = 1 wei;

    // chainId => last heartbeat timestamp
    mapping(uint256 => uint256) public lastHeartbeat;
    // chainId => incident state
    mapping(uint256 => bool) public inIncident;

    // include l2SeqNumber in heartbeat event for Arbitrum-specific sequencing awareness
    event Heartbeat(uint256 indexed chainId, uint256 seqNumber, uint256 l2SeqNumber, uint256 timestamp);
    event HealthReport(uint256 indexed chainId, uint8 statusCode, string details, uint256 timestamp);
    event IncidentRaised(uint256 indexed chainId, uint256 lastHeartbeat, uint256 triggeredAt, string reason);
    event IncidentCleared(uint256 indexed chainId, uint256 clearedAt);

    constructor(address registryAddress) {
        registry = IOrbitRegistry(registryAddress);
    }

    // allow this contract to receive slashed ETH
    receive() external payable {}

    // Operator (or authorized reporter) submits periodic heartbeats.
    // Include an L2 sequence number to tie to Arbitrum sequencing assumptions.
    function submitHeartbeat(uint256 chainId, uint256 seqNumber, uint256 l2SeqNumber) external {
        address op = registry.getOperator(chainId);
        require(op != address(0), "no operator");
        require(msg.sender == op, "not operator");

        lastHeartbeat[chainId] = block.timestamp;
        inIncident[chainId] = false;
        emit Heartbeat(chainId, seqNumber, l2SeqNumber, block.timestamp);
    }

    // Anyone can submit structured health reports (for extra context).
    function reportHealth(uint256 chainId, uint8 statusCode, string calldata details) external {
        emit HealthReport(chainId, statusCode, details, block.timestamp);
    }

    // Trigger incident if heartbeat exceeded threshold
    function triggerIncidentIfExpired(uint256 chainId) external {
        uint256 threshold = registry.getHeartbeatThreshold(chainId);
        require(threshold > 0, "no threshold");

        uint256 last = lastHeartbeat[chainId];
        if (block.timestamp > last + threshold) {
            if (!inIncident[chainId]) {
                inIncident[chainId] = true;
                emit IncidentRaised(chainId, last, block.timestamp, "heartbeat_expired");
                // attempt a minimal slash to demonstrate on-chain enforcement
                // Note: registry must have been configured with this contract as monitor
                try registry.slashBond(chainId, SLASH_AMOUNT, payable(address(this))) {
                } catch {
                    // ignore slashing errors to avoid revert during demo
                }
            }
        }
    }

    function clearIncident(uint256 chainId) external {
        address op = registry.getOperator(chainId);
        require(op != address(0), "no operator");
        require(msg.sender == op, "not operator");
        require(inIncident[chainId], "no incident");

        inIncident[chainId] = false;
        emit IncidentCleared(chainId, block.timestamp);
    }
}
