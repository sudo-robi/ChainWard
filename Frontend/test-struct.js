const { ethers } = require('ethers');
require('dotenv').config({ path: './Frontend/.env.local' });

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const incidentManagerAddress = process.env.INCIDENT_MANAGER_ADDRESS;

    const abi = [
        "function getIncident(uint256 incidentId) view returns (tuple(uint256 id, string incidentType, uint256 timestamp, address reporter, uint256 severity, string description, bool resolved, uint256 resolvedAt, uint256 validations, uint256 disputes, bool slashed))"
    ];

    const contract = new ethers.Contract(incidentManagerAddress, abi, provider);

    try {
        const inc = await contract.getIncident(1);
        console.log('Keys:', Object.keys(inc));
        console.log('Values:', Array.from(inc));
        console.log('inc.validations:', inc.validations);
        console.log('inc[8]:', inc[8]);

        // Let's see if it's a Result object or something else
        console.log('Type:', typeof inc);
        console.log('Is Array:', Array.isArray(inc));
    } catch (e) {
        console.error('Error:', e);
    }
}

main();
