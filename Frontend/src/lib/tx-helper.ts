import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const INCIDENT_MANAGER_ADDRESS = process.env.INCIDENT_MANAGER_ADDRESS || '0x73FFF882740ed596AeA90F654Afe2BCbE57c36E1';
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS || '0xf2D0094e9a1c33FAdCd34DA478678639Cb86e6bC';
const MONITOR_ADDRESS = process.env.MONITOR_ADDRESS || '0x7a5e0237E45574727aA4352244B1f72559BbA229';
const ORCHESTRATOR_ADDRESS = process.env.ORCHESTRATOR_ADDRESS || '0xC0A011F642f5eb59535f4E79CbC17EdcC6D80D92';

const ensureWallet = () => {
    const pk = process.env.PRIVATE_KEY;
    if (!pk) {
        throw new Error('PRIVATE_KEY not set in environment. Please ensure it is defined in Frontend/.env.local or the server environment.');
    }
    return new ethers.Wallet(pk, getProvider());
};

export const getProvider = () => new ethers.JsonRpcProvider(RPC_URL);
export const getWallet = () => ensureWallet();

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

export const ORCHESTRATOR_ABI = [
    "event IncidentResponseTriggered(uint256 indexed incidentId, string incidentType, uint256 executionPlanId, bool autoRespond)",
    "function triggerIncidentResponse(uint256 incidentId, string calldata incidentType) external returns (uint256)"
];

export async function sendTransaction(contractAddress: string, abi: any[], method: string, args: any[]) {
    const wallet = getWallet();
    const contract = new ethers.Contract(contractAddress, abi, wallet);

    console.log(`📡 Sending server-side tx: ${method} to ${contractAddress}`);
    const tx = await contract[method](...args);
    const receipt = await tx.wait();
    console.log(`✅ Tx Confirmed: ${receipt.hash}`);

    return receipt;
}

export const addresses = {
    incidentManager: INCIDENT_MANAGER_ADDRESS,
    registry: REGISTRY_ADDRESS,
    monitor: MONITOR_ADDRESS,
    orchestrator: ORCHESTRATOR_ADDRESS
};
