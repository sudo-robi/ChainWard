const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function main() {
    const pk = process.env.PRIVATE_KEY;
    if (!pk) {
        console.log('No PRIVATE_KEY in .env');
        return;
    }
    const wallet = new ethers.Wallet(pk);
    console.log('Current .env PRIVATE_KEY Address:', wallet.address);

    const targetAddress = '0xB7cB63B75ffD4ce00C6B7B85e1C59501A338Da3a';
    console.log('Target Authorized Address:', targetAddress);

    if (wallet.address.toLowerCase() === targetAddress.toLowerCase()) {
        console.log('MATCH! The current key corresponds to the authorized address.');
    } else {
        console.log('MISMATCH. We need the private key for the target address.');
    }
}

main().catch(console.error);
