const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// PREVIOUSLY DEPLOYED ADDRESSES
const addresses = {
    incidentManager: "0x927786D628dcC759a6bAF80F221feFF164Ae3Eeb",
    runbookManager: "0xe49F3Bb9C25971D12Bf7220B9000Ca771194d5de",
    workflowExecutor: "0x324E6a1F2c1Ac02AEE916608BEA8D2CBc382945E",
    actionManager: "0x27977276F947E65adB9f21218443585646970255",
    orchestrator: "0x79c70383fF83ca2B200213598143E3d5ab04FbBb"
};

if (!PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not found in .env.local');
    process.exit(1);
}

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    console.log(`📡 Resuming with: ${wallet.address}`);
    console.log(`🌐 RPC: ${RPC_URL}`);

    const getArtifact = (name) => {
        const filePath = path.join(__dirname, `../../out/${name}.sol/${name}.json`);
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    };

    try {
        console.log('🔄 Loading deployed contracts...');
        const runbookManager = new ethers.Contract(addresses.runbookManager, getArtifact('AutomatedRunbook').abi, wallet);
        const workflowExecutor = new ethers.Contract(addresses.workflowExecutor, getArtifact('WorkflowExecutor').abi, wallet);
        const actionManager = new ethers.Contract(addresses.actionManager, getArtifact('ResponseAction').abi, wallet);
        const orchestrator = new ethers.Contract(addresses.orchestrator, getArtifact('IncidentResponseOrchestrator').abi, wallet);
        const incidentManager = new ethers.Contract(addresses.incidentManager, getArtifact('SecureIncidentManager').abi, wallet);

        // 6. Setup Permissions
        console.log('极 Setting up permissions...');

        // Skip roles if already granted (can just retry, grantRole is idempotent)
        const EXECUTOR_ROLE = await runbookManager.EXECUTOR_ROLE();
        await (await runbookManager.grantRole(EXECUTOR_ROLE, addresses.orchestrator)).wait();
        console.log('Granted EXECUTOR_ROLE to Orchestrator');

        const MONITOR_ROLE = await workflowExecutor.MONITOR_ROLE();
        await (await workflowExecutor.grantRole(MONITOR_ROLE, addresses.orchestrator)).wait();
        console.log('Granted MONITOR_ROLE to Orchestrator');

        const INCIDENT_MANAGER_ROLE = await orchestrator.INCIDENT_MANAGER();
        await (await orchestrator.grantRole(INCIDENT_MANAGER_ROLE, addresses.incidentManager)).wait();
        console.log(`Granted INCIDENT_MANAGER role to: ${addresses.incidentManager}`);

        await (await incidentManager.authorizeReporter(wallet.address)).wait();
        console.log('Authorized deployer as reporter');

        // 7. Configure Default Runbook for BlockLag
        console.log('📜 Configuring default BlockLag runbook...');
        const runbookActions = [{
            actionType: "alert",
            targetContract: addresses.orchestrator,
            callData: orchestrator.interface.encodeFunctionData("escalateResponse", [0, "AUTO_ALERT_LAG"]),
            gasLimit: 300000,
            required: true
        }];

        await (await runbookManager.createRunbook(
            "Block Lag Recovery",
            "Initial automated response for block production delays",
            "BlockLag",
            runbookActions
        )).wait();
        console.log('Created BlockLag Runbook');

        // 8. Configure Workflow Trigger
        await (await workflowExecutor.configureTrigger(
            "BlockLag",
            [1], // First runbook
            3,   // Critical
            3600
        )).wait();
        console.log('Configured Workflow Trigger');

        // 9. Configure Orchestrator Policy
        await (await orchestrator.configureResponsePolicy(
            "BlockLag",
            true, // autoRespond
            300,  // 5 min
            [1],  // runbookIds
            [],   // actionIds
            2     // escalationThreshold
        )).wait();
        console.log('Configured Orchestrator Policy');

        // 10. Link Orchestrator in SecureIncidentManager
        console.log('🔗 Linking Orchestrator in IncidentManager...');
        await (await incidentManager.setOrchestrator(addresses.orchestrator)).wait();
        console.log('SUCCESS: Orchestrator linked to NEW IncidentManager');

        console.log('\n--- DEPLOYMENT SUMMARY ---');
        console.log(`SecureIncidentManager: ${addresses.incidentManager}`);
        console.log(`AutomatedRunbook: ${addresses.runbookManager}`);
        console.log(`WorkflowExecutor: ${addresses.workflowExecutor}`);
        console.log(`ResponseAction: ${addresses.actionManager}`);
        console.log(`IncidentResponseOrchestrator: ${addresses.orchestrator}`);
        console.log('--------------------------');

        fs.writeFileSync(path.join(__dirname, '../../v3_deployment.json'), JSON.stringify(addresses, null, 2));

    } catch (error) {
        console.error('❌ Resume Failed:', error);
    }
}

main();
