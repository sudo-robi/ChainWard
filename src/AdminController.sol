// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AdminController
 * @dev Manages governance roles for multisig-compatible admin access
 * 
 * Roles:
 * - DEFAULT_ADMIN_ROLE: Can grant/revoke roles
 * - PARAMETER_SETTER_ROLE: Can modify parameters (multisig via off-chain governance)
 */
contract AdminController is AccessControl {
    bytes32 public constant PARAMETER_SETTER_ROLE = keccak256("PARAMETER_SETTER_ROLE");
    
    event AdminRoleGranted(address indexed account, bytes32 indexed role);
    
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PARAMETER_SETTER_ROLE, admin);
    }
    
    /**
     * @dev Grant PARAMETER_SETTER_ROLE to a multisig or DAO contract
     */
    function grantParameterSetter(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(PARAMETER_SETTER_ROLE, account);
        emit AdminRoleGranted(account, PARAMETER_SETTER_ROLE);
    }
    
    /**
     * @dev Revoke PARAMETER_SETTER_ROLE
     */
    function revokeParameterSetter(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(PARAMETER_SETTER_ROLE, account);
    }
}
