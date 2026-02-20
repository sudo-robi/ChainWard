const { ethers } = require('ethers');
require('dotenv').config({ path: './Frontend/.env.local' });

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const incidentManagerAddress = process.env.INCIDENT_MANAGER_ADDRESS;

    console.log('Wallet:', wallet.address);
    console.log('Manager:', incidentManagerAddress);

    const abi = [
        "function hasRole(bytes32 role, address account) view returns (bool)",
        "function VALIDATOR_ROLE() view returns (bytes32)",
        "function GOVERNANCE_ROLE() view returns (bytes32)",
        "function REPORTER_ROLE() view returns (bytes32)",
        "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
        "function getIncident(uint256 id) view returns (tuple(uint256 id, string incidentType, uint256 timestamp, address reporter, uint256 severity, string description, bool resolved, uint256 resolvedAt, uint256 validations, uint256 disputes, bool slashed))",
        "function nextIncidentId() view returns (uint256)",
        "function owner() view returns (address)"
    ];

    const contract = new ethers.Contract(incidentManagerAddress, abi, provider);

    try {
        const adminRole = await contract.DEFAULT_ADMIN_ROLE();
        const validatorRole = await contract.VALIDATOR_ROLE();
        const govRole = await contract.GOVERNANCE_ROLE();
        const owner = await contract.owner();

        console.log('Owner:', owner);
        console.log('Is Admin:', await contract.hasRole(adminRole, wallet.address));
        console.log('Is Validator:', await contract.hasRole(validatorRole, wallet.address));
        console.log('Is Governance:', await contract.hasRole(govRole, wallet.address));

        const nextId = await contract.nextIncidentId();
        console.log('Next Incident ID:', nextId.toString());

        if (nextId > 1n) {
            const inc = await contract.getIncident(1);
            console.log('Incident 1 Status:', {
                id: inc.id.toString(),
                type: inc.incidentType,
                resolved: inc.resolved,
                validations: inc.validations.toString()
            });
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

main();
