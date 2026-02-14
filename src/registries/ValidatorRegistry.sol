// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { SignalTypes } from "src/types/SignalTypes.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ValidatorRegistry
 * @dev Economic security layer for ChainWard with flexible governance
 * 
 * Problem: Anyone can submit signals. Reporters could lie or spam false incidents.
 * 
 * Solution: Staking + Arbitration
 * - Reporters must bond tokens to submit signals
 * - Validators can challenge suspicious signals
 * - Arbitrator decides truth within N blocks
 * - Loser's bond is Service Level Agreementshed; winner gets portion
 * 
 * Governance:
 * - Can be deployed with simple owner (backward compatible)
 * - Or with AccessControl for multisig/DAO governance
 * - Supports both ARBITRATOR_ROLE &PARAMETER_SETTER_ROLE
 * 
 * This creates economic incentive for accuracy without central trust.
 */
contract ValidatorRegistry is AccessControl {
    // Role definitions
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");
    bytes32 public constant PARAMETER_SETTER_ROLE = keccak256("PARAMETER_SETTER_ROLE");
    
    // Supported tokens for bonding (e.g., USDC, ARB, ETH)
    address[] public supportedTokens;
    mapping(address => bool) public isTokenSupported;
    mapping(address => uint256) public tokenMinBond; // token => minimum bond required
    
    address public owner; // Kept for backward compatibility
    address public arbitrator; // DAO or oracle that decides disputes
    uint256 public disputePeriod = 7 days; // Time to challenge a signal
    uint256 public arbitrationTime = 3 days; // Time for arbitrator to decide
    
    // Reporter bonds
    struct Reporter {
        address token;
        uint256 bondAmount;
        uint256 signalCount; // total signals submitted
        uint256 slashingCount; // times slashed
        bool isActive;
    }
    
    mapping(address => Reporter) public reporters;
    address[] public registeredReporters;
    
    // Signal tracking
    struct SignalRecord {
        address reporter;
        uint256 chainId;
        uint256 timestamp;
        SignalTypes.SignalType signalType;
        string description;
        bool isDisputed;
        bool isVerified; // Arbitrator confirmed true
        uint256 disputeCount;
    }
    
    mapping(uint256 => SignalRecord) public signals; // signalId => record
    uint256 public nextSignalId;
    
    // Disputes
    struct Dispute {
        uint256 signalId;
        address challenger;
        address token;
        uint256 challengeBond;
        bool settled;
        bool isValid; // True = signal was correct, False = signal was false
        uint256 createdAt;
    }
    
    mapping(uint256 => Dispute) public disputes; // disputeId => dispute
    uint256 public nextDisputeId;
    uint256 private rewardAndSlashingPacked = (50 << 128) | 5; // Initial: slashingRate=50, accuracyRewardRate=5
    
    // Bit masks for unpacking
    uint256 private constant RATE_MASK = (1 << 128) - 1;
    
    event ReporterRegistered(address indexed reporter, address indexed token, uint256 bondAmount);
    event ReporterSlashed(address indexed reporter, uint256 amount, string reason);
    event ReporterRewarded(address indexed reporter, uint256 amount, string reason);
    event SignalRecorded(uint256 indexed signalId, address indexed reporter, uint256 chainId);
    event DisputeRaised(uint256 indexed disputeId, uint256 indexed signalId, address indexed challenger);
    event DisputeResolved(uint256 indexed disputeId, bool isValid, address winner, uint256 winnings);
    event AdminParameterUpdated(string indexed paramName, uint256 newValue);
    
    modifier onlyAdminOrRole() {
        _checkOnlyAdminOrRole();
        _;
    }
    
    modifier onlyArbitratorOrRole() {
        _checkOnlyArbitratorOrRole();
        _;
    }
    
    modifier onlyReporter(address reporter) {
        _checkOnlyReporter(reporter);
        _;
    }

    function _checkOnlyAdminOrRole() internal view {
        require(msg.sender == owner || hasRole(PARAMETER_SETTER_ROLE, msg.sender), "only admin");
    }

    function _checkOnlyArbitratorOrRole() internal view {
        require(msg.sender == arbitrator || hasRole(ARBITRATOR_ROLE, msg.sender), "only arbitrator");
    }

    function _checkOnlyReporter(address reporter) internal view {
        require(reporters[reporter].isActive, "not active reporter");
    }
    
    /**
     * @dev Constructor - supports both simple owner &AccessControl modes
     * If deployed without parameters, uses simple owner mode (backward compatible)
     * If deployed with initialAdmin, uses AccessControl mode
     */
    constructor(address initialAdmin, address initialArbitrator) {
        owner = msg.sender;
        arbitrator = msg.sender;
        
        // Only setup roles if initialAdmin is provided (non-zero)
        if (initialAdmin != address(0)) {
            _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
            _grantRole(PARAMETER_SETTER_ROLE, initialAdmin);
            owner = initialAdmin;
        }
        
        if (initialArbitrator != address(0)) {
            _grantRole(ARBITRATOR_ROLE, initialArbitrator);
            arbitrator = initialArbitrator;
        }
    }
    
    //  REPORTER MANAGEMENT 
    
    /**
     * @dev Register as a reporter (must post bond)
     * @param token Address of token to use as bond
     * @param bondAmount Amount to bond
     */
    function registerReporter(address token, uint256 bondAmount) external {
        require(isTokenSupported[token], "unsupported token");
        require(bondAmount >= tokenMinBond[token], "bond too small");
        require(!reporters[msg.sender].isActive, "already registered");
        
        // Transfer bond from reporter
        require(
            _transferToken(token, msg.sender, address(this), bondAmount),
            "bond transfer failed"
        );
        
        reporters[msg.sender] = Reporter({
            token: token,
            bondAmount: bondAmount,
            signalCount: 0,
            slashingCount: 0,
            isActive: true
        });
        
        registeredReporters.push(msg.sender);
        emit ReporterRegistered(msg.sender, token, bondAmount);
    }
    
    /**
     * @dev Unregister as reporter (if no active disputes)
     */
    function unregisterReporter() external {
        Reporter storage reporter = reporters[msg.sender];
        require(reporter.isActive, "not registered");
        require(reporter.slashingCount == 0, "has pending disputes");
        
        // Return bond
        _transferToken(
            reporter.token,
            address(this),
            msg.sender,
            reporter.bondAmount
        );
        
        reporter.isActive = false;
    }
    
    /**
     * @dev Record a signal from a reporter
     * Called by HealthReporter after submitting a signal
     */
    function recordSignal(
        address reporter,
        uint256 chainId,
        SignalTypes.SignalType signalType,
        string calldata description
    ) external onlyReporter(reporter) returns (uint256 signalId) {
        signalId = nextSignalId++;
        
        signals[signalId] = SignalRecord({
            reporter: reporter,
            chainId: chainId,
            timestamp: block.timestamp,
            signalType: signalType,
            description: description,
            isDisputed: false,
            isVerified: false,
            disputeCount: 0
        });
        
        reporters[reporter].signalCount++;
        emit SignalRecorded(signalId, reporter, chainId);
    }
    
    // ============ DISPUTE andARBITRATION ============
    
    /**
     * @dev Challenge a signal you believe is false
     * Must post matching bond
     */
    function raiseDispute(uint256 signalId) external returns (uint256 disputeId) {
        SignalRecord storage signal = signals[signalId];
        require(signal.reporter != address(0), "no signal");
        require(!signal.isDisputed, "already disputed");
        require(
            block.timestamp <= signal.timestamp + disputePeriod,
            "dispute period closed"
        );
        
        Reporter storage reporter = reporters[signal.reporter];
        address token = reporter.token;
        
        // Challenger must post matching bond
        require(
            _transferToken(token, msg.sender, address(this), reporter.bondAmount),
            "bond transfer failed"
        );
        
        disputeId = nextDisputeId++;
        
        disputes[disputeId] = Dispute({
            signalId: signalId,
            challenger: msg.sender,
            token: token,
            challengeBond: reporter.bondAmount,
            settled: false,
            isValid: false,
            createdAt: block.timestamp
        });
        
        signal.isDisputed = true;
        signal.disputeCount++;
        reporter.slashingCount++;
        
        emit DisputeRaised(disputeId, signalId, msg.sender);
    }
    
    /**
     * @dev Arbitrator decides if signal was truthful
     * @param disputeId The dispute to resolve
     * @param isValid True = signal was correct, False = signal was false
     */
    function resolveDispute(uint256 disputeId, bool isValid) 
        external 
        onlyArbitratorOrRole 
    {
        Dispute storage dispute = disputes[disputeId];
        require(!dispute.settled, "already resolved");
        
        SignalRecord storage signal = signals[dispute.signalId];
        Reporter storage reporter = reporters[signal.reporter];
        
        dispute.settled = true;
        dispute.isValid = isValid;
        signal.isVerified = true;
        
        address winnerToken = dispute.token;
        uint256 reporterBond = reporter.bondAmount;
        uint256 challengerBond = dispute.challengeBond;
        
        if (isValid) {
            // Reporter was RIGHT
            // Reporter keeps their bond
            // Challenger loses their bond (goes to reporter)
            
            uint256 winnings = (challengerBond * _getSlashingRate()) / 100;
            uint256 arbitrationFee = challengerBond - winnings;
            
            _transferToken(winnerToken, address(this), signal.reporter, winnings);
            _transferToken(winnerToken, address(this), arbitrator, arbitrationFee);
            
            // Also reward accuracy
            uint256 reward = (reporterBond * _getAccuracyRewardRate()) / 100;
            reporters[signal.reporter].bondAmount += reward;
            
            emit ReporterRewarded(signal.reporter, reward, "accurate signal");
            emit DisputeResolved(disputeId, isValid, signal.reporter, winnings);
        } else {
            // Reporter was WRONG
            // Reporter loses portion of bond (slashed)
            // Challenger gets portion
            
            uint256 slashed = (reporterBond * _getSlashingRate()) / 100;
            reporter.bondAmount -= slashed;
            
            _transferToken(winnerToken, address(this), dispute.challenger, slashed);
            
            emit ReporterSlashed(signal.reporter, slashed, "false signal");
            emit DisputeResolved(disputeId, isValid, dispute.challenger, slashed);
        }
        
        reporter.slashingCount--;
    }
    
    // ============ ADMIN FUNCTIONS ============
    
    /**
     * @dev Add supported token for bonding
     */
    function addSupportedToken(address token, uint256 minBond) external onlyAdminOrRole {
        require(token != address(0), "zero token");
        require(!isTokenSupported[token], "already supported");
        
        supportedTokens.push(token);
        isTokenSupported[token] = true;
        tokenMinBond[token] = minBond;
        emit AdminParameterUpdated("addToken", uint256(uint160(token)));
    }
    
    /**
     * @dev Set arbitrator address
     */
    function setArbitrator(address newArbitrator) external onlyAdminOrRole {
        require(newArbitrator != address(0), "zero arbitrator");
        arbitrator = newArbitrator;
        _grantRole(ARBITRATOR_ROLE, newArbitrator);
        emit AdminParameterUpdated("arbitrator", uint256(uint160(newArbitrator)));
    }
    
    /**
     * @dev Set dispute period (how long to challenge signals)
     */
    function setDisputePeriod(uint256 newPeriod) external onlyAdminOrRole {
        require(newPeriod > 0, "period too short");
        disputePeriod = newPeriod;
        emit AdminParameterUpdated("disputePeriod", newPeriod);
    }
    
    /**
     * @dev Get accuracy reward rate (unpacks from storage)
     */
    function accuracyRewardRate() external view returns (uint256) {
        return _getAccuracyRewardRate();
    }
    
    /**
     * @dev Get slashing rate (unpacks from storage)
     */
    function getSlashingRate() external view returns (uint256) {
        return _getSlashingRate();
    }
    
    /**
     * @dev Set accuracy reward rate
     */
    function setAccuracyRewardRate(uint256 newRate) external onlyAdminOrRole {
        require(newRate <= 100, "rate too high");
        uint256 currentSlashingRate = _getSlashingRate();
        rewardAndSlashingPacked = (currentSlashingRate << 128) | newRate;
        emit AdminParameterUpdated("accuracyRewardRate", newRate);
    }
    
    /**
     * @dev Set slashing rate for false signals
     */
    function setSlashingRate(uint256 newRate) external onlyAdminOrRole {
        require(newRate <= 100, "rate too high");
        uint256 currentRewardRate = _getAccuracyRewardRate();
        rewardAndSlashingPacked = (newRate << 128) | currentRewardRate;
        emit AdminParameterUpdated("slashingRate", newRate);
    }
    
    /**
     * @dev Internal helper to get current accuracy reward rate
     */
    function _getAccuracyRewardRate() internal view returns (uint256) {
        return rewardAndSlashingPacked & RATE_MASK;
    }
    
    /**
     * @dev Internal helper to get current slashing rate
     */
    function _getSlashingRate() internal view returns (uint256) {
        return rewardAndSlashingPacked >> 128;
    }
    
    //  VIEWS 
    
    /**
     * @dev Get reporter info
     */
    function getReporter(address reporter) 
        external 
        view 
        returns (Reporter memory) 
    {
        return reporters[reporter];
    }
    
    /**
     * @dev Get signal record
     */
    function getSignal(uint256 signalId) 
        external 
        view 
        returns (SignalRecord memory) 
    {
        return signals[signalId];
    }
    
    /**
     * @dev Get dispute record
     */
    function getDispute(uint256 disputeId) 
        external 
        view 
        returns (Dispute memory) 
    {
        return disputes[disputeId];
    }
    
    /**
     * @dev Reporter accuracy rate
     */
    function getAccuracyRate(address reporter) 
        external 
        view 
        returns (uint256 accurate, uint256 total) 
    {
        Reporter memory rep = reporters[reporter];
        if (rep.signalCount == 0) return (0, 0);
        
        // Count verified signals
        for (uint256 i = 0; i < nextSignalId; i++) {
            if (signals[i].reporter == reporter) {
                total++;
                if (signals[i].isVerified) accurate++;
            }
        }
    }
    
    //  INTERNAL 
    
    /**
     * @dev ERC20 transfer wrapper
     * Handles native ETH &ERC20 tokens
     */
    function _transferToken(
        address token,
        address from,
        address to,
        uint256 amount
    ) internal returns (bool) {
        if (token == address(0)) {
            // Native ETH
            require(msg.value >= amount, "insufficient eth");
            (bool success, ) = payable(to).call{value: amount}("");
            return success;
        } else {
            (bool success, bytes memory data) = token.call(
                abi.encodeWithSignature(
                    "transferFrom(address,address,uint256)",
                    from,
                    to,
                    amount
                )
            );
            return success &&(data.length == 0 || abi.decode(data, (bool)));
        }
    }
}
