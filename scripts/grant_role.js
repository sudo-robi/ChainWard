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

    const abi = [
        'function grantRole(bytes32 role, address account)',
        'function hasRole(bytes32 role, address account) view returns (bool)',
        'function REPORTER_ROLE() view returns (bytes32)'
    ];

    const contract = new ethers.Contract(INCIDENT_MANAGER_ADDRESS, abi, wallet);

    const REPORTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REPORTER_ROLE"));
    console.log('REPORTER_ROLE hash:', REPORTER_ROLE);

    const hasRole = await contract.hasRole(REPORTER_ROLE, wallet.address);
    console.log('Has role?', hasRole);

    if (!hasRole) {
        console.log('Granting role...');
        const tx = await contract.grantRole(REPORTER_ROLE, wallet.address);
        console.log('Tx:', tx.hash);
        await tx.wait();
        console.log('Role granted');
    } else {
        console.log('Already has role');
    }
}

main().catch(console.error);
