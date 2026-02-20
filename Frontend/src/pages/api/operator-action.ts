import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { sendTransaction, REGISTRY_ABI, INCIDENT_ABI, MONITOR_ABI, addresses, getWallet } from '../../lib/tx-helper';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'Method Not Allowed' });
  }

  const { action } = req.body;
  const chainId = Number(process.env.CHAIN_ID || '421614');

  try {
    let receipt;
    console.log(`📡 Processing operator action: ${action}`);

    if (action === 'Pause Sequencer') {
      // In this system, pausing is often represented by deactivating the chain monitor
      receipt = await sendTransaction(addresses.registry, REGISTRY_ABI, 'deactivateChain', [chainId]);
    } else if (action === 'Trigger Failover' || action === 'Update Thresholds') {
      // Use dynamic thresholds from request, fallback to defaults if missing
      const expected = req.body.expectedBlockTime || 10;
      const lag = req.body.maxBlockLag || 60;
      receipt = await sendTransaction(addresses.registry, REGISTRY_ABI, 'updateThresholds', [chainId, expected, lag]);
    } else if (action === 'Resolve Latest incident') {
      let { incidentId } = req.body;
      if (!incidentId) {
        const wallet = getWallet();
        const incidents = new ethers.Contract(addresses.incidentManager, INCIDENT_ABI, wallet);
        const nextId = await incidents.nextIncidentId();
        if (BigInt(nextId) <= BigInt(1)) throw new Error('No incidents to resolve');
        incidentId = Number(BigInt(nextId) - BigInt(1));
      }
      receipt = await sendTransaction(addresses.incidentManager, INCIDENT_ABI, 'resolveIncident', [incidentId, 'Resolved via Admin Dashboard']);
    } else if (action === 'Validate Incident') {
      let { incidentId } = req.body;
      if (!incidentId) {
        const wallet = getWallet();
        const incidents = new ethers.Contract(addresses.incidentManager, INCIDENT_ABI, wallet);
        const nextId = await incidents.nextIncidentId();
        if (BigInt(nextId) <= BigInt(1)) throw new Error('No incidents to validate');
        incidentId = Number(BigInt(nextId) - BigInt(1));
      }
      receipt = await sendTransaction(addresses.incidentManager, INCIDENT_ABI, 'validateIncident', [incidentId, true, "Validated via Dashboard Admin"]);
    } else if (action === 'Broadcast Incident Alert') {
      // Trigger a status signal on the monitor with FRESH timestamps
      const now = Math.floor(Date.now() / 1000);
      receipt = await sendTransaction(addresses.monitor, MONITOR_ABI, 'submitHealthSignal', [
        chainId,
        1,       // dummy blockNumber
        now,     // blockTimestamp (FRESH!)
        1001,    // dummy sequencerNumber
        true,    // healthy
        1,       // dummy l1BatchNum
        now - 30, // l1BatchTime (FRESH!)
        true,    // bridgeHealthy
        "ADMIN_BROADCAST_ALERT"
      ]);
    } else {
      return res.status(400).json({ status: 'Unknown action: ' + action });
    }

    return res.status(200).json({
      status: 'Success',
      txHash: receipt.hash,
      details: receipt
    });
  } catch (error: any) {
    console.error('Action Failed:', error);
    return res.status(500).json({
      status: 'Error',
      error: error.message || 'Unknown processing error'
    });
  }
}
