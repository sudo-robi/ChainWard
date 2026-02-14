import { NextApiRequest, NextApiResponse } from 'next';

export const config = {
    api: {
        externalResolver: true,
    },
};

let clients: NextApiResponse[] = [];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).end();
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Content-Encoding', 'none');

    clients.push(res);

    req.on('close', () => {
        clients = clients.filter(client => client !== res);
    });
}

// Global broadcast function for the notify handler
export function broadcast(data: any) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    clients.forEach(client => client.write(payload));
}
