// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./SignalTypes.sol";

/**
 * @title IChainValidator
 * @dev Pluggable validator interface for different chain types
 * 
 * Different rollup types (Orbit, OP Stack, StarkNet, etc.) have different
 * ways to prove chain health. This interface allows ChainWard to work with any rollup.
 * 
 * Examples:
 * - OrbitValidator: Checks sequencer heartbeat + block time
 * - OPStackValidator: Checks batch posting to Ethereum
 * - StarkNetValidator: Checks state root updates on Starknet
 */
interface IChainValidator {
    /**
     * @dev Validate a health signal for this chain type
     * @param chainId The chain being monitored
     * @param signalType What type of signal (BLOCK_PRODUCED, STATE_ROOT_CHANGED, etc.)
     * @param data The proof data (encoded per signal type)
     * @return isValid True if the signal is valid for this chain
     * @return reason Human-readable explanation if invalid
     */
    function validateSignal(
        uint256 chainId,
        SignalTypes.SignalType signalType,
        bytes calldata data
    ) external view returns (bool isValid, string memory reason);
    
    /**
     * @dev Get default threshold for a signal type on this chain
     * @return thresholdValue The numeric threshold (e.g., 2 seconds for BLOCK_PRODUCED)
     */
    function getDefaultThreshold(SignalTypes.SignalType signalType)
        external
        view
        returns (uint256 thresholdValue);
    
    /**
     * @dev Chain type identifier (e.g., "ORBIT", "OP_STACK", "STARKNET")
     */
    function chainType() external view returns (string memory);
}

/**
 * @title ChainTypeRegistry
 * @dev Maps chain IDs to their validator implementations
 * 
 * Enables ChainWard to work with:
 * - Different rollup stacks (Arbitrum Orbit, Optimism OP Stack, etc.)
 * - Custom chain implementations
 * - New rollup types as they emerge
 */
contract ChainTypeRegistry {
    address public owner;
    
    // Chain type definitions
    enum ChainType {
        ARBITRUM_ORBIT,     // uint8(0)
        OP_STACK,           // uint8(1)
        STARKNET,           // uint8(2)
        CUSTOM              // uint8(3)
    }
    
    // Mapping chain ID to its validator
    mapping(uint256 => IChainValidator) public chainValidators;
    mapping(uint256 => ChainType) public chainTypes;
    
    // Validator implementations for each type
    mapping(uint8 => address) public validatorImplementations;
    
    // Chain configurations (thresholds, etc.)
    struct ChainConfig {
        uint256 chainId;
        ChainType chainType;
        address validator;
        uint256 expectedBlockTime;
        uint256 maxBlockLag;
        uint256 batchInterval;
        uint256 finalizationTime;
        bool isActive;
    }
    
    mapping(uint256 => ChainConfig) public configs;
    
    event ChainTypeRegistered(
        uint256 indexed chainId,
        uint8 indexed chainType,
        address indexed validator
    );
    event ChainTypeUpdated(uint256 indexed chainId, address indexed newValidator);
    event ValidatorImplementationSet(uint8 indexed chainType, address indexed validator);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    // ============ CHAIN TYPE REGISTRATION ============
    
    /**
     * @dev Register a chain with a specific chain type
     * @param chainId The Orbit/child chain ID
     * @param chainType The rollup type (ORBIT, OP_STACK, etc.)
     * @param validator Custom validator contract (or zero for default)
     */
    function registerChainType(
        uint256 chainId,
        ChainType chainType,
        address validator,
        uint256 expectedBlockTime,
        uint256 maxBlockLag,
        uint256 batchInterval,
        uint256 finalizationTime
    ) external onlyOwner {
        require(chainId > 0, "invalid chain id");
        require(expectedBlockTime > 0, "invalid block time");
        
        // If no custom validator, use type default
        if (validator == address(0)) {
            validator = validatorImplementations[uint8(chainType)];
        }
        require(validator != address(0), "no validator for type");
        
        chainValidators[chainId] = IChainValidator(validator);
        chainTypes[chainId] = chainType;
        
        configs[chainId] = ChainConfig({
            chainId: chainId,
            chainType: chainType,
            validator: validator,
            expectedBlockTime: expectedBlockTime,
            maxBlockLag: maxBlockLag,
            batchInterval: batchInterval,
            finalizationTime: finalizationTime,
            isActive: true
        });
        
        emit ChainTypeRegistered(chainId, uint8(chainType), validator);
    }
    
    /**
     * @dev Update validator for a chain (in case implementation changes)
     */
    function updateChainValidator(uint256 chainId, address newValidator)
        external
        onlyOwner
    {
        require(chainId > 0, "invalid chain id");
        require(newValidator != address(0), "zero validator");
        require(configs[chainId].isActive, "chain not registered");
        
        chainValidators[chainId] = IChainValidator(newValidator);
        configs[chainId].validator = newValidator;
        
        emit ChainTypeUpdated(chainId, newValidator);
    }
    
    /**
     * @dev Set default validator implementation for a chain type
     */
    function setValidatorImplementation(ChainType chainType, address validator)
        external
        onlyOwner
    {
        require(validator != address(0), "zero validator");
        validatorImplementations[uint8(chainType)] = validator;
        emit ValidatorImplementationSet(uint8(chainType), validator);
    }
    
    // ============ VALIDATION ============
    
    /**
     * @dev Validate a signal for a specific chain
     */
    function validateSignal(
        uint256 chainId,
        SignalTypes.SignalType signalType,
        bytes calldata signalData
    ) external view returns (bool isValid, string memory reason) {
        IChainValidator validator = chainValidators[chainId];
        require(address(validator) != address(0), "no validator for chain");
        
        return validator.validateSignal(chainId, signalType, signalData);
    }
    
    /**
     * @dev Get threshold for a signal on a specific chain
     */
    function getSignalThreshold(uint256 chainId, SignalTypes.SignalType signalType)
        external
        view
        returns (uint256 threshold)
    {
        IChainValidator validator = chainValidators[chainId];
        require(address(validator) != address(0), "no validator for chain");
        
        return validator.getDefaultThreshold(signalType);
    }
    
    // ============ VIEWS ============
    
    /**
     * @dev Get chain configuration
     */
    function getChainConfig(uint256 chainId)
        external
        view
        returns (ChainConfig memory)
    {
        return configs[chainId];
    }
    
    /**
     * @dev Get chain type
     */
    function getChainType(uint256 chainId)
        external
        view
        returns (string memory)
    {
        IChainValidator validator = chainValidators[chainId];
        require(address(validator) != address(0), "no validator for chain");
        
        return validator.chainType();
    }
    
    /**
     * @dev Check if chain is active
     */
    function isChainActive(uint256 chainId) external view returns (bool) {
        return configs[chainId].isActive;
    }
}

