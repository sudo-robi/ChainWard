import { NextApiRequest, NextApiResponse } from 'next';
import { broadcast } from './stream';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).end();
    }

    const { type, payload } = req.body;

    if (!type || !payload) {
        return res.status(400).json({ error: 'Missing type or payload' });
    }

    broadcast({ type, payload });

    res.status(200).json({ success: true });
}
