// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

contract BridgeLock is Ownable {
    mapping(uint256 => bool) public locked;

    event BridgesLocked(uint256 indexed chainId);
    event BridgesUnlocked(uint256 indexed chainId);

    constructor() Ownable(msg.sender) {}

    function lockBridges(uint256 chainId) external onlyOwner {
        locked[chainId] = true;
        emit BridgesLocked(chainId);
    }

    function unlockBridges(uint256 chainId) external onlyOwner {
        locked[chainId] = false;
        emit BridgesUnlocked(chainId);
    }

    function areBridgesLocked(uint256 chainId) external view returns (bool) {
        return locked[chainId];
    }
}
