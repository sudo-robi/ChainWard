import type { NextApiRequest, NextApiResponse } from 'next';
import { sendTransaction, INCIDENT_ABI, addresses } from '../../lib/tx-helper';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'Method Not Allowed' });
  }

  const { type, priority } = req.body;

  // Severity: mapping from numeric priority to score (1: low, 2: med, 3: high)
  const severityScore = priority === 'P1 (Critical)' ? 3 : (priority === 'P2 (Warning)' ? 2 : 1);

  try {
    console.log(`🚀 Simulating incident: ${type} with severity ${severityScore}`);

    const receipt = await sendTransaction(
      addresses.incidentManager,
      INCIDENT_ABI,
      'reportIncident',
      [type, severityScore, `Simulated ${type} via Dashboard`]
    );

    return res.status(200).json({
      status: 'Simulated ' + type,
      txHash: receipt.hash
    });
  } catch (error: any) {
    console.error('Simulation Failed:', error);
    return res.status(500).json({
      status: 'Error',
      error: error.message || 'Unknown simulation error'
    });
  }
}
