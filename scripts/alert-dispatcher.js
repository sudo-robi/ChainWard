#!/usr/bin/env node
const ethers = require('ethers');
require('dotenv').config();
const path = require('path');
const fs = require('fs');

const INCIDENT_MANAGER_ADDRESS = process.env.INCIDENT_MANAGER_ADDRESS;
const MONITOR_ADDRESS = process.env.MONITOR_ADDRESS;
const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const STATE_FILE = path.join(__dirname, '..', 'data', 'dispatcher-state.json');

const IncidentManagerAbi = [
    "event IncidentRaised(uint256 indexed incidentId, uint256 indexed chainId, uint8 indexed failureType, uint8 severity, uint8 priority, string description, uint256 timestamp)",
    "event IncidentResolved(uint256 indexed incidentId, uint256 indexed chainId, string reason, uint256 timestamp, uint256 resolvedAt)",
    "event CascadingFailureDetected(uint256 activeIncidents, uint256 timestamp)"
];

const MonitorAbi = [
    "event IncidentAutoResolved(uint256 indexed chainId, uint256 indexed incidentId)"
];

class AlertDispatcher {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(RPC_URL);
        this.incidentManager = new ethers.Contract(INCIDENT_MANAGER_ADDRESS, IncidentManagerAbi, this.provider);
        this.monitor = new ethers.Contract(MONITOR_ADDRESS, MonitorAbi, this.provider);

        this.sseNotifyUrl = 'http://localhost:3000/api/alerts/notify';

