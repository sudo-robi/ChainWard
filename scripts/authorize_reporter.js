const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function main() {
    const RPC = process.env.RPC_URL;
    const PK = process.env.PRIVATE_KEY;
    const INCIDENT_MANAGER_ADDRESS = process.env.INCIDENT_MANAGER_ADDRESS;

    if (!PK || !RPC || !INCIDENT_MANAGER_ADDRESS) {
        console.error('Missing env vars');
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(RPC);
    const wallet = new ethers.Wallet(PK, provider);

    console.log('Wallet:', wallet.address);
    console.log('IncidentManager:', INCIDENT_MANAGER_ADDRESS);

    const abi = [
        'function setReporterAuthorization(address reporter, bool authorized)',
        'function authorizedReporters(address) view returns (bool)',
        'function owner() view returns (address)'
    ];

    const contract = new ethers.Contract(INCIDENT_MANAGER_ADDRESS, abi, wallet);

    // Check current owner
    const owner = await contract.owner();
    console.log('Contract owner:', owner);
    console.log('Wallet is owner:', owner.toLowerCase() === wallet.address.toLowerCase());

    // Check if already authorized
    const isAuthorized = await contract.authorizedReporters(wallet.address);
    console.log('Already authorized:', isAuthorized);

    if (!isAuthorized) {
        console.log('Authorizing wallet as reporter...');
        const tx = await contract.setReporterAuthorization(wallet.address, true);
        console.log('Tx:', tx.hash);
        await tx.wait();
        console.log('✅ Wallet authorized as reporter');
    } else {
        console.log('✅ Wallet already authorized');
    }
}

main().catch(console.error);
