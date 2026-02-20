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
    } else if (action === 'Trigger Failover') {
      // Custom system thresholds update as a "failover" signal
      receipt = await sendTransaction(addresses.registry, REGISTRY_ABI, 'updateThresholds', [chainId, 10, 60]);
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
    } else if (action === 'Broadcast Incident Alert') {
      // Trigger a status signal on the monitor
      receipt = await sendTransaction(addresses.monitor, MONITOR_ABI, 'submitHealthSignal', [
        chainId,
        0, 0, 0, true, 0, 0, true, "ADMIN_BROADCAST_ALERT"
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
