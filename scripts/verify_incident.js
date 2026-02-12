const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const INCIDENT_MANAGER_ADDRESS = process.env.INCIDENT_MANAGER_ADDRESS;

const IncidentAbi = [
    'function getIncidentCount() external view returns (uint256)',
    'function allIncidentIds(uint256) external view returns (uint256)',
    'function getIncident(uint256) external view returns (tuple(uint256 chainId, uint256 detectedAt, uint8 failureType, uint8 severity, string description, bool resolved))'
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const incidentManager = new ethers.Contract(INCIDENT_MANAGER_ADDRESS, IncidentAbi, provider);

    console.log('Checking incidents on:', INCIDENT_MANAGER_ADDRESS);

    try {
        const count = await incidentManager.getIncidentCount();
        console.log('Incident Count:', count.toString());

        if (count > 0) {
            const id = await incidentManager.allIncidentIds(count - 1);
            console.log('Latest Incident ID:', id.toString());

            const incident = await incidentManager.getIncident(id);
            console.log('Incident Details:');
            console.log('- Chain ID:', incident.chainId.toString());
            console.log('- Description:', incident.description);
            console.log('- Severity:', incident.severity);
            console.log('- Resolved:', incident.resolved);
        } else {
            console.log('No incidents found.');
        }
    } catch (e) {
        console.error('Error fetching incidents:', e.message);
    }
}

main();
