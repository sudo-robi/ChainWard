// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RewardsDistribution
 * @dev Distributes token rewards to reporters based on incident detection performance
 *      &pools from Service Level Agreementshed malicious actors.
 */
contract RewardsDistribution is AccessControl, ReentrancyGuard {
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");

    struct RewardConfig {
        uint256 accurateReportReward;      // Wei per accurate report
        uint256 criticalIncidentBonus;     // Additional reward for P0/P1 incidents
        uint256 multiChainDetectionBonus;  // Bonus for detecting issues on multiple chains
        uint256 fastResponseBonus;         // Bonus for quick detection (within threshold)
        uint256 fastResponseThreshold;     // Time threshold in seconds
    }

    struct RewardPool {
        uint256 totalAccumulated;          // Total rewards ever added
        uint256 totalDistributed;          // Total rewards ever claimed
        uint256 availableBalance;          // Current claimable rewards
        uint256 slashedFunds;              // Funds from slashing malicious actors
    }

    struct ReporterRewards {
        uint256 pending;                   // Unclaimed rewards
        uint256 claimed;                   // Historically claimed rewards
        uint256 lastClaimTime;             // Timestamp of last claim
        uint256[] incidentBounties;        // Bounties earned per incident
    }

    RewardConfig public config;
    RewardPool public pool;

    mapping(address => ReporterRewards) public reporterRewards;
    mapping(uint256 => mapping(address => bool)) public incidentRewardClaimed; // incidentId -> reporter -> claimed?
    mapping(uint256 => uint256) public incidentRewardBudget; // incidentId -> total budget for rewards

    address[] public rewardClaimants;
    mapping(address => bool) private _isRewardClaimant;

    event RewardAccrued(
        address indexed reporter,
        uint256 amount,
        string reason,
        uint256 indexed incidentId
    );
    event RewardClaimed(address indexed reporter, uint256 amount);
    event SlashedFundsAdded(uint256 amount);
    event RewardConfigUpdated(
        uint256 accurateReward,
        uint256 criticalBonus,
        uint256 multiChainBonus,
        uint256 fastBonus,
        uint256 fastThreshold
    );
    event PoolBalanceAdjusted(uint256 newBalance);

    constructor(
        uint256 _accurateReward,
        uint256 _criticalBonus,
        uint256 _multiChainBonus,
        uint256 _fastBonus,
        uint256 _fastThreshold
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MANAGER_ROLE, msg.sender);
        _grantRole(DISTRIBUTOR_ROLE, msg.sender);

        config = RewardConfig({
            accurateReportReward: _accurateReward,
            criticalIncidentBonus: _criticalBonus,
            multiChainDetectionBonus: _multiChainBonus,
            fastResponseBonus: _fastBonus,
            fastResponseThreshold: _fastThreshold
        });

        pool = RewardPool({
            totalAccumulated: 0,
            totalDistributed: 0,
            availableBalance: 0,
            slashedFunds: 0
        });
    }

    /**
     * @dev Add base reward for accurate report detection
     * @param _reporter Reporter address
     * @param _incidentId Associated incident ID
     * @param _severity Incident severity (0=low, 1=medium, 2=critical)
     */
    function accrueAccurateReportReward(
        address _reporter,
        uint256 _incidentId,
        uint256 _severity
    ) external onlyRole(MANAGER_ROLE) {
        require(_reporter != address(0), "invalid reporter");
        require(!incidentRewardClaimed[_incidentId][_reporter], "already claimed");

        uint256 baseReward = config.accurateReportReward;

        // Add severity bonus
        if (_severity >= 2) {
            baseReward += config.criticalIncidentBonus;
        }

        _accrueReward(_reporter, baseReward, "accurate detection", _incidentId);
        incidentRewardClaimed[_incidentId][_reporter] = true;
    }

    /**
     * @dev Add multi-chain detection bonus
     * @param _reporter Reporter address
     * @param _incidentIds Array of incident IDs detected on multiple chains
     * @param _chainCount Number of chains where incident was detected
     */
    function accrueMultiChainBonus(
        address _reporter,
        uint256[] calldata _incidentIds,
        uint256 _chainCount
    ) external onlyRole(MANAGER_ROLE) {
        require(_reporter != address(0), "invalid reporter");
        require(_chainCount >= 2, "need at least 2 chains");
        require(_incidentIds.length == _chainCount, "id count mismatch");

        // Bonus scales with number of chains: 2x for 2 chains, 3x for 3, etc.
        uint256 bonus = config.multiChainDetectionBonus * _chainCount;

        _accrueReward(_reporter, bonus, "multi-chain detection", _incidentIds[0]);
    }

    /**
     * @dev Add fast response bonus (if detected within threshold)
     * @param _reporter Reporter address
     * @param _incidentId Incident ID
     * @param _detectionTime Timestamp when incident was detected
     * @param _incidentTime Timestamp when incident actually occurred
     */
    function accrueQualityBonus(
        address _reporter,
        uint256 _incidentId,
        uint256 _detectionTime,
        uint256 _incidentTime
    ) external onlyRole(MANAGER_ROLE) {
        require(_reporter != address(0), "invalid reporter");
        require(_detectionTime >= _incidentTime, "invalid times");

        uint256 responseTime = _detectionTime - _incidentTime;

        if (responseTime <= config.fastResponseThreshold) {
            _accrueReward(_reporter, config.fastResponseBonus, "fast response", _incidentId);
        }
    }

    /**
     * @dev Record Service Level Agreementshed funds from malicious reporters into reward pool
     * @param _amount Amount of funds Service Level Agreementshed
     */
    function addSlashedFunds(uint256 _amount)
        external
        onlyRole(MANAGER_ROLE)
    {
        require(_amount > 0, "invalid amount");

        pool.slashedFunds += _amount;
        pool.availableBalance += _amount;
        pool.totalAccumulated += _amount;

        emit SlashedFundsAdded(_amount);
        emit PoolBalanceAdjusted(pool.availableBalance);
    }

    /**
     * @dev Claim accumulated rewards
     * @return amount Claimed amount
     */
    function claimRewards() external nonReentrant returns (uint256) {
        ReporterRewards storage reporter = reporterRewards[msg.sender];
        uint256 amount = reporter.pending;

        require(amount > 0, "no pending rewards");
        require(amount <= pool.availableBalance, "insufficient pool balance");

        // Effects: Update state BEFORE external call
        reporter.pending = 0;
        reporter.claimed += amount;
        reporter.lastClaimTime = block.timestamp;
        pool.availableBalance -= amount;
        pool.totalDistributed += amount;

        // Register claimant if new
        if (!_isRewardClaimant[msg.sender]) {
            rewardClaimants.push(msg.sender);
            _isRewardClaimant[msg.sender] = true;
        }

        // Interaction: Transfer ETH (reentrancy-safe)
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "transfer failed");

        emit RewardClaimed(msg.sender, amount);
        return amount;
    }

    /**
     * @dev Update reward configuration
     */
    function updateRewardConfig(
        uint256 _accurateReward,
        uint256 _criticalBonus,
        uint256 _multiChainBonus,
        uint256 _fastBonus,
        uint256 _fastThreshold
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        config.accurateReportReward = _accurateReward;
        config.criticalIncidentBonus = _criticalBonus;
        config.multiChainDetectionBonus = _multiChainBonus;
        config.fastResponseBonus = _fastBonus;
        config.fastResponseThreshold = _fastThreshold;

        emit RewardConfigUpdated(
            _accurateReward,
            _criticalBonus,
            _multiChainBonus,
            _fastBonus,
            _fastThreshold
        );
    }

    /**
     * @dev Manually fund the reward pool
     */
    function fundRewardPool() external payable onlyRole(MANAGER_ROLE) {
        require(msg.value > 0, "invalid amount");

        pool.availableBalance += msg.value;
        pool.totalAccumulated += msg.value;

        emit PoolBalanceAdjusted(pool.availableBalance);
    }

    // View functions
    function getPendingRewards(address _reporter) external view returns (uint256) {
        return reporterRewards[_reporter].pending;
    }

    function getClaimedRewards(address _reporter) external view returns (uint256) {
        return reporterRewards[_reporter].claimed;
    }

    function getTotalRewards(address _reporter) external view returns (uint256) {
        return reporterRewards[_reporter].pending + reporterRewards[_reporter].claimed;
    }

    function getPoolBalance() external view returns (uint256) {
        return pool.availableBalance;
    }

    function getPoolStats()
        external
        view
        returns (
            uint256 totalAccumulated,
            uint256 totalDistributed,
            uint256 available,
            uint256 slashed
        )
    {
        return (pool.totalAccumulated, pool.totalDistributed, pool.availableBalance, pool.slashedFunds);
    }

    function getReportClaimants() external view returns (address[] memory) {
        return rewardClaimants;
    }

    function getRewardsConfig()
        external
        view
        returns (
            uint256 accurateReward,
            uint256 criticalBonus,
            uint256 multiChainBonus,
            uint256 fastBonus,
            uint256 fastThreshold
        )
    {
        return (
            config.accurateReportReward,
            config.criticalIncidentBonus,
            config.multiChainDetectionBonus,
            config.fastResponseBonus,
            config.fastResponseThreshold
        );
    }

    // Internal functions
    function _accrueReward(
        address _reporter,
        uint256 _amount,
        string memory _reason,
        uint256 _incidentId
    ) internal {
        require(_amount > 0, "invalid amount");

        ReporterRewards storage reporter = reporterRewards[_reporter];
        reporter.pending += _amount;
        reporter.incidentBounties.push(_amount);

        emit RewardAccrued(_reporter, _amount, _reason, _incidentId);
    }

    /**
     * @dev Allow contract to receive ETH for reward pool
     */
    receive() external payable {
        pool.availableBalance += msg.value;
        pool.totalAccumulated += msg.value;
    }
}
