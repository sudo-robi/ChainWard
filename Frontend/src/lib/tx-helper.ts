import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const INCIDENT_MANAGER_ADDRESS = process.env.INCIDENT_MANAGER_ADDRESS || '0x926e9c2885B7a75BDe8baeBa8d9738Aa28aA4DdB';
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS || '0x5dF982674c638D38d16cB9D1d6d07fC3d93BfBe4';
const MONITOR_ADDRESS = process.env.MONITOR_ADDRESS || '0x7a5e0237E45574727aA4352244B1f72559BbA229';

if (!PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY not set in environment');
}

export const getProvider = () => new ethers.JsonRpcProvider(RPC_URL);
export const getWallet = () => new ethers.Wallet(PRIVATE_KEY as string, getProvider());

export const INCIDENT_ABI = [
    "function reportIncident(string incidentType, uint256 severity, string description) external returns (uint256)",
    "function validateIncident(uint256 incidentId, bool approved, string feedback) external",
    "function resolveIncident(uint256 incidentId, string reason) external",
    "function nextIncidentId() view returns (uint256)"
];

export const REGISTRY_ABI = [
    "function deactivateChain(uint256 chainId) external",
    "function updateThresholds(uint256 chainId, uint256 expectedBlockTime, uint256 maxBlockLag) external",
    "function updateOperator(uint256 chainId, address operator) external"
];

export const MONITOR_ABI = [
    "function submitHealthSignal(uint256,uint256,uint256,uint256,bool,uint256,uint256,bool,string) external"
];

export async function sendTransaction(contractAddress: string, abi: any[], method: string, args: any[]) {
    const wallet = getWallet();
    const contract = new ethers.Contract(contractAddress, abi, wallet);

    console.log(`📡 Sending server-side tx: ${method} to ${contractAddress}`);
    const tx = await contract[method](...args);
    const receipt = await tx.wait();
    console.log(`✅ Tx Confirmed: ${receipt.hash}`);

    return {
        hash: receipt.hash,
        status: receipt.status,
        blockNumber: receipt.blockNumber
    };
}

export const addresses = {
    incidentManager: INCIDENT_MANAGER_ADDRESS,
    registry: REGISTRY_ADDRESS,
    monitor: MONITOR_ADDRESS
};
