const { ethers } = require('ethers');
require('dotenv').config({ path: './Frontend/.env.local' });

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const incidentManagerAddress = process.env.INCIDENT_MANAGER_ADDRESS;

    console.log('Granting roles for wallet:', wallet.address);

    const abi = [
        "function grantRole(bytes32 role, address account) external",
        "function VALIDATOR_ROLE() view returns (bytes32)",
        "function REPORTER_ROLE() view returns (bytes32)",
        "function EMERGENCY_ROLE() view returns (bytes32)"
    ];

    const contract = new ethers.Contract(incidentManagerAddress, abi, wallet);

    try {
        const validatorRole = await contract.VALIDATOR_ROLE();
        const reporterRole = await contract.REPORTER_ROLE();
        const emergencyRole = await contract.EMERGENCY_ROLE();

        console.log('Granting VALIDATOR_ROLE...');
        let tx = await contract.grantRole(validatorRole, wallet.address);
        await tx.wait();
        console.log('VALIDATOR_ROLE granted.');

        console.log('Granting REPORTER_ROLE...');
        tx = await contract.grantRole(reporterRole, wallet.address);
        await tx.wait();
        console.log('REPORTER_ROLE granted.');

        console.log('Granting EMERGENCY_ROLE...');
        tx = await contract.grantRole(emergencyRole, wallet.address);
        await tx.wait();
        console.log('EMERGENCY_ROLE granted.');

        console.log('All roles successfully granted!');
    } catch (e) {
        console.error('Failed to grant roles:', e.message || e);
    }
}

main();
