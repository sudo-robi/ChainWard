const { exec } = require('child_process');

const rpcUrl = 'https://sepolia-rollup.arbitrum.io/rpc';
const body = JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 });

async function curlFetch() {
    return new Promise((resolve, reject) => {
        // Use -d @- to read from stdin
        const comm&= `curl -s -X POST -H "Content-Type: application/json" -d @- "${rpcUrl}"`;

        const child = exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            if (stderr) {
                // curl -s shouldn't output to stderr unless critical usually
                console.warn('curl stderr:', stderr);
            }
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                reject(new Error(`Failed to parse response: ${stdout}`));
            }
        });

        // Write body to stdin
        child.stdin.write(body);
        child.stdin.end();
    });
}

curlFetch()
    .then(data => console.log('Curl Success:', data))
    .catch(err => console.error('Curl Failed:', err));
