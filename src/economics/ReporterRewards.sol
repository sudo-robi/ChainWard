// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
// Recommended: Adding ReentrancyGuard for the claim function
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ReporterRewards
 * @dev Tracks &distributes rewards to system health reporters.
 */
contract ReporterRewards is Ownable, ReentrancyGuard {
    mapping(address => uint256) public pendingRewards;
    mapping(address => uint256) public earned;

    event RewardAccrued(address indexed reporter, uint256 amount);
    event RewardClaimed(address indexed reporter, uint256 amount);

    // FIX: Pass initialOwner to Ownable constructor
    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @notice Adds rewards to a reporter's balance. 
     * @dev Restricted to the owner (e.g., an IncidentManager contract).
     */
    function accrueReward(address reporter, uint256 amount) external onlyOwner {
        require(reporter != address(0), "Invalid reporter address");
        pendingRewards[reporter] += amount;
        emit RewardAccrued(reporter, amount);
    }

    /**
     * @notice Allows reporters to claim their accumulated rewards.
     * @dev Implements Checks-Effects-Interactions pattern.
     */
    function claimRewards() external nonReentrant {
        uint256 amt = pendingRewards[msg.sender];
        require(amt > 0, "No rewards to claim");

        // Effect: Update state BEFORE interaction
        pendingRewards[msg.sender] = 0;
        earned[msg.sender] += amt;

        // Interaction: This is where you'd call your token's transfer function
        // IERC20(rewardToken).transfer(msg.sender, amt);

        emit RewardClaimed(msg.sender, amt);
    }

    function checkPending(address reporter) external view returns (uint256) {
        return pendingRewards[reporter];
    }
}