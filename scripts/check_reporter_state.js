const ethers = require('ethers');

const RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";
const REPORTER_ADDRESS = "0x2dB1352bc197A93330198175e69338Cf4B5fF115";
const USER_ADDRESS = "0xB7cB63B75ffD4ce00C6B7B85e1C59501A338Da3a"; // Sender in the failed tx

const ABI = [
    "function reporter() view returns (address)",
    "function incidents() view returns (address)",
    "function registry() view returns (address)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(REPORTER_ADDRESS, ABI, provider);

    console.log("Checking HealthReporter at:", REPORTER_ADDRESS);

    try {
        const reporter = await contract.reporter();
        console.log("Reporter (authorized signer):", reporter);
        console.log("Is User Authorized?", reporter.toLowerCase() === USER_ADDRESS.toLowerCase());
    } catch (e) {
        console.error("Failed to fetch reporter:", e.message);
    }

    try {
        const incidents = await contract.incidents();
        console.log("Linked IncidentManager:", incidents);
    } catch (e) {
        console.error("Failed to fetch incidents:", e.message);
    }
}

main();
