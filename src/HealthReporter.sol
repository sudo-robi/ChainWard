// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { OrbitChainRegistry } from "./OrbitChainRegistry.sol";
import { IncidentManager } from "./IncidentManager.sol";

/**
 * @title HealthReporter
 * @dev Accepts health signals from off-chain agents and triggers incidents based on thresholds.
 * This is the detection layer: on-chain logic that decides when something is wrong.
 * HARDENED: Input validation, rate limiting, block progression checking.
 */
contract HealthReporter {
    OrbitChainRegistry public registry;
    IncidentManager public incidents;
    address public reporter; // authorized to submit health signals

    struct HealthSignal {
        uint256 chainId;
        uint256 blockNumber;
        uint256 blockTimestamp;
        uint256 sequencerNumber;
        bool sequencerHealthy;
        string details;
    }

    HealthSignal[] public signals;
    mapping(uint256 => uint256) public lastBlockNumber; // chainId => last block number
    mapping(uint256 => uint256) public lastBlockTimestamp; // chainId => last block timestamp
    mapping(uint256 => uint256) public lastSignalTime; // chainId => last signal submit time (for rate limiting)
    mapping(uint256 => uint256) public lastIncidentTime; // chainId => last incident raised time (for cooldown)

    uint256 public constant INCIDENT_COOLDOWN = 300; // 5 minutes between incidents per chain
    uint256 public constant RATE_LIMIT_SECONDS = 30; // min 30s between health signals

    event HealthSignalReceived(
        uint256 indexed chainId, uint256 blockNumber, uint256 blockTimestamp, string details
    );
    event IncidentTriggered(
        uint256 indexed chainId,
        IncidentManager.FailureType failureType,
        string details
    );

    modifier onlyReporter() {
        _checkOnlyReporter();
        _;
    }

    function _checkOnlyReporter() internal view {
        require(msg.sender == reporter, "only reporter");
    }

    constructor(address _registry, address _incidents, address _reporter) {
        require(_registry != address(0), "zero registry");
        require(_incidents != address(0), "zero incidents");
        require(_reporter != address(0), "zero reporter");
        registry = OrbitChainRegistry(_registry);
        incidents = IncidentManager(_incidents);
        reporter = _reporter;
    }

    /// @dev Only incidents contract (owned by registry owner) can update reporter
    function setReporter(address _newReporter) external {
        require(msg.sender == address(incidents), "only incidents");
        require(_newReporter != address(0), "zero reporter");
        reporter = _newReporter;
    }

    function submitHealthSignal(
        uint256 chainId,
        uint256 blockNumber,
        uint256 blockTimestamp,
        uint256 sequencerNumber,
        bool sequencerHealthy,
        string calldata details
    ) external onlyReporter {
        // === INPUT VALIDATION ===
        require(blockNumber > 0, "invalid block number");
        require(blockTimestamp > 0, "invalid timestamp");
        require(bytes(details).length > 0, "empty details");
        require(bytes(details).length <= 512, "details too long");
        
        // === CHAIN STATE VALIDATION ===
        OrbitChainRegistry.ChainConfig memory config = registry.getChain(chainId);
        require(config.isActive, "chain not registered");

        // === BLOCK PROGRESSION VALIDATION ===
        uint256 prevBlockNumber = lastBlockNumber[chainId];
        uint256 prevBlockTimestamp = lastBlockTimestamp[chainId];
        
        if (prevBlockNumber > 0) {
            // Block number must strictly increase (detect reorgs)
            require(blockNumber > prevBlockNumber, "block must progress");
            
            // Timestamp must not decrease (prevent time travel)
            require(blockTimestamp >= prevBlockTimestamp, "timestamp cannot decrease");
        }
        
        // === RATE LIMITING ===
        uint256 lastTime = lastSignalTime[chainId];
        if (lastTime > 0) {
            require(
                (block.timestamp - lastTime) >= RATE_LIMIT_SECONDS,
                "rate limited: min 30s between signals"
            );
        }
        
        // === UPDATE STATE ===
        lastBlockNumber[chainId] = blockNumber;
        lastBlockTimestamp[chainId] = blockTimestamp;
        lastSignalTime[chainId] = block.timestamp;

        signals.push(
            HealthSignal({
                chainId: chainId,
                blockNumber: blockNumber,
                blockTimestamp: blockTimestamp,
                sequencerNumber: sequencerNumber,
                sequencerHealthy: sequencerHealthy,
                details: details
            })
        );

        emit HealthSignalReceived(chainId, blockNumber, blockTimestamp, details);

        // === INCIDENT DETECTION WITH COOLDOWN ===
        
        // 1. Block lag detection
        if (prevBlockNumber > 0) {
            uint256 blockLagSeconds = blockTimestamp - prevBlockTimestamp;
            if (blockLagSeconds > config.maxBlockLag) {
                _tryRaiseIncident(
                    chainId,
                    IncidentManager.FailureType.BlockLag,
                    IncidentManager.IncidentSeverity.Critical,
                    prevBlockNumber,
                    prevBlockTimestamp,
                    string(abi.encodePacked(
                        "Block lag: ",
                        _uint2str(blockLagSeconds),
                        "s (max: ",
                        _uint2str(config.maxBlockLag),
                        "s)"
                    ))
                );
            }
        }

        // 2. Sequencer stall detection
        if (!sequencerHealthy) {
            _tryRaiseIncident(
                chainId,
                IncidentManager.FailureType.SequencerStall,
                IncidentManager.IncidentSeverity.Critical,
                prevBlockNumber,
                prevBlockTimestamp,
                "Sequencer unhealthy status"
            );
        }
    }

    /// @dev Raise incident only if not in cooldown period
    function _tryRaiseIncident(
        uint256 chainId,
        IncidentManager.FailureType failureType,
        IncidentManager.IncidentSeverity severity,
        uint256 lastHealthyBlock,
        uint256 lastHealthyTimestamp,
        string memory description
    ) internal {
        uint256 lastIncident = lastIncidentTime[chainId];
        if (lastIncident == 0 || (block.timestamp - lastIncident) >= INCIDENT_COOLDOWN) {
            incidents.raiseIncident(
                chainId,
                failureType,
                severity,
                lastHealthyBlock,
                lastHealthyTimestamp,
                description
            );
            lastIncidentTime[chainId] = block.timestamp;
            emit IncidentTriggered(chainId, failureType, description);
        }
    }

    function getSignalCount() external view returns (uint256) {
        return signals.length;
    }

    function getSignal(uint256 index) external view returns (HealthSignal memory) {
        require(index < signals.length, "no signal");
        return signals[index];
    }

    /// @dev Convert uint256 to string for error messages
    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) return "0";
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - (_i / 10) * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }
}
