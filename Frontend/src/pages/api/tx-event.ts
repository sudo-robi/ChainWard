import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { action, txHash, status, blockNumber, from, to, timestamp } = req.body;
  // Log or process the event as needed
  // For demo: just print to console &return success
  if (process.env.NODE_ENV === 'development') {
    console.log('TX EVENT:', { action, txHash, status, blockNumber, from, to, timestamp });
  }
  // Optionally, save to database or trigger backend scripts here
  return res.status(200).json({ ok: true });
}
