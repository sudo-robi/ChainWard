#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { ethers } = require('ethers');
const { spawn } = require('child_process');

async function rpcCall(method, params = [], attempt = 0) {
    const MAX_RETRIES = 5;
    const INITIAL_BACKOFF = 1000;

    return new Promise((resolve, reject) => {
        const rpcUrl = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
        const body = JSON.stringify({
            jsonrpc: '2.0',
            method: method,
            params: params,
            id: Date.now()
        });

        const child = spawn('curl', ['-s', '-X', 'POST', '-H', 'Content-Type: application/json', '-d', '@-', rpcUrl]);
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => stdout += data.toString());
        child.stderr.on('data', (data) => stderr += data.toString());

        child.on('close', async (code) => {
            if (code !== 0) {
                if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, INITIAL_BACKOFF * Math.pow(2, attempt)));
                    return resolve(rpcCall(method, params, attempt + 1));
                }
                return reject(new Error(`Curl error: ${stderr}`));
            }
            try {
                const json = JSON.parse(stdout.trim());
                if (json.error) {
                    if ((json.error.code === 429 || json.error.message?.includes('Too Many Requests')) && attempt < MAX_RETRIES) {
                        await new Promise(r => setTimeout(r, INITIAL_BACKOFF * Math.pow(2, attempt)));
                        return resolve(rpcCall(method, params, attempt + 1));
                    }
                    return reject(new Error(JSON.stringify(json.error)));
                }
                resolve(json.result);
            } catch (e) {
                reject(new Error(`Parse error: ${e.message}`));
            }
        });

        child.stdin.write(body);
        child.stdin.end();
    });
}

async function main() {
    const PK = process.env.PRIVATE_KEY;
    const registryAddress = process.env.REGISTRY_ADDRESS;
    const chainId = process.env.CHAIN_ID || '421614';
    const newOperator = '0xEB509499bC91EcdB05dE285FB1D880dceb82688E';

    if (!PK || !registryAddress) {
        console.error('Missing env vars');
        process.exit(1);
    }

    const wallet = new ethers.Wallet(PK);
    console.log(`Current Operator/Owner: ${wallet.address}`);
    console.log(`Setting New Operator for chain ${chainId}: ${newOperator}`);

    const abi = new ethers.Interface(['function updateOperator(uint256,address)']);
    const data = abi.encodeFunctionData('updateOperator', [chainId, newOperator]);

    // 1. Nonce
    const nonceHex = await rpcCall('eth_getTransactionCount', [wallet.address, 'latest']);
    const nonce = parseInt(nonceHex, 16);

    // 2. Gas Price
    const gasPriceHex = await rpcCall('eth_gasPrice');
    const gasPrice = BigInt(gasPriceHex) * 120n / 100n;

    const tx = {
        to: registryAddress,
        data: data,
        gasLimit: 100000n,
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: gasPrice,
        nonce: nonce,
        chainId: 421614
    };

    const signedTx = await wallet.signTransaction(tx);
    console.log('Broadcasting updateOperator tx...');
    const txHash = await rpcCall('eth_sendRawTransaction', [signedTx]);
    console.log(`Transaction sent! Hash: ${txHash}`);

    console.log('Checking for confirmation...');
    let confirmed = false;
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const receipt = await rpcCall('eth_getTransactionReceipt', [txHash]);
        if (receipt) {
            if (receipt.status === '0x1') {
                console.log('Operator update confirmed!');
                confirmed = true;
            } else {
                console.error('Transaction failed!');
            }
            break;
        }
    }
}

main().catch(console.error);
