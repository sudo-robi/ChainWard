// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title EmergencyPause
 * @dev Emergency pause mechanism for critical system failures
 * Allows authorized parties to pause critical operations with decay over time
 * Prevents abuse by having stronger restrictions as time passes
 */
contract EmergencyPause {
    // Structs
    struct PauseEvent {
        address pauser;
        uint256 pausedAt;
        string reason;
        bool reverted;
    }

    // Constants
    uint256 public constant MAX_PAUSE_DURATION = 30 days;
    uint256 public constant AUTO_UNPAUSE_DURATION = 7 days;

    // State variables
    address public owner;
    address public governance;
    
    bool public systemPaused;
    uint256 public pausedAt;
    string public pauseReason;
    
    address[] public pausers;
    mapping(address => bool) public isPauser;
    mapping(address => uint256) public pauserWeight; // 0-100, higher = more authority
    
    PauseEvent[] public pauseHistory;
    
    mapping(bytes32 => bool) public pausedFunctions; // keccak256(contractAddress, functionSelector)
    
    // Events
    event PauserAdded(address indexed pauser, uint256 weight);
    event PauserRemoved(address indexed pauser);
    event SystemPaused(address indexed pauser, string reason, uint256 timestamp);
    event SystemUnpaused(address indexed by, uint256 timestamp);
    event FunctionPaused(address indexed target, bytes4 functionSelector, string reason);
    event FunctionUnpaused(address indexed target, bytes4 functionSelector);
    event EmergencyExecuted(address indexed caller, string action, string reason);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "only governance");
        _;
    }

    modifier onlyPauser() {
        require(isPauser[msg.sender], "not pauser");
        _;
    }

    modifier notPaused() {
        require(!systemPaused, "system paused");
        _;
    }

    /**
     * @dev Constructor initializes the pause system
     * @param _governance Address of governance contract
     */
    constructor(address _governance) {
        require(_governance != address(0), "zero governance");
        owner = msg.sender;
        governance = _governance;
    }

    /**
     * @dev Add a pauser with specific weight
     * @param _pauser Address to grant pause authority
     * @param _weight Weight of the pauser (0-100)
     */
    function addPauser(address _pauser, uint256 _weight) external onlyOwner {
        require(_pauser != address(0), "zero address");
        require(_weight > 0 && _weight <= 100, "invalid weight");
        require(!isPauser[_pauser], "already pauser");

        isPauser[_pauser] = true;
        pauserWeight[_pauser] = _weight;
        pausers.push(_pauser);

        emit PauserAdded(_pauser, _weight);
    }

    /**
     * @dev Remove a pauser
     * @param _pauser Address to revoke pause authority
     */
    function removePauser(address _pauser) external onlyOwner {
        require(isPauser[_pauser], "not pauser");

        isPauser[_pauser] = false;
        pauserWeight[_pauser] = 0;

        // Remove from array
        for (uint256 i = 0; i < pausers.length; i++) {
            if (pausers[i] == _pauser) {
                pausers[i] = pausers[pausers.length - 1];
                pausers.pop();
                break;
            }
        }

        emit PauserRemoved(_pauser);
    }

    /**
     * @dev Pause the entire system (for critical emergencies)
     * @param _reason Reason for the pause
     */
    function pauseSystem(string calldata _reason) external onlyPauser {
        require(!systemPaused, "already paused");
        require(bytes(_reason).length > 0, "need reason");

        systemPaused = true;
        pausedAt = block.timestamp;
        pauseReason = _reason;

        pauseHistory.push(
            PauseEvent({
                pauser: msg.sender,
                pausedAt: block.timestamp,
                reason: _reason,
                reverted: false
            })
        );

        emit SystemPaused(msg.sender, _reason, block.timestamp);
    }

    /**
     * @dev Unpause the system (only owner or governance)
     */
    function unpauseSystem() external {
        require(msg.sender == owner || msg.sender == governance, "not authorized");
        require(systemPaused, "not paused");

        systemPaused = false;
        
        if (pauseHistory.length > 0) {
            pauseHistory[pauseHistory.length - 1].reverted = true;
        }

        emit SystemUnpaused(msg.sender, block.timestamp);
    }

    /**
     * @dev Auto-unpause if enough time has passed
     * Allows the system to recover automatically after a period
     */
    function autoUnpause() external {
        require(systemPaused, "not paused");
        require(
            block.timestamp >= pausedAt + AUTO_UNPAUSE_DURATION,
            "still in pause window"
        );

        systemPaused = false;
        
        if (pauseHistory.length > 0) {
            pauseHistory[pauseHistory.length - 1].reverted = true;
        }

        emit SystemUnpaused(msg.sender, block.timestamp);
    }

    /**
     * @dev Pause a specific function in a contract
     * @param _target Target contract address
     * @param _functionSelector Function selector (first 4 bytes of signature hash)
     * @param _reason Reason for pause
     */
    function pauseFunction(
        address _target,
        bytes4 _functionSelector,
        string calldata _reason
    ) external onlyPauser {
        require(_target != address(0), "zero target");
        require(bytes(_reason).length > 0, "need reason");

        bytes32 pauseKey = keccak256(abi.encode(_target, _functionSelector));
        require(!pausedFunctions[pauseKey], "already paused");

        pausedFunctions[pauseKey] = true;
        emit FunctionPaused(_target, _functionSelector, _reason);
    }

    /**
     * @dev Unpause a specific function
     * @param _target Target contract address
     * @param _functionSelector Function selector
     */
    function unpauseFunction(address _target, bytes4 _functionSelector)
        external
        onlyOwner
    {
        bytes32 pauseKey = keccak256(abi.encode(_target, _functionSelector));
        require(pausedFunctions[pauseKey], "not paused");

        pausedFunctions[pauseKey] = false;
        emit FunctionUnpaused(_target, _functionSelector);
    }

    /**
     * @dev Emergency action execution (owner only, even during pause)
     * @param _action Action to perform (e.g., "withdraw", "upgrade")
     * @param _reason Reason for emergency action
     */
    function emergencyAction(string calldata _action, string calldata _reason)
        external
        onlyOwner
    {
        require(bytes(_action).length > 0, "no action");
        require(bytes(_reason).length > 0, "no reason");

        emit EmergencyExecuted(msg.sender, _action, _reason);
    }

    // View functions
    function isPaused() external view returns (bool) {
        return systemPaused;
    }

    function getPauseInfo()
        external
        view
        returns (
            bool paused,
            uint256 pauseTimestamp,
            string memory reason,
            uint256 timeRemaining
        )
    {
        paused = systemPaused;
        pauseTimestamp = pausedAt;
        reason = pauseReason;
        
        if (systemPaused && block.timestamp < pausedAt + AUTO_UNPAUSE_DURATION) {
            timeRemaining = pausedAt + AUTO_UNPAUSE_DURATION - block.timestamp;
        } else {
            timeRemaining = 0;
        }
    }

    function isFunctionPaused(address _target, bytes4 _functionSelector)
        external
        view
        returns (bool)
    {
        bytes32 pauseKey = keccak256(abi.encode(_target, _functionSelector));
        return pausedFunctions[pauseKey];
    }

    function getPauserCount() external view returns (uint256) {
        return pausers.length;
    }

    function getPauser(uint256 _index) external view returns (address) {
        return pausers[_index];
    }

    function getPauseHistoryLength() external view returns (uint256) {
        return pauseHistory.length;
    }

    function getPauseEvent(uint256 _index)
        external
        view
        returns (PauseEvent memory)
    {
        return pauseHistory[_index];
    }
}
