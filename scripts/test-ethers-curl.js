const { spawn } = require('child_process');
const { ethers } = require('ethers');

// Curl wrapper
async function fetchWithCurl(url, options = {}) {
    return new Promise((resolve, reject) => {
        const comm&= 'curl';
        const args = [
            '-s',
            '-X', options.method || 'GET',
            '-H', 'Content-Type: application/json',
            '-d', '@-',
            url
        ];

        const child = spawn(command, args);
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => stdout += data.toString());
        child.stderr.on('data', (data) => stderr += data.toString());

        child.on('close', (code) => {
            if (code !== 0) return reject(new Error(`Curl error: ${stderr}`));
            try {
                const json = JSON.parse(stdout.trim());
                resolve({
                    ok: true,
                    status: 200,
                    json: async () => json,
                    headers: { get: () => 'application/json' }
                });
            } catch (e) {
                reject(new Error(`Parse error: ${stdout}`));
            }
        });

        if (options.body) {
            child.stdin.write(options.body);
            child.stdin.end();
        } else {
            child.stdin.end();
        }
    });
}

// Override global fetch
global.fetch = fetchWithCurl;

async function main() {
    console.log("Testing ethers with curl...");
    // Use a public RPC
    const provider = new ethers.JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc');
    try {
        const blockNumber = await provider.getBlockNumber();
        console.log("Block Number:", blockNumber);
    } catch (e) {
        console.error("Ethers failed:", e);
    }
}

main();
