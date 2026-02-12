// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SequencerPause
 * @dev Simple circuit breaker to halt sequencer operations during incidents.
 */
contract SequencerPause is Ownable {
    bool public sequencerPaused;

    event SequencerPaused(uint256 indexed incidentId, string reason);
    event SequencerResumed(address indexed by);

    // FIX: Pass initialOwner to the Ownable constructor
    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @notice Halts the sequencer.
     * @param incidentId ID from the IncidentManager.
     * @param reason Brief description of why the pause is occurring.
     */
    function pauseSequencer(uint256 incidentId, string calldata reason) external onlyOwner {
        if (sequencerPaused) return; // Prevent redundant state changes
        
        sequencerPaused = true;
        emit SequencerPaused(incidentId, reason);
    }

    /**
     * @notice Resumes sequencer operations.
     */
    function resumeSequencer() external onlyOwner {
        if (!sequencerPaused) return;

        sequencerPaused = false;
        emit SequencerResumed(msg.sender);
    }

    /**
     * @notice External view to check the current status.
     */
    function isPaused() external view returns (bool) {
        return sequencerPaused;
    }
}