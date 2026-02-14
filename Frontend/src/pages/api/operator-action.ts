import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'Method Not Allowed' });
  }

  const { action, amount } = req.body;

  let cmd = '';
  if (action === 'Pause Sequencer') {
    cmd = `node ../scripts/governance.js create-proposal "Pause Sequencer" "Incident on chain 1" 7`;
  } else if (action === 'Trigger Failover') {
    cmd = `node ../scripts/governance.js create-proposal "Trigger Failover" "Incident on chain 1" 7`;
  } else if (action === 'Send Alert') {
    cmd = `node ../scripts/cli.js show 1`;
  } else if (action === 'Update Thresholds') {
    cmd = `node ../scripts/cli.js monitor-set 1 0x0000000000000000000000000000000000000000`;
  } else if (action === 'Manage Roles') {
    cmd = `node ../scripts/set-reporter.js 0x0000000000000000000000000000000000000000`;
  }

  if (!cmd) {
    return res.status(400).json({ status: 'Unknown action' });
  }

  await new Promise<void>((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ status: 'Error', error: error.message });
      }
      res.status(200).json({ status: 'Success', output: stdout || stderr });
      resolve();
    });
  });
}
