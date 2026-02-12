// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GovernanceVault
 * @dev Simple proposal tracking system. In this version, the owner manages 
 * the lifecycle of proposals.
 */
contract GovernanceVault is Ownable {
    struct Proposal {
        uint256 id;
        string title;
        string description;
        uint256 createdAt;
        bool executed;
    }

    uint256 public nextProposalId;
    mapping(uint256 => Proposal) public proposals;

    event ProposalCreated(uint256 indexed id, string title);
    event ProposalExecuted(uint256 indexed id);

    // FIX: Pass initialOwner to Ownable constructor
    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @notice Creates a new proposal. 
     * @dev Uses storage pointer for better gas efficiency.
     */
    function createProposal(string calldata title, string calldata description) external onlyOwner returns (uint256) {
        uint256 id = ++nextProposalId;
        
        // Use a storage pointer to initialize fields directly
        Proposal storage newProposal = proposals[id];
        newProposal.id = id;
        newProposal.title = title;
        newProposal.description = description;
        newProposal.createdAt = block.timestamp;
        newProposal.executed = false;

        emit ProposalCreated(id, title);
        return id;
    }

    /**
     * @notice Marks a proposal as executed.
     * @param id The ID of the proposal to execute.
     */
    function executeProposal(uint256 id) external onlyOwner {
        Proposal storage proposal = proposals[id];
        
        // Ensure the proposal exists (id won't be 0)
        require(proposal.id != 0, "Proposal does not exist");
        require(!proposal.executed, "Already executed");

        proposal.executed = true;
        emit ProposalExecuted(id);
    }
}