// ============ EXAMPLE VALIDATOR IMPLEMENTATIONS ============

/**
 * @title OrbitValidator
 * @dev Validator for Arbitrum Orbit chains
 * 
 * Orbit chains:
 * - Have sequencers that produce blocks
 * - Post batches to parent chain (Arbitrum One or Ethereum)
 * - Use fraud proofs for security
 */
contract OrbitValidator is IChainValidator {
    address public owner;
    
    // Precomputed thresholds for Orbit
    mapping(uint8 => uint256) public thresholds;
    
    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }
    
    constructor() {
        owner = msg.sender;
        
        // Set default thresholds (in seconds)
        thresholds[uint8(SignalTypes.SignalType.BLOCK_PRODUCED)] = 2;
        thresholds[uint8(SignalTypes.SignalType.STATE_ROOT_CHANGED)] = 10;
        thresholds[uint8(SignalTypes.SignalType.BATCH_POSTED)] = 600;
        thresholds[uint8(SignalTypes.SignalType.GAP_IN_BATCHES)] = 1200;
        thresholds[uint8(SignalTypes.SignalType.TXN_CENSORSHIP)] = 1;
    }
    
    function validateSignal(
        uint256 chainId,
        SignalTypes.SignalType signalType,
        bytes calldata data
    ) external view override returns (bool isValid, string memory reason) {
        // Orbit-specific validation logic
        
        if (signalType == SignalTypes.SignalType.BLOCK_PRODUCED) {
            // Check: is new block within expected time?
            (uint256 blockTime, uint256 expectedTime) = abi.decode(data, (uint256, uint256));
            if (blockTime > expectedTime) {
                return (false, "block produced too late");
            }
            return (true, "");
        }
        
        if (signalType == SignalTypes.SignalType.STATE_ROOT_CHANGED) {
            // Check: is new state root different from previous?
            (bytes32 oldRoot, bytes32 newRoot) = abi.decode(data, (bytes32, bytes32));
            if (oldRoot == newRoot) {
                return (false, "state root did not change");
            }
            return (true, "");
        }
        
        if (signalType == SignalTypes.SignalType.TXN_CENSORSHIP) {
            // Check: is public transaction included?
            (bool isIncluded) = abi.decode(data, (bool));
            if (!isIncluded) {
                return (false, "transaction censored");
            }
            return (true, "");
        }
        
        return (false, "unsupported signal type");
    }
    
    function getDefaultThreshold(SignalTypes.SignalType signalType)
        external
        view
        override
        returns (uint256)
    {
        return thresholds[uint8(signalType)];
    }
    
    function chainType() external pure override returns (string memory) {
        return "ARBITRUM_ORBIT";
    }
    
    function setThreshold(uint8 signalTypeId, uint256 value) external onlyOwner {
        thresholds[signalTypeId] = value;
    }
}

/**
 * @title OPStackValidator
 * @dev Validator for Optimism OP Stack chains
 * 
 * OP Stack chains:
 * - Sequencers post transactions to Ethereum
 * - State commitments posted to Ethereum (every N transactions)
 * - Fraud proofs for incorrect state
 */
contract OPStackValidator is IChainValidator {
    address public owner;
    mapping(uint8 => uint256) public thresholds;
    
    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }
    
    constructor() {
        owner = msg.sender;
        
        // OP Stack has longer batch intervals
        thresholds[uint8(SignalTypes.SignalType.BATCH_POSTED)] = 30 minutes;
        thresholds[uint8(SignalTypes.SignalType.BATCH_CONFIRMED)] = 2 hours;
    }
    
    function validateSignal(
        uint256 chainId,
        SignalTypes.SignalType signalType,
        bytes calldata data
    ) external view override returns (bool isValid, string memory reason) {
        if (signalType == SignalTypes.SignalType.BATCH_POSTED) {
            (bool batchPosted) = abi.decode(data, (bool));
            if (!batchPosted) {
                return (false, "batch not posted to l1");
            }
            return (true, "");
        }
        
        if (signalType == SignalTypes.SignalType.BATCH_CONFIRMED) {
            (bool confirmed) = abi.decode(data, (bool));
            if (!confirmed) {
                return (false, "batch not confirmed on l1");
            }
            return (true, "");
        }
        
        return (false, "unsupported signal type");
    }
    
    function getDefaultThreshold(SignalTypes.SignalType signalType)
        external
        view
        override
        returns (uint256)
    {
        return thresholds[uint8(signalType)];
    }
    
    function chainType() external pure override returns (string memory) {
        return "OP_STACK";
    }
}
