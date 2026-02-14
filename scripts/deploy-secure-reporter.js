const ethers = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
// Also load frontend env for public addresses if not in root env
require('dotenv').config({ path: path.resolve(__dirname, '../frontend/.env.local') });

// Configuration
const RPC_URL = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const INCIDENT_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_INCIDENT_MANAGER_ADDRESS || process.env.INCIDENT_MANAGER_ADDRESS;
const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || process.env.REGISTRY_ADDRESS;

if (!PRIVATE_KEY) {
    console.error("Please set PRIVATE_KEY in .env or environment variables");
    process.exit(1);
}

if (!INCIDENT_MANAGER_ADDRESS || !REGISTRY_ADDRESS) {
    console.error("Missing contract addresses in .env.local");
    process.exit(1);
}

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL, undefined, { staticNetwork: true, timeout: 60000 });
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log("Deploying SecureHealthReporter with account:", wallet.address);
    console.log("Registry:", REGISTRY_ADDRESS);
    console.log("IncidentManager:", INCIDENT_MANAGER_ADDRESS);

    // Read artifact
    // Ideally compile first, but assuming we run this with a tool that handles it or we pre-compile.
    // Since we are in an environment where we might need to compile, let's use a simple solc wrapper or assume Foundry output exists if we run `forge build`.
    // Let's assume standard Forge project structure where out/SecureHealthReporter.sol/SecureHealthReporter.json exists.

    const artifactPath = path.resolve(__dirname, '../out/SecureHealthReporter.sol/SecureHealthReporter.json');

    if (!fs.existsSync(artifactPath)) {
        console.log("Artifact not found, please run `forge build` first.");
        return;
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, wallet);

    // Deploy
    // constructor(address _registry, address _incidents, address _reporter)
    // We set the deployer as the initial reporter for simplicity to allow testing
    const contract = await factory.deploy(REGISTRY_ADDRESS, INCIDENT_MANAGER_ADDRESS, wallet.address);

    console.log("Deploying contract...");
    await contract.waitForDeployment(); // ethers v6

    const address = await contract.getAddress();
    console.log("SecureHealthReporter deployed to:", address);

    // Authorize Reporter on IncidentManager
    // Note: This requires the deployer to have GOVERNANCE_ROLE on SecureIncidentManager
    // If not, this step will fail or needs to be done manually.
    console.log("Attempting to authorize new reporter on IncidentManager...");

    const imArtifactPath = path.resolve(__dirname, '../out/SecureIncidentManager.sol/SecureIncidentManager.json');
    const imArtifact = JSON.parse(fs.readFileSync(imArtifactPath, 'utf8'));
    const incidentManager = new ethers.Contract(INCIDENT_MANAGER_ADDRESS, imArtifact.abi, wallet);

    try {
        // authorizeReporter(address) is the function on SecureIncidentManager
        const tx = await incidentManager.authorizeReporter(address);
        console.log("Authorization tx sent:", tx.hash);
        await tx.wait();
        console.log("SecureHealthReporter authorized on IncidentManager.");
    } catch (e) {
        console.error("Failed to authorize reporter. Ensure deployer has GOVERNANCE_ROLE.");
        console.error(e.message);
    }
}

main();
