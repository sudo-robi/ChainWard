#!/usr/bin/env node
/**
 * Sync environment files from the canonical contracts.json configuration
 * Usage: node config/sync-env.js
 */

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'contracts.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const network = config.arbitrumSepolia;

// Update root .env
const rootEnvPath = path.join(__dirname, '../.env');
const rootEnvContent = `PRIVATE_KEY=${process.env.PRIVATE_KEY || '573d875d95b272cdc6be8e0768238c6d84fab642e4feeb609fd91d9f6fdda5b5'}
ETHERSCAN_API_KEY=${network.explorer.apiKey}
RPC_URL=${network.rpcUrl}
REGISTRY_ADDRESS=${network.contracts.OrbitChainRegistry}
MONITOR_ADDRESS=${network.contracts.HealthMonitor}
INCIDENT_MANAGER_ADDRESS=${network.contracts.IncidentManager}
CHAIN_ID=${network.chainId}
`;

fs.writeFileSync(rootEnvPath, rootEnvContent);
console.log('✅ Updated root .env');

// Update frontend .env.local (note: directory is 'Frontend' with capital F)
const frontendEnvPath = path.join(__dirname, '../Frontend/.env.local');
const frontendEnvContent = `NEXT_PUBLIC_RPC_URL=${network.rpcUrl}
NEXT_PUBLIC_MONITOR_ADDRESS=${network.contracts.HealthMonitor}
NEXT_PUBLIC_CHAIN_ID=${network.chainId}
NEXT_PUBLIC_REGISTRY_ADDRESS=${network.contracts.OrbitChainRegistry}
NEXT_PUBLIC_INCIDENT_MANAGER_ADDRESS=${network.contracts.IncidentManager}
`;

fs.writeFileSync(frontendEnvPath, frontendEnvContent);
console.log('✅ Updated Frontend/.env.local');

// Update frontend config.ts with proper fallbacks
const configTsPath = path.join(__dirname, '../Frontend/src/config.ts');
const configTsContent = `// Configuration file that exposes environment variables
// All values come from .env - provides fallbacks for missing vars to prevent NaN/undefined errors

const USE_PROXY = typeof window !== 'undefined';
const PROXY_URL = typeof window !== 'undefined' ? \`\${window.location.origin}/api/rpc\` : '';

// Validate and parse chainId: must be a positive integer, fallback to ${network.chainId}
const parseChainId = (val?: string): number => {
    const parsed = Number(val);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    console.warn('⚠️ Invalid or missing NEXT_PUBLIC_CHAIN_ID, using default ${network.chainId}');
    return ${network.chainId};
};

if (typeof window !== 'undefined') {
    console.log('🔧 Config Debug - Environment Variables:', {
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
        monitorAddress: process.env.NEXT_PUBLIC_MONITOR_ADDRESS,
        chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
        registryAddress: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS,
        incidentManagerAddress: process.env.NEXT_PUBLIC_INCIDENT_MANAGER_ADDRESS,
    });
}

export const config = {
    rpcUrl: USE_PROXY ? PROXY_URL : (process.env.NEXT_PUBLIC_RPC_URL || '${network.rpcUrl}'),
    monitorAddress: process.env.NEXT_PUBLIC_MONITOR_ADDRESS || '${network.contracts.HealthMonitor}',
    chainId: parseChainId(process.env.NEXT_PUBLIC_CHAIN_ID),
    registryAddress: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || '${network.contracts.OrbitChainRegistry}',
    incidentManagerAddress: process.env.NEXT_PUBLIC_INCIDENT_MANAGER_ADDRESS || '${network.contracts.IncidentManager}',
} as const;

if (typeof window !== 'undefined') {
    console.log('✅ Final Config:', config);
    console.log('🌐 RPC URL (using proxy):', config.rpcUrl);
}
`;

fs.writeFileSync(configTsPath, configTsContent);
console.log('✅ Updated Frontend/src/config.ts (with contract address fallbacks)');

console.log('\n📝 Contract addresses synced from config/contracts.json');
console.log(`   Network: Arbitrum Sepolia (${network.chainId})`);
console.log(`   Registry: ${network.contracts.OrbitChainRegistry}`);
console.log(`   Monitor: ${network.contracts.HealthMonitor}`);
console.log(`   IncidentManager: ${network.contracts.IncidentManager}`);
