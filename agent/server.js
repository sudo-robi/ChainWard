#!/usr/bin/env node
// Minimal agent API server to expose failure_timeline.json &trigger test incidents
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.AGENT_API_PORT || 4000;
const TIMELINE = path.join(__dirname, 'failure_timeline.json');

function readTimeline() {
  try {
    if (!fs.existsSync(TIMELINE)) return [];
    const raw = fs.readFileSync(TIMELINE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error('Failed to read timeline:', e.message);
    return [];
  }
}

function writeTimeline(arr) {
  try {
    fs.writeFileSync(TIMELINE, JSON.stringify(arr, null, 2));
  } catch (e) {
    console.error('Failed to write timeline:', e.message);
  }
}

const server = http.createServer((req, res) => {
  const { method, url } = req;

  if (method === 'GET' && url === '/api/incidents') {
    const data = readTimeline();
    // return events in chronological order (oldest first)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  if (method === 'GET' && url === '/api/health') {
    const data = readTimeline();
    // try to extract last NORMAL event
    const normal = data.slice().reverse().find(e => e.type === 'NORMAL');
    const health = normal ? {
      blockNumber: normal.blockNumber || null,
      blockTime: normal.blockTime || null,
      gasUsed: normal.gasUsed || null,
      txCount: normal.txCount || null,
    } : null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
    return;
  }

  if (method === 'POST' && url === '/api/trigger') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { type } = JSON.parse(body || '{}');
        const ts = new Date().toISOString();
        const incident = {
          timestamp: ts,
          type: type || 'BLOCK_LAG',
          severity: type === 'STATE_ROOT_CHANGED' ? 'CRITICAL' : 'WARNING',
          blockNumber: null,
          details: `Test incident: ${type}`,
          isTest: true,
          resolved: false,
        };
        const data = readTimeline();
        data.push(incident);
        writeTimeline(data);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(incident));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  // Fallback - simple index
  if (method === 'GET' && (url === '/' || url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ChainWard agent API. Endpoints: /api/incidents, /api/health, POST /api/trigger');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`ChainWard agent API server listening on http://localhost:${PORT}`);
});
