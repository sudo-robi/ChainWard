// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FailoverController
 * @dev Manages failover states for multiple chains with owner-only access.
 */
contract FailoverController is Ownable {
    // Mapping from chainId to its failover status
    mapping(uint256 => bool) private _failoverActive;

    event FailoverActivated(uint256 indexed chainId);
    event FailoverDeactivated(uint256 indexed chainId);

    // FIX: Pass the initialOwner to the Ownable constructor
    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @notice Activates failover for a specific chain.
     * @param chainId The ID of the chain to activate.
     */
    function activateFailover(uint256 chainId) external onlyOwner {
        if (_failoverActive[chainId]) return; // Save gas if already active
        _failoverActive[chainId] = true;
        emit FailoverActivated(chainId);
    }

    /**
     * @notice Deactivates failover for a specific chain.
     * @param chainId The ID of the chain to deactivate.
     */
    function deactivateFailover(uint256 chainId) external onlyOwner {
        if (!_failoverActive[chainId]) return; // Save gas if already inactive
        _failoverActive[chainId] = false;
        emit FailoverDeactivated(chainId);
    }

    /**
     * @notice Checks if failover is active for a given chain.
     * @param chainId The ID of the chain to check.
     */
    function isFailoverActive(uint256 chainId) external view returns (bool) {
        return _failoverActive[chainId];
    }
}