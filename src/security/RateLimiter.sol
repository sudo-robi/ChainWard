// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title RateLimiter
 * @dev Prevents spam &abuse by rate limiting incident submissions
 * Uses a sliding window approach with configurable limits per reporter
 */
contract RateLimiter {
    // Structs
    struct RateLimit {
        uint256 maxSubmissions;
        uint256 windowSize;
        bool enabled;
    }

    struct SubmissionRecord {
        uint256 timestamp;
        uint256 count;
        uint256 windowStart;
    }

    // Constants
    uint256 public constant MIN_WINDOW_SIZE = 1 hours;
    uint256 public constant MAX_WINDOW_SIZE = 30 days;

    // State variables
    address public owner;
    address public manager; // IncidentManager address

    // Global rate limiting
    RateLimit public globalLimit;

    // Per-reporter rate limiting
    mapping(address => RateLimit) public reporterLimits;
    mapping(address => SubmissionRecord) public reporterRecords;

    // Whitelist for unlimited submissions
    mapping(address => bool) public whitelisted;

    // Events
    event GlobalLimitUpdated(uint256 maxSubmissions, uint256 windowSize);
    event ReporterLimitUpdated(
        address indexed reporter,
        uint256 maxSubmissions,
        uint256 windowSize
    );
    event ReporterWhitelisted(address indexed reporter);
    event ReporterUnwhitelisted(address indexed reporter);
    event RateLimitExceeded(address indexed reporter, uint256 currentCount);
    event SubmissionRecorded(address indexed reporter, uint256 newCount);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier onlyManager() {
        require(msg.sender == manager, "only manager");
        _;
    }

    /**
     * @dev Constructor initializes rate limiter
     * @param _manager Address of IncidentManager contract
     */
    constructor(address _manager) {
        require(_manager != address(0), "zero manager");
        owner = msg.sender;
        manager = _manager;

        // Default: 10 submissions per 24 hours globally
        globalLimit = RateLimit({
            maxSubmissions: 10,
            windowSize: 1 days,
            enabled: true
        });
    }

    /**
     * @dev Set global rate limit
     * @param _maxSubmissions Maximum submissions per window
     * @param _windowSize Time window in seconds
     */
    function setGlobalLimit(uint256 _maxSubmissions, uint256 _windowSize)
        external
        onlyOwner
    {
        require(_maxSubmissions > 0, "invalid max submissions");
        require(
            _windowSize >= MIN_WINDOW_SIZE && _windowSize <= MAX_WINDOW_SIZE,
            "invalid window"
        );

        globalLimit.maxSubmissions = _maxSubmissions;
        globalLimit.windowSize = _windowSize;

        emit GlobalLimitUpdated(_maxSubmissions, _windowSize);
    }

    /**
     * @dev Enable/disable global rate limiting
     * @param _enabled True to enable, false to disable
     */
    function setGlobalLimitEnabled(bool _enabled) external onlyOwner {
        globalLimit.enabled = _enabled;
    }

    /**
     * @dev Set rate limit for a specific reporter
     * @param _reporter Reporter address
     * @param _maxSubmissions Maximum submissions per window
     * @param _windowSize Time window in seconds
     */
    function setReporterLimit(
        address _reporter,
        uint256 _maxSubmissions,
        uint256 _windowSize
    ) external onlyOwner {
        require(_reporter != address(0), "zero reporter");
        require(_maxSubmissions > 0, "invalid max submissions");
        require(
            _windowSize >= MIN_WINDOW_SIZE && _windowSize <= MAX_WINDOW_SIZE,
            "invalid window"
        );

        reporterLimits[_reporter] = RateLimit({
            maxSubmissions: _maxSubmissions,
            windowSize: _windowSize,
            enabled: true
        });

        emit ReporterLimitUpdated(_reporter, _maxSubmissions, _windowSize);
    }

    /**
     * @dev Whitelist a reporter (unlimited submissions)
     * @param _reporter Reporter address
     */
    function whitelistReporter(address _reporter) external onlyOwner {
        require(_reporter != address(0), "zero reporter");
        whitelisted[_reporter] = true;
        emit ReporterWhitelisted(_reporter);
    }

    /**
     * @dev Remove reporter from whitelist
     * @param _reporter Reporter address
     */
    function unwhitelistReporter(address _reporter) external onlyOwner {
        require(whitelisted[_reporter], "not whitelisted");
        whitelisted[_reporter] = false;
        emit ReporterUnwhitelisted(_reporter);
    }

    /**
     * @dev Check if a submission is allowed &record it if yes
     * @param _reporter Reporter address
     * @return True if submission is allowed
     */
    function checkAndRecordSubmission(address _reporter)
        external
        onlyManager
        returns (bool)
    {
        // Whitelisted reporters bypass rate limiting
        if (whitelisted[_reporter]) {
            return true;
        }

        // Use reporter-specific limit if set, otherwise use global limit
        RateLimit memory limit = reporterLimits[_reporter].enabled
            ? reporterLimits[_reporter]
            : globalLimit;

        if (!limit.enabled) {
            return true;
        }

        SubmissionRecord storage record = reporterRecords[_reporter];

        // Reset window if expired
        if (block.timestamp >= record.windowStart + limit.windowSize) {
            record.windowStart = block.timestamp;
            record.count = 0;
        }

        // Check if limit exceeded
        if (record.count >= limit.maxSubmissions) {
            emit RateLimitExceeded(_reporter, record.count);
            return false;
        }

        // Record submission
        record.count += 1;
        record.timestamp = block.timestamp;

        emit SubmissionRecorded(_reporter, record.count);
        return true;
    }

    /**
     * @dev Manually reset a reporter's submission count
     * @param _reporter Reporter address
     */
    function resetReporterRecord(address _reporter) external onlyOwner {
        delete reporterRecords[_reporter];
    }

    // View functions
    function getGlobalLimit()
        external
        view
        returns (uint256 maxSubmissions, uint256 windowSize, bool enabled)
    {
        return (
            globalLimit.maxSubmissions,
            globalLimit.windowSize,
            globalLimit.enabled
        );
    }

    function getReporterLimit(address _reporter)
        external
        view
        returns (uint256 maxSubmissions, uint256 windowSize, bool enabled)
    {
        RateLimit memory limit = reporterLimits[_reporter];
        return (limit.maxSubmissions, limit.windowSize, limit.enabled);
    }

    function getReporterRecord(address _reporter)
        external
        view
        returns (
            uint256 timestamp,
            uint256 count,
            uint256 windowStart,
            uint256 submissionsRemaining
        )
    {
        SubmissionRecord memory record = reporterRecords[_reporter];
        
        uint256 remaining = 0;
        if (whitelisted[_reporter]) {
            remaining = type(uint256).max;
        } else {
            RateLimit memory limit = reporterLimits[_reporter].enabled
                ? reporterLimits[_reporter]
                : globalLimit;

            if (block.timestamp >= record.windowStart + limit.windowSize) {
                remaining = limit.maxSubmissions;
            } else {
                remaining = record.count >= limit.maxSubmissions
                    ? 0
                    : limit.maxSubmissions - record.count;
            }
        }

        return (record.timestamp, record.count, record.windowStart, remaining);
    }

    function canSubmit(address _reporter) external view returns (bool) {
        if (whitelisted[_reporter]) {
            return true;
        }

        SubmissionRecord memory record = reporterRecords[_reporter];
        RateLimit memory limit = reporterLimits[_reporter].enabled
            ? reporterLimits[_reporter]
            : globalLimit;

        if (!limit.enabled) {
            return true;
        }

        // Check if window is expired
        if (block.timestamp >= record.windowStart + limit.windowSize) {
            return true;
        }

        return record.count < limit.maxSubmissions;
    }

    function isWhitelisted(address _reporter) external view returns (bool) {
        return whitelisted[_reporter];
    }
}
