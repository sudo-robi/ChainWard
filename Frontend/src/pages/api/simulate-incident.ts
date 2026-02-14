import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'Method Not Allowed' });
  }

  const { type, priority, parentId } = req.body;
  let cmd = '';
  const extraArgs = `${priority !== undefined ? ` --priority ${priority}` : ''}${parentId ? ` --parent ${parentId}` : ''}`;

  if (type === 'BLOCK_LAG') {
    cmd = `node ../scripts/auto_report.js --simulate block_lag${extraArgs}`;
  } else if (type === 'SEQUENCER_STALL') {
    cmd = `node ../scripts/auto_report.js --simulate sequencer_stall${extraArgs}`;
  } else if (type === 'STATE_ROOT_CHANGED') {
    cmd = `node ../scripts/auto_report.js --simulate state_root_changed${extraArgs}`;
  }
  if (!cmd) {
    return res.status(400).json({ status: 'Unknown incident type' });
  }
  // Wrap exec in a promise to prevent "API resolved without sending a response"
  await new Promise<void>((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        const msg = stderr || stdout || error.message;
        const cleanMsg = msg.replace(/Error: /g, '').split('\n')[0];
        res.status(500).json({ status: 'Error', error: cleanMsg });
      } else {
        res.status(200).json({ status: 'Simulated ' + type, output: stdout || stderr });
      }
      resolve();
    });
  });
}
