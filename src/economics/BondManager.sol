// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

contract BondManager is Ownable {
    constructor() Ownable(msg.sender) {}

    mapping(address => uint256) public bondAmount;
    mapping(address => uint256) public bondLockedUntil;

    event BondStaked(address indexed who, uint256 amount, uint256 lockedUntil);
    event BondUnstaked(address indexed who, uint256 amount);

    function stakeBond(uint256 amount, uint256 lockSeconds) external {
        require(amount > 0, "invalid");
        bondAmount[msg.sender] += amount;
        bondLockedUntil[msg.sender] = block.timestamp + lockSeconds;
        emit BondStaked(msg.sender, amount, bondLockedUntil[msg.sender]);
        // In production, transfer token to this contract
    }

    function unstakeBond() external {
        require(bondAmount[msg.sender] > 0, "none");
        require(block.timestamp >= bondLockedUntil[msg.sender], "locked");
        uint256 amt = bondAmount[msg.sender];
        bondAmount[msg.sender] = 0;
        bondLockedUntil[msg.sender] = 0;
        emit BondUnstaked(msg.sender, amt);
        // In production, transfer tokens back
    }
}
