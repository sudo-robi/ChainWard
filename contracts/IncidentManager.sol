// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IncidentManager
 * @notice Minimal incident recording contract. Allows reporters to submit incidents on-chain.
 * - reportIncident(string incidentType) -> emits IncidentReported
 * - stores incidentId, incidentType, timestamp, reporter
 *
 * Roles (access control):
 * - DEFAULT_ADMIN_ROLE: Can grant/revoke roles (deployer)
 * - REPORTER_ROLE: Can call reportIncident
 *
 * Note: This contract is intentionally minimal for demo/prototyping. For hackathon,
 * reporter role is hardcoded to demo address at deployment.
 */

import "@openzeppelin/contracts/access/AccessControl.sol";

contract IncidentManager is AccessControl {
    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");

    struct Incident {
        uint256 id;
        string incidentType;
        uint256 timestamp;
        address reporter;
    }

    uint256 public nextIncidentId;
    mapping(uint256 => Incident) public incidents;

    event IncidentReported(uint256 indexed incidentId, string incidentType, uint256 timestamp, address indexed reporter);

    /**
     * @notice Constructor: set up roles and grant REPORTER_ROLE to demo address
     * @param initialReporter The address that will be authorized to report incidents
     */
    constructor(address initialReporter) {
        // Grant DEFAULT_ADMIN_ROLE to deployer
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        
        // Grant REPORTER_ROLE to initialReporter (demo wallet)
        _grantRole(REPORTER_ROLE, initialReporter);
    }

    /**
     * @notice Report an incident. Only accounts with REPORTER_ROLE can call.
     * @param incidentType A short description or type identifier for the incident
     * @return incidentId The numeric id assigned to the incident
     */
    function reportIncident(string calldata incidentType) external onlyRole(REPORTER_ROLE) returns (uint256 incidentId) {
        incidentId = ++nextIncidentId;
        incidents[incidentId] = Incident({
            id: incidentId,
            incidentType: incidentType,
            timestamp: block.timestamp,
            reporter: msg.sender
        });

        emit IncidentReported(incidentId, incidentType, block.timestamp, msg.sender);
        return incidentId;
    }

    /**
     * @notice Get basic incident info for an id
     */
    function getIncident(uint256 incidentId) external view returns (uint256 id, string memory incidentType, uint256 timestamp, address reporter) {
        Incident storage it = incidents[incidentId];
        return (it.id, it.incidentType, it.timestamp, it.reporter);
    }

    /**
     * @notice Check if an address has reporter role
     */
    function isReporter(address account) external view returns (bool) {
        return hasRole(REPORTER_ROLE, account);
    }
}
