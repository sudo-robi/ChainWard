const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function checkSet(provider, name, contracts) {
    console.log(`\n--- Checking ${name} ---`);
    for (const [key, addr] of Object.entries(contracts)) {
        if (!addr) continue;
        try {
            const code = await provider.getCode(addr);
            if (code === '0x') {
                console.log(`${key}: ${addr} -> ❌ NO CODE`);
                continue;
            }
            console.log(`${key}: ${addr} -> ✅ Code found (${code.length} bytes)`);

            if (key.toLowerCase().includes('registry')) {
                const registry = new ethers.Contract(addr, [
                    'function getChainIds() view returns (uint256[])',
                    'function owner() view returns (address)',
                    'function chains(uint256) view returns (address, string, uint256, uint256, bool)'
                ], provider);
                try {
                    const ids = await registry.getChainIds();
                    console.log(`   - getChainIds() -> Success: [${ids.join(', ')}]`);
                } catch (e) {
                    console.log(`   - getChainIds() -> ❌ FAILED: ${e.message.substring(0, 100)}`);
                }
                try {
                    const owner = await registry.owner();
                    console.log(`   - owner() -> Success: ${owner}`);
                } catch (e) {
                    console.log(`   - owner() -> ❌ FAILED: ${e.message.substring(0, 50)}`);
                }
            }

            if (key.toLowerCase().includes('reporter') || key.toLowerCase().includes('monitor')) {
                const monitor = new ethers.Contract(addr, [
                    'function getSignalCount() view returns (uint256)',
                    'function getSignal(uint256) view returns (uint256, uint256, uint256, uint256, bool, uint256, uint256, bool, string)',
                    'function lastL1BatchTimestamp(uint256) view returns (uint256)'
                ], provider);
                try {
                    const count = await monitor.getSignalCount();
                    console.log(`   - getSignalCount() -> Success: ${count}`);
                    if (count > 0) {
                        try {
                            const signal = await monitor.getSignal(0);
                            console.log(`   - getSignal(0) -> ChainId: ${signal[0]}, Block: ${signal[1]}`);
                        } catch (e2) {
                            console.log(`   - getSignal(0) -> ❌ FAILED: ${e2.message.substring(0, 50)}`);
                        }
                    }
                } catch (e) {
                    console.log(`   - getSignalCount() -> ❌ FAILED: ${e.message.substring(0, 50)}`);
                }
                try {
                    const ts = await monitor.lastL1BatchTimestamp(421614);
                    console.log(`   - lastL1BatchTimestamp(421614) -> Success: ${ts}`);
                } catch (e) {
                    // console.log(`   - lastL1BatchTimestamp(421614) -> ❌ FAILED`);
                }
            }
        } catch (globalE) {
            console.log(`${key}: ${addr} -> ❌ Global Error: ${globalE.message.substring(0, 100)}`);
        }
    }
}

async function main() {
    const RPC = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
    const provider = new ethers.JsonRpcProvider(RPC);

    const envSet = {
        REGISTRY: process.env.REGISTRY_ADDRESS,
        MONITOR: process.env.MONITOR_ADDRESS,
        INCIDENTS: process.env.INCIDENT_MANAGER_ADDRESS
    };

    const readmeSet = {
        REGISTRY: '0xaE5e3ED9f017c5d81E7F52aAF04ff11c4f6a1f1A',
        INCIDENTS: '0x2fA61C104436174b6DBcE2BAC306219D32269Dce',
        REPORTER: '0xB68f777E0Af5E6a6539b9CF3348A019d7c1DEEc4'
    };

    const deployLogSet = {
        REGISTRY: '0x40776dF7BB64828BfaFBE4cfacFECD80fED34266',
        INCIDENTS: '0xAE95E2F4DBFa908fb88744C12325e5e44244b6B0',
        REPORTER: '0x2630C5398Ef8A5196c16866E496155A6790C41b8'
    };

    const frontendEnvSet = {
        MONITOR: '0xBEab43581744B6Bfa017B81C42D85521a3429bfC'
    };

    await checkSet(provider, "Current .env", envSet);
    await checkSet(provider, "README.md", readmeSet);
    await checkSet(provider, "deploy.log", deployLogSet);
    await checkSet(provider, "frontend .env.local", frontendEnvSet);
}

main().catch(console.error);