        // Load persistent state
        this.state = { lastBlock: 0, processedEvents: [] };
        if (fs.existsSync(STATE_FILE)) {
            try {
                this.state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            } catch (e) {
                console.error("Error loading state file, resetting...", e.message);
            }
        }
    }

    saveState(blockNumber, eventId = null) {
        this.state.lastBlock = blockNumber;
        if (eventId) {
            this.state.processedEvents.push(eventId);
            // Keep cache small (last 100 events)
            if (this.state.processedEvents.length > 100) {
                this.state.processedEvents.shift();
            }
        }

        const dataDir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    }

    async reSync() {
        const currentBlock = await this.provider.getBlockNumber();
        const startBlock = this.state.lastBlock > 0 ? this.state.lastBlock + 1 : currentBlock - 1000;

        if (startBlock > currentBlock) {
            console.log(`📡 State is ahead of network (Last: ${this.state.lastBlock}, Current: ${currentBlock}). Skipping catch-up.`);
            return;
        }

        console.log(`\n🔄 RE-SYNC: Catching up from block ${startBlock} to ${currentBlock}...`);

        // Incident Manager Events
        const imEvents = await this.incidentManager.queryFilter("*", startBlock, currentBlock);
        for (const event of imEvents) {
            const id = `${event.transactionHash}-${event.index}`;
            if (this.state.processedEvents.includes(id)) continue;

            if (event.fragment.name === "IncidentRaised") {
                const [idVal, chainId, fType, sev, prio, desc, ts] = event.args;
                await this.dispatch('INCIDENT_RAISED (RE-SYNC)', {
                    id: idVal.toString(),
                    chainId: chainId.toString(),
                    failureType: fType,
                    severity: sev,
                    priority: prio,
                    description: desc,
                    timestamp: Number(ts)
                });
            } else if (event.fragment.name === "IncidentResolved") {
                const [idVal, chainId, reason, ts, resAt] = event.args;
                await this.dispatch('INCIDENT_RESOLVED (RE-SYNC)', {
                    id: idVal.toString(),
                    chainId: chainId.toString(),
                    reason,
                    timestamp: Number(ts),
                    resolvedAt: Number(resAt)
                });
            } else if (event.fragment.name === "CascadingFailureDetected") {
                const [count, ts] = event.args;
                await this.dispatch('CASCADING_FAILURE (RE-SYNC)', {
                    activeIncidents: count.toString(),
                    timestamp: Number(ts),
                    description: "SYSTEM-WIDE CASCADING FAILURE DETECTED"
                });
            }
            this.saveState(event.blockNumber, id);
        }

        // Monitor Events
        const mEvents = await this.monitor.queryFilter("*", startBlock, currentBlock);
        for (const event of mEvents) {
            const id = `${event.transactionHash}-${event.index}`;
            if (this.state.processedEvents.includes(id)) continue;

            if (event.fragment.name === "IncidentAutoResolved") {
                const [chainId, idVal] = event.args;
                await this.dispatch('AUTO_RESOLVED (RE-SYNC)', {
                    id: idVal.toString(),
                    chainId: chainId.toString(),
                    description: "Recovered via health signals"
                });
            }
            this.saveState(event.blockNumber, id);
        }

        console.log(`✅ RE-SYNC Complete. Last processed block: ${currentBlock}\n`);
        this.saveState(currentBlock);
    }

    async dispatch(type, payload) {
        console.log(`\n🔔 ALERT DISPATCH [${type}]`);
        console.log(JSON.stringify(payload, null, 2));

        // 1. Send to Local SSE Bridge (for frontend real-time updates)
        try {
            await fetch(this.sseNotifyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, payload })
            });
        } catch (e) {
            console.warn(`[SSE] Failed to notify local bridge: ${e.message}`);
        }

        // 2. Mock Email/SMS (Console)
        if (payload.priority <= 1) {
            console.log(`[SMS/PAGER] CRITICAL ALERT: ${payload.description || 'Incident detected'}`);
        }

        // 3. Telegram (if configured)
        if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
            console.log('[TG] Dispatching to Telegram...');
            // Implementation placeholder
        }

        // 4. Discord (if configured)
        if (process.env.DISCORD_WEBHOOK_URL) {
            console.log('[DISCORD] Dispatching to Discord...');
            // Implementation placeholder
        }
    }

    async listen() {
        await this.reSync();
        console.log('🔌 Alert Dispatcher connected. Listening for events...');

        this.incidentManager.on("IncidentRaised", (id, chainId, fType, sev, prio, desc, ts, event) => {
            const eventId = `${event.log.transactionHash}-${event.log.index}`;
            if (this.state.processedEvents.includes(eventId)) return;

            this.dispatch('INCIDENT_RAISED', {
                id: id.toString(),
                chainId: chainId.toString(),
                failureType: fType,
                severity: sev,
                priority: prio,
                description: desc,
                timestamp: Number(ts)
            });
            this.saveState(event.log.blockNumber, eventId);
        });

        this.incidentManager.on("IncidentResolved", (id, chainId, reason, ts, resAt, event) => {
            const eventId = `${event.log.transactionHash}-${event.log.index}`;
            if (this.state.processedEvents.includes(eventId)) return;

            this.dispatch('INCIDENT_RESOLVED', {
                id: id.toString(),
                chainId: chainId.toString(),
                reason,
                timestamp: Number(ts),
                resolvedAt: Number(resAt)
            });
            this.saveState(event.log.blockNumber, eventId);
        });

        this.incidentManager.on("CascadingFailureDetected", (count, ts, event) => {
            const eventId = `${event.log.transactionHash}-${event.log.index}`;
            if (this.state.processedEvents.includes(eventId)) return;

            this.dispatch('CASCADING_FAILURE', {
                activeIncidents: count.toString(),
                timestamp: Number(ts),
                description: "SYSTEM-WIDE CASCADING FAILURE DETECTED"
            });
            this.saveState(event.log.blockNumber, eventId);
        });

        this.monitor.on("IncidentAutoResolved", (chainId, id, event) => {
            const eventId = `${event.log.transactionHash}-${event.log.index}`;
            if (this.state.processedEvents.includes(eventId)) return;

            this.dispatch('AUTO_RESOLVED', {
                id: id.toString(),
                chainId: chainId.toString(),
                description: "Recovered via health signals"
            });
            this.saveState(event.log.blockNumber, eventId);
        });
    }
}

const dispatcher = new AlertDispatcher();
dispatcher.listen();
