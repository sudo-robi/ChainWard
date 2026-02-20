import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { sendTransaction, INCIDENT_ABI, ORCHESTRATOR_ABI, addresses } from '../../lib/tx-helper';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'Method Not Allowed' });
  }

  const { type, priority, parentId } = req.body;

  // Severity mapping: Frontend sends 0(P0), 1(P1), 2(P2), 3(P3). 
  // Contract expects uint256 severity (0: low, 1: med, 2: critical).
  const severityScore = (priority === 0 || priority === 1) ? 2 : (priority === 2 ? 1 : 0);

  try {
    console.log(`🚀 Simulating incident: ${type} with severity ${severityScore}, parent: ${parentId || 0}`);

    const receipt = await sendTransaction(
      addresses.incidentManager,
      INCIDENT_ABI,
      'reportIncident',
      [type, severityScore, `Simulated ${type} via Dashboard`]
    );

    // Check for Orchestrator events in the logs
    let autoResponded = false;
    try {
      const iface = new ethers.Interface(ORCHESTRATOR_ABI);
      for (const log of (receipt as any).logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === 'IncidentResponseTriggered') {
            autoResponded = true;
            console.log('⚡ Autonomous Response Triggered for Incident:', parsed.args.incidentId.toString());
            break;
          }
        } catch (e) { /* skip logs from other contracts */ }
      }
    } catch (e) {
      console.warn('Failed to parse orchestrator logs:', e);
    }

    return res.status(200).json({
      status: 'Simulated ' + type,
      txHash: receipt.hash,
      autoResponded
    });
  } catch (error: any) {
    console.error('Simulation Failed:', error);
    return res.status(500).json({
      status: 'Error',
      error: error.message || 'Unknown simulation error'
    });
  }
}
