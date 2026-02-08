// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./SignalTypes.sol";

/**
 * @title IChainWardResponder
 * @dev Interface for ecosystem participants (bridges, vaults, relays) to respond to incidents
 * 
 * When a CRITICAL incident is raised, all registered responders are notified
 * and can take protective action (pause, halt messaging, trigger insurance, etc.)
 */
interface IChainWardResponder {
    /**
     * @dev Called when a new incident is raised on a monitored chain
     * @param chainId The Orbit chain experiencing the incident
     * @param signalType The type of failure detected (e.g., SEQUENCER_STALL)
     * @param severity Level of emergency (WARNING, CRITICAL, UNRECOVERABLE)
     * @param description Human-readable description of the incident
     * @return canRespond True if this responder can take action (false = no-op)
     * 
     * IMPORTANT: This function should be idempotent and gas-efficient.
     * It will be called synchronously during incident raising, so keep it lightweight.
     */
    function onIncidentRaised(
        uint256 chainId,
        SignalTypes.SignalType signalType,
        SignalTypes.Severity severity,
        string calldata description
    ) external returns (bool canRespond);
}

/**
 * @title ResponderRegistry
 * @dev Manages responders that get notified of incidents
 * 
 * Responders can be:
 * - Bridges (pause withdrawals from affected chain)
 * - Message relays (halt cross-chain messaging)
 * - Vaults (stop accepting deposits from affected chain)
 * - Insurance pools (trigger automatic payouts)
 * - Liquidation engines (halt liquidations during incident)
 */
contract ResponderRegistry {
    address public owner;
    
    // Responders registered for specific chains
    mapping(uint256 => address[]) public respondersByChain; // chainId => [responders]
    mapping(uint256 => mapping(address => uint256)) public responderIndex; // chainId => responder => index
    
    // Global responders (listen to all chains)
    address[] public globalResponders;
    mapping(address => uint256) public globalResponderIndex;
    
    // Minimum severity required to trigger responder
    // Example: CRITICAL responder only triggers on CRITICAL incidents
    mapping(address => SignalTypes.Severity) public responderMinSeverity;
    
    // Track responder execution (for gas optimization)
    mapping(address => uint256) public lastCallTime;
    mapping(address => uint256) public callFailureCount;
    
    event ResponderRegistered(uint256 indexed chainId, address indexed responder, bool isGlobal);
    event ResponderDeregistered(uint256 indexed chainId, address indexed responder, bool isGlobal);
    event ResponderCalled(
        uint256 indexed chainId,
        address indexed responder,
        SignalTypes.SignalType signalType,
        bool success,
        bytes returnData
    );
    event ResponderDisabled(address indexed responder, string reason);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    /**
     * @dev Register a responder for a specific chain
     * @param chainId The Orbit chain to monitor (0 for all chains)
     * @param responder The contract implementing IChainWardResponder
     * @param minSeverity Minimum severity to trigger this responder
     */
    function registerResponder(
        uint256 chainId,
        address responder,
        SignalTypes.Severity minSeverity
    ) external onlyOwner {
        require(responder != address(0), "zero responder");
        
        responderMinSeverity[responder] = minSeverity;
        
        if (chainId == 0) {
            // Global responder
            require(globalResponderIndex[responder] == 0, "already registered");
            globalResponders.push(responder);
            globalResponderIndex[responder] = globalResponders.length;
            emit ResponderRegistered(0, responder, true);
        } else {
            // Chain-specific responder
            require(responderIndex[chainId][responder] == 0, "already registered");
            respondersByChain[chainId].push(responder);
            responderIndex[chainId][responder] = respondersByChain[chainId].length;
            emit ResponderRegistered(chainId, responder, false);
        }
    }
    
    /**
     * @dev Deregister a responder
     */
    function deregisterResponder(uint256 chainId, address responder) external onlyOwner {
        if (chainId == 0) {
            // Global responder
            uint256 idx = globalResponderIndex[responder];
            require(idx > 0, "not registered");
            
            // Swap and pop
            address last = globalResponders[globalResponders.length - 1];
            globalResponders[idx - 1] = last;
            globalResponderIndex[last] = idx;
            
            globalResponders.pop();
            delete globalResponderIndex[responder];
            emit ResponderDeregistered(0, responder, true);
        } else {
            // Chain-specific responder
            uint256 idx = responderIndex[chainId][responder];
            require(idx > 0, "not registered");
            
            address[] storage responders = respondersByChain[chainId];
            address last = responders[responders.length - 1];
            responders[idx - 1] = last;
            responderIndex[chainId][last] = idx;
            
            responders.pop();
            delete responderIndex[chainId][responder];
            emit ResponderDeregistered(chainId, responder, false);
        }
    }
    
    /**
     * @dev Notify all responders of an incident (called by IncidentManager)
     * @return successCount Number of responders that successfully responded
     */
    function notifyResponders(
        uint256 chainId,
        SignalTypes.SignalType signalType,
        SignalTypes.Severity severity,
        string calldata description
    ) external returns (uint256 successCount) {
        // Call chain-specific responders
        address[] storage responders = respondersByChain[chainId];
        for (uint256 i = 0; i < responders.length; i++) {
            if (_callResponder(chainId, responders[i], signalType, severity, description)) {
                successCount++;
            }
        }
        
        // Call global responders
        for (uint256 i = 0; i < globalResponders.length; i++) {
            if (_callResponder(chainId, globalResponders[i], signalType, severity, description)) {
                successCount++;
            }
        }
    }
    
    /**
     * @dev Internal: Call a single responder with error handling
     */
    function _callResponder(
        uint256 chainId,
        address responder,
        SignalTypes.SignalType signalType,
        SignalTypes.Severity severity,
        string calldata description
    ) internal returns (bool) {
        // Check if this responder should be triggered at this severity level
        if (uint8(severity) < uint8(responderMinSeverity[responder])) {
            return false;
        }
        
        // Check if responder has been disabled due to repeated failures
        if (callFailureCount[responder] >= 3) {
            emit ResponderDisabled(responder, "too many failures");
            return false;
        }
        
        // Rate limiting: don't call the same responder multiple times in same block
        if (lastCallTime[responder] == block.timestamp) {
            return false;
        }
        
        // Try to call the responder (with try-catch to prevent revert cascade)
        try IChainWardResponder(responder).onIncidentRaised(
            chainId,
            signalType,
            severity,
            description
        ) returns (bool canRespond) {
            lastCallTime[responder] = block.timestamp;
            callFailureCount[responder] = 0; // reset failure count on success
            
            if (canRespond) {
                emit ResponderCalled(chainId, responder, signalType, true, "");
                return true;
            }
        } catch (bytes memory reason) {
            // Responder reverted or failed - don't let it break incident handling
            callFailureCount[responder]++;
            emit ResponderCalled(chainId, responder, signalType, false, reason);
            return false;
        }
        
        return false;
    }
    
    /**
     * @dev Get all responders for a chain
     */
    function getChainResponders(uint256 chainId) 
        external 
        view 
        returns (address[] memory) 
    {
        return respondersByChain[chainId];
    }
    
    /**
     * @dev Get all global responders
     */
    function getGlobalResponders() external view returns (address[] memory) {
        return globalResponders;
    }
    
    /**
     * @dev Total number of responders listening for a chain
     */
    function responderCount(uint256 chainId) 
        external 
        view 
        returns (uint256 chainSpecific, uint256 global) 
    {
        return (respondersByChain[chainId].length, globalResponders.length);
    }
}
