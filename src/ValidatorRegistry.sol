// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./SignalTypes.sol";

/**
 * @title ValidatorRegistry
 * @dev Economic security layer for ChainWard
 * 
 * Problem: Anyone can submit signals. Reporters could lie or spam false incidents.
 * 
 * Solution: Staking + Arbitration
 * - Reporters must bond tokens to submit signals
 * - Validators can challenge suspicious signals
 * - Arbitrator decides truth within N blocks
 * - Loser's bond is slashed; winner gets portion
 * 
 * This creates economic incentive for accuracy without central trust.
 */
contract ValidatorRegistry {
    // Supported tokens for bonding (e.g., USDC, ARB, ETH)
    address[] public supportedTokens;
    mapping(address => bool) public isTokenSupported;
    mapping(address => uint256) public tokenMinBond; // token => minimum bond required
    
    address public owner;
    address public arbitrator; // DAO or oracle that decides disputes
    
    uint256 public disputePeriod = 7 days; // Time to challenge a signal
    uint256 public arbitrationTime = 3 days; // Time for arbitrator to decide
    
    // Reporter bonds
    struct Reporter {
        address token;
        uint256 bondAmount;
        uint256 signalCount; // total signals submitted
        uint256 slashCount; // times slashed
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
    
    // Rewards & slashing
    uint256 public accuracyRewardRate = 5; // 5% of bond for accurate signals
    uint256 public slashRate = 50; // 50% of bond slashed for false signals
    
    event ReporterRegistered(address indexed reporter, address indexed token, uint256 bondAmount);
    event ReporterSlashed(address indexed reporter, uint256 amount, string reason);
    event ReporterRewarded(address indexed reporter, uint256 amount, string reason);
    event SignalRecorded(uint256 indexed signalId, address indexed reporter, uint256 chainId);
    event DisputeRaised(uint256 indexed disputeId, uint256 indexed signalId, address indexed challenger);
    event DisputeResolved(uint256 indexed disputeId, bool isValid, address winner, uint256 winnings);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }
    
    modifier onlyArbitrator() {
        require(msg.sender == arbitrator, "only arbitrator");
        _;
    }
    
    modifier onlyReporter(address reporter) {
        require(reporters[reporter].isActive, "not active reporter");
        _;
    }
    
    constructor() {
        owner = msg.sender;
        arbitrator = msg.sender; // Start as owner, can be changed to DAO
    }
    
    // ============ REPORTER MANAGEMENT ============
    
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
            slashCount: 0,
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
        require(reporter.slashCount == 0, "has pending disputes");
        
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
    
    // ============ DISPUTE & ARBITRATION ============
    
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
        reporter.slashCount++;
        
        emit DisputeRaised(disputeId, signalId, msg.sender);
    }
    
    /**
     * @dev Arbitrator decides if signal was truthful
     * @param disputeId The dispute to resolve
     * @param isValid True = signal was correct, False = signal was false
     */
    function resolveDispute(uint256 disputeId, bool isValid) 
        external 
        onlyArbitrator 
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
            
            uint256 winnings = (challengerBond * slashRate) / 100;
            uint256 arbitrationFee = challengerBond - winnings;
            
            _transferToken(winnerToken, address(this), signal.reporter, winnings);
            _transferToken(winnerToken, address(this), arbitrator, arbitrationFee);
            
            // Also reward accuracy
            uint256 reward = (reporterBond * accuracyRewardRate) / 100;
            reporters[signal.reporter].bondAmount += reward;
            
            emit ReporterRewarded(signal.reporter, reward, "accurate signal");
            emit DisputeResolved(disputeId, isValid, signal.reporter, winnings);
        } else {
            // Reporter was WRONG
            // Reporter loses portion of bond (slash)
            // Challenger gets portion
            
            uint256 slashed = (reporterBond * slashRate) / 100;
            reporter.bondAmount -= slashed;
            
            _transferToken(winnerToken, address(this), dispute.challenger, slashed);
            
            emit ReporterSlashed(signal.reporter, slashed, "false signal");
            emit DisputeResolved(disputeId, isValid, dispute.challenger, slashed);
        }
        
        reporter.slashCount--;
    }
    
    // ============ ADMIN FUNCTIONS ============
    
    /**
     * @dev Add supported token for bonding
     */
    function addSupportedToken(address token, uint256 minBond) external onlyOwner {
        require(token != address(0), "zero token");
        require(!isTokenSupported[token], "already supported");
        
        supportedTokens.push(token);
        isTokenSupported[token] = true;
        tokenMinBond[token] = minBond;
    }
    
    /**
     * @dev Set arbitrator address
     */
    function setArbitrator(address newArbitrator) external onlyOwner {
        require(newArbitrator != address(0), "zero arbitrator");
        arbitrator = newArbitrator;
    }
    
    /**
     * @dev Set dispute period (how long to challenge signals)
     */
    function setDisputePeriod(uint256 newPeriod) external onlyOwner {
        require(newPeriod > 0, "period too short");
        disputePeriod = newPeriod;
    }
    
    /**
     * @dev Set accuracy reward rate
     */
    function setAccuracyRewardRate(uint256 newRate) external onlyOwner {
        require(newRate <= 100, "rate too high");
        accuracyRewardRate = newRate;
    }
    
    /**
     * @dev Set slash rate for false signals
     */
    function setSlashRate(uint256 newRate) external onlyOwner {
        require(newRate <= 100, "rate too high");
        slashRate = newRate;
    }
    
    // ============ VIEWS ============
    
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
    
    // ============ INTERNAL ============
    
    /**
     * @dev ERC20 transfer wrapper
     * Handles native ETH and ERC20 tokens
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
            // ERC20
            // Note: In production, use SafeERC20
            (bool success, bytes memory data) = token.call(
                abi.encodeWithSignature(
                    "transferFrom(address,address,uint256)",
                    from,
                    to,
                    amount
                )
            );
            return success && (data.length == 0 || abi.decode(data, (bool)));
        }
    }
}
