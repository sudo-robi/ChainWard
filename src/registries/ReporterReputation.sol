// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ReporterReputation
 * @dev Reporter staking &reputation system
 * Incentivizes accurate reporting &penalizes malicious behavior
 */
contract ReporterReputation {
    // Structs
    struct Reporter {
        uint256 staked;
        uint256 reputation;
        uint256 successfulReports;
        uint256 failedReports;
        uint256 slashingCount;
        uint256 joinedAt;
        bool active;
    }

    struct ReputationEvent {
        address reporter;
        int256 delta;
        string reason;
        uint256 timestamp;
    }

    // Constants
    uint256 public constant MIN_STAKE = 1 ether;
    uint256 public constant MAX_STAKE = 1000 ether;
    uint256 public constant INITIAL_REPUTATION = 100;
    uint256 public constant MAX_REPUTATION = 1000;

    // State variables
    address public owner;
    address public manager; // IncidentManager address

    mapping(address => Reporter) public reporters;
    address[] public activeReporters;
    mapping(address => bool) public isActive;

    // Reputation rewards
    uint256 public rewardForAccurateReport = 10;
    uint256 public penaltyForFalseReport = 50;
    uint256 public slashingPercentage = 20; // 20% slashing on dispute

    ReputationEvent[] public reputationHistory;

    // Events
    event ReporterJoined(address indexed reporter, uint256 stake);
    event ReporterStaked(address indexed reporter, uint256 additionalStake, uint256 totalStake);
    event ReporterUnstaked(address indexed reporter, uint256 amount, uint256 remainingStake);
    event ReputationUpdated(address indexed reporter, int256 delta, string reason);
    event ReportValidated(address indexed reporter, uint256 reward);
    event ReportDisputed(address indexed reporter, uint256 slashAmount);
    event ReporterBanned(address indexed reporter, string reason);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier onlyManager() {
        require(msg.sender == manager, "only manager");
        _;
    }

    modifier onlyReporter() {
        require(reporters[msg.sender].active, "not reporter");
        _;
    }

    /**
     * @dev Constructor initializes the reputation system
     * @param _manager Address of IncidentManager contract
     */
    constructor(address _manager) {
        require(_manager != address(0), "zero manager");
        owner = msg.sender;
        manager = _manager;
    }

    /**
     * @dev Reporter joins the system with an initial stake
     * @param _stake Amount to stake (must be >= MIN_STAKE)
     */
    function joinAsReporter(uint256 _stake) external payable {
        require(msg.value == _stake, "stake mismatch");
        require(_stake >= MIN_STAKE, "stake too small");
        require(_stake <= MAX_STAKE, "stake too large");
        require(!reporters[msg.sender].active, "already reporter");

        reporters[msg.sender] = Reporter({
            staked: _stake,
            reputation: INITIAL_REPUTATION,
            successfulReports: 0,
            failedReports: 0,
            slashingCount: 0,
            joinedAt: block.timestamp,
            active: true
        });

        activeReporters.push(msg.sender);
        isActive[msg.sender] = true;

        emit ReporterJoined(msg.sender, _stake);
        _recordReputationEvent(msg.sender, int256(INITIAL_REPUTATION), "joined");
    }

    /**
     * @dev Reporter adds more stake
     */
    function addStake() external payable onlyReporter {
        require(msg.value > 0, "no stake");
        
        Reporter storage reporter = reporters[msg.sender];
        uint256 newTotal = reporter.staked + msg.value;
        
        require(newTotal <= MAX_STAKE, "exceeds max stake");

        reporter.staked = newTotal;
        emit ReporterStaked(msg.sender, msg.value, newTotal);
    }

    /**
     * @dev Reporter unstakes some amount (if reputation allows)
     * @param _amount Amount to unstake
     */
    function unstake(uint256 _amount) external onlyReporter {
        Reporter storage reporter = reporters[msg.sender];
        
        require(_amount > 0, "no amount");
        require(_amount <= reporter.staked, "exceeds staked");
        require(reporter.staked - _amount >= MIN_STAKE, "below min stake");

        reporter.staked -= _amount;

        (bool success, ) = msg.sender.call{value: _amount}("");
        require(success, "transfer failed");

        emit ReporterUnstaked(msg.sender, _amount, reporter.staked);
    }

    /**
     * @dev Mark a report as validated (only manager)
     * @param _reporter Reporter address
     */
    function validateReport(address _reporter) external onlyManager {
        require(reporters[_reporter].active, "reporter not active");

        Reporter storage reporter = reporters[_reporter];
        reporter.successfulReports += 1;

        // Award reputation
        uint256 newRep = reporter.reputation + rewardForAccurateReport;
        if (newRep > MAX_REPUTATION) {
            newRep = MAX_REPUTATION;
        }
        reporter.reputation = newRep;

        emit ReportValidated(_reporter, rewardForAccurateReport);
        _recordReputationEvent(_reporter, int256(rewardForAccurateReport), "accurate report");
    }

    /**
     * @dev Mark a report as false/disputed (only manager)
     * @param _reporter Reporter address
     */
    function disputeReport(address _reporter) external onlyManager {
        require(reporters[_reporter].active, "reporter not active");

        Reporter storage reporter = reporters[_reporter];
        reporter.failedReports += 1;
        reporter.slashingCount += 1;

        // Penalize reputation
        int256 penalty = -int256(penaltyForFalseReport);
        int256 newRep = int256(reporter.reputation) + penalty;
        
        if (newRep < 0) {
            reporter.reputation = 0;
        } else {
            reporter.reputation = uint256(newRep);
        }

        // Slash stake
        uint256 slashAmount = (reporter.staked * slashingPercentage) / 100;
        reporter.staked -= slashAmount;

        emit ReportDisputed(_reporter, slashAmount);
        _recordReputationEvent(_reporter, penalty, "false report disputed");

        // Ban if reputation too low
        if (reporter.reputation == 0 && reporter.staked < MIN_STAKE) {
            banReporter(_reporter, "reputation &stake depleted");
        }
    }

    /**
     * @dev Ban a reporter from the system
     * @param _reporter Reporter address
     * @param _reason Reason for ban
     */
    function banReporter(address _reporter, string memory _reason) public onlyOwner {
        require(reporters[_reporter].active, "not active");

        Reporter storage reporter = reporters[_reporter];
        reporter.active = false;

        isActive[_reporter] = false;

        // Remove from active list
        for (uint256 i = 0; i < activeReporters.length; i++) {
            if (activeReporters[i] == _reporter) {
                activeReporters[i] = activeReporters[activeReporters.length - 1];
                activeReporters.pop();
                break;
            }
        }

        emit ReporterBanned(_reporter, _reason);
    }

    /**
     * @dev Set reputation rewards/penalties
     * @param _reward Points for accurate report
     * @param _penalty Points for false report
     */
    function setReputationParameters(uint256 _reward, uint256 _penalty)
        external
        onlyOwner
    {
        require(_reward > 0, "invalid reward");
        require(_penalty > 0, "invalid penalty");

        rewardForAccurateReport = _reward;
        penaltyForFalseReport = _penalty;
    }

    /**
     * @dev Set slashing percentage
     * @param _percentage Percentage of stake to slash (0-100)
     */
    function setSlashingPercentage(uint256 _percentage) external onlyOwner {
        require(_percentage > 0 && _percentage <= 100, "invalid percentage");
        slashingPercentage = _percentage;
    }

    /**
     * @dev Manually update reputation (owner only)
     * @param _reporter Reporter address
     * @param _delta Change in reputation (can be negative)
     * @param _reason Reason for change
     */
    function updateReputation(
        address _reporter,
        int256 _delta,
        string calldata _reason
    ) external onlyOwner {
        require(reporters[_reporter].active, "not active");

        Reporter storage reporter = reporters[_reporter];
        int256 newRep = int256(reporter.reputation) + _delta;

        if (newRep > int256(MAX_REPUTATION)) {
            reporter.reputation = MAX_REPUTATION;
        } else if (newRep < 0) {
            reporter.reputation = 0;
        } else {
            reporter.reputation = uint256(newRep);
        }

        emit ReputationUpdated(_reporter, _delta, _reason);
        _recordReputationEvent(_reporter, _delta, _reason);
    }

    // View functions
    function getReporter(address _reporter)
        external
        view
        returns (Reporter memory)
    {
        return reporters[_reporter];
    }

    function getReporterStats(address _reporter)
        external
        view
        returns (
            uint256 staked,
            uint256 reputation,
            uint256 successfulReports,
            uint256 failedReports,
            uint256 successRate
        )
    {
        Reporter memory reporter = reporters[_reporter];
        
        uint256 totalReports = reporter.successfulReports + reporter.failedReports;
        uint256 rate = totalReports == 0
            ? 0
            : (reporter.successfulReports * 100) / totalReports;

        return (
            reporter.staked,
            reporter.reputation,
            reporter.successfulReports,
            reporter.failedReports,
            rate
        );
    }

    function getActiveReporterCount() external view returns (uint256) {
        return activeReporters.length;
    }

    function getActiveReporter(uint256 _index) external view returns (address) {
        return activeReporters[_index];
    }

    function isReporterActive(address _reporter) external view returns (bool) {
        return reporters[_reporter].active;
    }

    function getReputationHistoryLength() external view returns (uint256) {
        return reputationHistory.length;
    }

    function getReputationEvent(uint256 _index)
        external
        view
        returns (ReputationEvent memory)
    {
        return reputationHistory[_index];
    }

    // Internal functions
    function _recordReputationEvent(
        address _reporter,
        int256 _delta,
        string memory _reason
    ) internal {
        reputationHistory.push(
            ReputationEvent({
                reporter: _reporter,
                delta: _delta,
                reason: _reason,
                timestamp: block.timestamp
            })
        );
    }
}
