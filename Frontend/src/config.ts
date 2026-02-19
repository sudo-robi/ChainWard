// Configuration file that exposes environment variables
// All values come from .env - provides fallbacks for missing vars to prevent NaN/undefined errors

const USE_PROXY = typeof window !== 'undefined';
const PROXY_URL = typeof window !== 'undefined' ? `${window.location.origin}/api/rpc` : '';

// Validate and parse chainId: must be a positive integer, fallback to 421614 (Arbitrum Sepolia)
const parseChainId = (val?: string): number => {
    const parsed = Number(val);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    console.warn('⚠️ Invalid or missing NEXT_PUBLIC_CHAIN_ID, using default 421614');
    return 421614;
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
    rpcUrl: USE_PROXY ? PROXY_URL : (process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'),
    monitorAddress: process.env.NEXT_PUBLIC_MONITOR_ADDRESS || '0x7a5e0237E45574727aA4352244B1f72559BbA229',
    chainId: parseChainId(process.env.NEXT_PUBLIC_CHAIN_ID),
    registryAddress: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || '0x5dF982674c638D38d16cB9D1d6d07fC3d93BfBe4',
    incidentManagerAddress: process.env.NEXT_PUBLIC_INCIDENT_MANAGER_ADDRESS || '0x926e9c2885B7a75BDe8baeBa8d9738Aa28aA4DdB',
} as const;

if (typeof window !== 'undefined') {
    console.log('✅ Final Config:', config);
    console.log('🌐 RPC URL (using proxy):', config.rpcUrl);
}
