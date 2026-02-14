#!/usr/bin/env node
const ethers = require('ethers');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const INCIDENT_MANAGER_ADDRESS = process.env.INCIDENT_MANAGER_ADDRESS;
const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';

const IncidentManagerAbi = [
    "function getIncidentCount() view returns (uint256)",
    "function allIncidentIds(uint256) view returns (uint256)",
    "function incidents(uint256) view returns (uint256 chainId, uint256 detectedAt, uint256 resolvedAt, uint8 failureType, uint8 severity, uint8 priority, uint256 lastHealthyBlock, uint256 lastHealthyTimestamp, string description, bool resolved, uint256 parentIncidentId, string rcaTag)"
];

async function generateReport() {
    console.log('📊 ChainWard Analytics Engine');
    console.log('----------------------------');

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(INCIDENT_MANAGER_ADDRESS, IncidentManagerAbi, provider);

    try {
        const count = await contract.getIncidentCount();
        console.log(`Total incidents recorded: ${count}`);

        const ids = await Promise.all(
            Array.from({ length: Number(count) }).map((_, i) => contract.allIncidentIds(i))
        );

        const allIncidents = await Promise.all(ids.map(id => contract.incidents(id)));

        // Calculations
        let totalResTime = 0;
        let resolvedCount = 0;
        const uptimeWindow = 30 * 24 * 3600; // 30 days
        const now = Math.floor(Date.now() / 1000);
        let downtime = 0;

        allIncidents.forEach(inc => {
            if (inc.resolved) {
                totalResTime += (Number(inc.resolvedAt) - Number(inc.detectedAt));
                resolvedCount++;
            }

            const start = Math.max(Number(inc.detectedAt), now - uptimeWindow);
            const end = inc.resolved ? Number(inc.resolvedAt) : now;
            if (end > start) {
                downtime += (end - start);
            }
        });

        const mttrValue = resolvedCount > 0 ? (totalResTime / resolvedCount / 60).toFixed(2) : 0;
        const uptimeValue = (100 - (downtime / uptimeWindow * 100)).toFixed(3);

        const report = {
            generatedAt: new Date().toISOString(),
            mttr: `${mttrValue} minutes`,
            uptime30d: `${uptimeValue}%`,
            totalIncidents: allIncidents.length,
            incidentResolvedPercentage: allIncidents.length > 0 ? ((resolvedCount / allIncidents.length) * 100).toFixed(1) + '%' : '0%'
        };

        console.table(report);

        // Save to data directory
        const dataPath = path.join(__dirname, '../data/metrics-report.json');
        if (!fs.existsSync(path.dirname(dataPath))) fs.mkdirSync(path.dirname(dataPath), { recursive: true });
        fs.writeFileSync(dataPath, JSON.stringify(report, null, 2));
        console.log(`\n✅ Report saved to ${dataPath}`);

    } catch (e) {
        console.error('❌ Analytics Error:', e.message);
    }
}

generateReport();
