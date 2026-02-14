import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';

// --- Simple In-Memory Cache ---
// Cache responses for 10 seconds to reduce load on RPC provider
const rpcCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

function getCacheKey(body: any): string {
    return JSON.stringify(body);
}

// --- Request Throttling (Semaphore) ---
// Limit concurrent outbound requests to avoid burst rate limits
let activeRequests = 0;
const MAX_CONCURRENT = 3;

async function acquireSlot() {
    while (activeRequests >= MAX_CONCURRENT) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    activeRequests++;
}

function releaseSlot() {
    activeRequests--;
}

async function fetchWithCurl(url: string, options: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const command = 'curl';
        const args = [
            '-s',
            '-X', options.method || 'GET',
            '-H', 'Content-Type: application/json',
            '-d', '@-', // Read body from stdin
            '--connect-timeout', '20',
            '--max-time', '60',
            url
        ];

        const child = spawn(command, args);
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            if (code !== 0) {
                const errOutput = stderr || stdout || 'No stderr output';
                reject(new Error(`Curl process exited with code ${code}: ${errOutput}`));
                return;
            }
            try {
                const trimmed = stdout.trim();
                if (!trimmed) {
                    reject(new Error('Empty response from curl'));
                    return;
                }
                const json = JSON.parse(trimmed);
                resolve({
                    ok: true,
                    status: 200,
                    json: async () => json
                });
            } catch (e) {
                reject(new Error(`Failed to parse curl response: ${stdout.substring(0, 100)}... Error: ${e}`));
            }
        });

        child.on('error', (err) => {
            reject(new Error(`Failed to spawn curl: ${err.message}`));
        });

        if (options.body) {
            child.stdin.write(options.body);
            child.stdin.end();
        }
    });
}


export async function POST(request: NextRequest) {
    const requestId = Math.random().toString(36).substring(7);
    let body: any = null;
    let cacheKey = '';
    try {
        body = await request.json();
        const rpcUrlRaw = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
        const rpcUrl = rpcUrlRaw.trim();
        if (!rpcUrl || !rpcUrl.startsWith('http')) {
            return NextResponse.json(
                { error: 'RPC request failed', details: 'Invalid RPC URL configuration' },
                { status: 500 }
            );
        }
        if (process.env.NODE_ENV === 'development') {
            console.log(`[RPC Proxy Debug] Using rpcUrl: ${rpcUrl}`);
        }

        // 1. Better Cache Key andLogic
        cacheKey = getCacheKey(body);
        const cached = rpcCache.get(cacheKey);

        // Use longer TTL for static calls like getCode or constant view functions
        const isStaticCall = Array.isArray(body)
            ? body.every(b => b.method === 'eth_call' || b.method === 'eth_getCode')
            : (body.method === 'eth_call' || body.method === 'eth_getCode');

        const currentTTL = isStaticCall ? 60000 : CACHE_TTL; // 1 minute for static calls

        if (cached && (Date.now() - cached.timestamp < currentTTL)) {
            return NextResponse.json(cached.data);
        }

        // Retry logic parameters
        const MAX_RETRIES = 5; // Increased retries
        const INITIAL_BACKOFF = 1000; // Increased initial backoff
        const MAX_BACKOFF = 15000; // Increased max backoff

        let lastError: any;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                await acquireSlot();

                try {
                    const response = await fetchWithCurl(rpcUrl, {
                        method: 'POST',
                        body: JSON.stringify(body),
                    });

                    const data = await response.json();

                    // Check for rate limits in any part of the response (batch or single)
                    const hasRateLimit = (item: any) => {
                        const error = item?.error;
                        if (!error) return false;
                        const code = error.code;
                        const message = error.message;
                        return code === 429 || String(code) === "429" ||
                            (typeof message === 'string' && message.toLowerCase().includes('too many requests'));
                    };

                    let isRateLimited = false;
                    if (Array.isArray(data)) {
                        isRateLimited = data.some(hasRateLimit);
                    } else {
                        isRateLimited = hasRateLimit(data);
                    }

                    if (isRateLimited) {
                        const waitTime = Math.min(INITIAL_BACKOFF * Math.pow(2, attempt) + (Math.random() * 1000), MAX_BACKOFF);
                        // Reduce log spam - only log rate limits in development mode &every 50th occurrence (not the first)
                        if (process.env.NODE_ENV === 'development' && attempt % 50 === 0 && attempt > 0) {
                            console.warn(`[RPC Proxy ${requestId}] RATE LIMITED (429). Attempt ${attempt + 1}. Waiting ${Math.round(waitTime)}ms...`);
                        }

                        if (attempt < MAX_RETRIES - 1) {
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                            continue;
                        }
                        throw new Error('Rate limited (429) - Global limit reached');
                    }

                    // Success! Cache &return
                    rpcCache.set(cacheKey, { data, timestamp: Date.now() });
                    return NextResponse.json(data);

                } finally {
                    releaseSlot();
                }

            } catch (fetchError: any) {
                lastError = fetchError;
                const isRetryable = fetchError.message.includes('code 6') || // curl couldn't resolve host
                    fetchError.message.includes('code 7') || // curl couldn't connect
                    fetchError.message.includes('timeout') ||
                    fetchError.message.includes('rate limited');

                if (isRetryable && attempt < MAX_RETRIES - 1) {
                    const backoff = Math.min(INITIAL_BACKOFF * Math.pow(2, attempt) + (Math.random() * 500), MAX_BACKOFF);
                    // Reduce log spam - only log every 5th retry in development mode (not the first)
                    if (process.env.NODE_ENV === 'development' && attempt % 5 === 0 && attempt > 0) {
                        console.warn(`[RPC Proxy ${requestId}] Retryable error on attempt ${attempt + 1}: ${fetchError.message}. Backing off ${Math.round(backoff)}ms...`);
                    }
                    await new Promise(resolve => setTimeout(resolve, backoff));
                } else {
                    throw fetchError;
                }
            }
        }

        throw lastError;

    } catch (error: any) {
        // If we get rate limited, try to serve stale cache data instead of failing
        if (error.message?.includes('Rate limited')) {
            const cacheKey = getCacheKey(body);
            const staleCache = rpcCache.get(cacheKey);
            
            if (staleCache) {
                console.warn(`[RPC Proxy ${requestId}] Serving stale cache due to rate limit`);
                return NextResponse.json(staleCache.data);
            }
            
            // If no cache available, return error but with proper status
            return NextResponse.json(
                { error: 'RPC rate limited', details: 'Too many requests to provider' },
                { status: 429 }
            );
        }
        
        // Log all errors with context for debugging
        let bodyText = '';
        try {
            bodyText = await request.text();
        } catch { }
        console.error(`\n[RPC Proxy ${requestId}] Terminal failure:`, {
            error: error?.message,
            stack: error?.stack,
            requestBody: bodyText || '[unavailable]'
        });
        return NextResponse.json(
            { error: 'RPC request failed', details: error.message },
            { status: 500 }
        );
    }
}
