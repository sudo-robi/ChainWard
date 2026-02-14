// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SecurityConfiguration
 * @dev Central configuration management for all security parameters
 * Provides easy read/write access to critical system parameters
 */
contract SecurityConfiguration {
    // Configuration structures
    struct RateLimitConfig {
        uint256 globalMaxSubmissions;
        uint256 globalWindowSize;
        bool enabled;
    }

    struct ReputationConfig {
        uint256 minStake;
        uint256 maxStake;
        uint256 initialReputation;
        uint256 maxReputation;
        uint256 rewardForAccurate;
        uint256 penaltyForFalse;
        uint256 slashingPercentage;
    }

    struct TimelockConfig {
        uint256 minDelay;
        uint256 maxDelay;
        uint256 gracePeriod;
    }

    struct EmergencyConfig {
        uint256 autoUnpauseDuration;
        uint256 maxPausers;
        mapping(uint256 => uint256) pauserWeightLimits; // weight -> duration limit
    }

    // State variables
    address public owner;
    address public governance;

    // Configurations
    RateLimitConfig public rateLimitConfig;
    ReputationConfig public reputationConfig;
    TimelockConfig public timelockConfig;

    mapping(address => bool) public authorizedUpdaters;

    // Events
    event ConfigUpdated(string indexed configName, string field, uint256 newValue);
    event RateLimitConfigChanged(uint256 maxSubmissions, uint256 windowSize);
    event ReputationConfigChanged(
        uint256 reward,
        uint256 penalty,
        uint256 slashingPercentage
    );
    event TimelockConfigChanged(uint256 newDelay);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == owner || authorizedUpdaters[msg.sender], "not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;

        // Initialize default configurations
        _initializeDefaults();
    }

    /**
     * @dev Initialize default configurations
     */
    function _initializeDefaults() internal {
        // Rate Limiter defaults
        rateLimitConfig = RateLimitConfig({
            globalMaxSubmissions: 10,
            globalWindowSize: 1 days,
            enabled: true
        });

        // Reputation defaults
        reputationConfig = ReputationConfig({
            minStake: 1 ether,
            maxStake: 1000 ether,
            initialReputation: 100,
            maxReputation: 1000,
            rewardForAccurate: 10,
            penaltyForFalse: 50,
            slashingPercentage: 20
        });

        // Timelock defaults
        timelockConfig = TimelockConfig({
            minDelay: 2 days,
            maxDelay: 30 days,
            gracePeriod: 14 days
        });
    }

    /**
     * @dev Authorize an address to update configurations
     * @param updater Address to authorize
     */
    function authorizeUpdater(address updater) external onlyOwner {
        require(updater != address(0), "zero address");
        authorizedUpdaters[updater] = true;
    }

    /**
     * @dev Revoke authorization for an updater
     * @param updater Address to revoke
     */
    function revokeUpdater(address updater) external onlyOwner {
        authorizedUpdaters[updater] = false;
    }

    /**
     * @dev Update rate limit configuration
     * @param maxSubmissions Maximum submissions per window
     * @param windowSize Size of time window
     */
    function updateRateLimitConfig(uint256 maxSubmissions, uint256 windowSize)
        external
        onlyAuthorized
    {
        require(maxSubmissions > 0, "invalid max submissions");
        require(windowSize >= 1 hours && windowSize <= 30 days, "invalid window");

        rateLimitConfig.globalMaxSubmissions = maxSubmissions;
        rateLimitConfig.globalWindowSize = windowSize;

        emit RateLimitConfigChanged(maxSubmissions, windowSize);
        emit ConfigUpdated("RATE_LIMIT", "globalLimit", maxSubmissions);
    }

    /**
     * @dev Update reputation configuration
     * @param rewardForAccurate Points rewarded for accurate report
     * @param penaltyForFalse Points penalized for false report
     * @param slashingPercentage Percentage of stake to slash
     */
    function updateReputationConfig(
        uint256 rewardForAccurate,
        uint256 penaltyForFalse,
        uint256 slashingPercentage
    ) external onlyAuthorized {
        require(rewardForAccurate > 0, "invalid reward");
        require(penaltyForFalse > 0, "invalid penalty");
        require(slashingPercentage > 0 && slashingPercentage <= 100, "invalid slashing");

        reputationConfig.rewardForAccurate = rewardForAccurate;
        reputationConfig.penaltyForFalse = penaltyForFalse;
        reputationConfig.slashingPercentage = slashingPercentage;

        emit ReputationConfigChanged(
            rewardForAccurate,
            penaltyForFalse,
            slashingPercentage
        );
    }

    /**
     * @dev Update timelock configuration
     * @param newDelay New delay in seconds
     */
    function updateTimelockConfig(uint256 newDelay) external onlyAuthorized {
        require(
            newDelay >= timelockConfig.minDelay && newDelay <= timelockConfig.maxDelay,
            "delay out of range"
        );

        timelockConfig.minDelay = newDelay;
        emit TimelockConfigChanged(newDelay);
        emit ConfigUpdated("TIMELOCK", "delay", newDelay);
    }

    /**
     * @dev Enable/disable rate limiting
     * @param enabled True to enable, false to disable
     */
    function setRateLimitEnabled(bool enabled) external onlyOwner {
        rateLimitConfig.enabled = enabled;
        emit ConfigUpdated("RATE_LIMIT", "enabled", enabled ? 1 : 0);
    }

    /**
     * @dev Update minimum stake requirement
     * @param newMinStake New minimum stake
     */
    function setMinStake(uint256 newMinStake) external onlyOwner {
        require(newMinStake > 0, "invalid min stake");
        require(newMinStake <= reputationConfig.maxStake, "min > max");

        reputationConfig.minStake = newMinStake;
        emit ConfigUpdated("REPUTATION", "minStake", newMinStake);
    }

    /**
     * @dev Update maximum stake limit
     * @param newMaxStake New maximum stake
     */
    function setMaxStake(uint256 newMaxStake) external onlyOwner {
        require(newMaxStake > 0, "invalid max stake");
        require(newMaxStake >= reputationConfig.minStake, "max < min");

        reputationConfig.maxStake = newMaxStake;
        emit ConfigUpdated("REPUTATION", "maxStake", newMaxStake);
    }

    // View functions
    function getRateLimitConfig()
        external
        view
        returns (RateLimitConfig memory)
    {
        return rateLimitConfig;
    }

    function getReputationConfig()
        external
        view
        returns (ReputationConfig memory)
    {
        return reputationConfig;
    }

    function getTimelockConfig() external view returns (TimelockConfig memory) {
        return timelockConfig;
    }

    function isRateLimitEnabled() external view returns (bool) {
        return rateLimitConfig.enabled;
    }

    /**
     * @dev Get all configurations as a summary
     */
    function getConfigurationSummary()
        external
        view
        returns (
            string memory rateLimit,
            string memory reputation,
            string memory timelock
        )
    {
        rateLimit = string(
            abi.encodePacked(
                "Max: ",
                _uint256ToString(rateLimitConfig.globalMaxSubmissions),
                " per ",
                _uint256ToString(rateLimitConfig.globalWindowSize / 1 hours),
                "h"
            )
        );

        reputation = string(
            abi.encodePacked(
                "Min Stake: ",
                _uint256ToString(reputationConfig.minStake / 1 ether),
                " ETH, Reward: +",
                _uint256ToString(reputationConfig.rewardForAccurate),
                ", Penalty: -",
                _uint256ToString(reputationConfig.penaltyForFalse)
            )
        );

        timelock = string(
            abi.encodePacked(
                "Delay: ",
                _uint256ToString(timelockConfig.minDelay / 1 days),
                " days, Grace: ",
                _uint256ToString(timelockConfig.gracePeriod / 1 days),
                " days"
            )
        );
    }

    // Utility functions
    function _uint256ToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
