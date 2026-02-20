const { ethers } = require('ethers');
require('dotenv').config({ path: './Frontend/.env.local' });

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const monitorAddress = process.env.MONITOR_ADDRESS;
    const chainId = process.env.CHAIN_ID;

    console.log('Monitor Address:', monitorAddress);
    console.log('Chain ID:', chainId);

    const abi = [
        "function lastSignalTime(uint256) view returns (uint256)",
        "function lastL1BatchTimestamp(uint256) view returns (uint256)",
        "function lastL1BatchNumber(uint256) view returns (uint256)"
    ];

    const reporter = new ethers.Contract(monitorAddress, abi, provider);

    try {
        const [signal, batchTime, batchNum] = await Promise.all([
            reporter.lastSignalTime(chainId),
            reporter.lastL1BatchTimestamp(chainId),
            reporter.lastL1BatchNumber(chainId)
        ]);

        console.log('Signal Time:', signal.toString());
        console.log('Batch Timestamp:', batchTime.toString());
        console.log('Batch Number:', batchNum.toString());
        console.log('Current Time:', Math.floor(Date.now() / 1000));
    } catch (e) {
        console.error('Error:', e);
    }
}

main();
