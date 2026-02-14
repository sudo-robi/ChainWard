const rpcUrl = 'https://sepolia-rollup.arbitrum.io/rpc';

async function testFetch(url) {
    try {
        console.log(`Fetching from ${url}...`);
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        console.log(`Status for ${url}:`, response.status);
    } catch (error) {
        console.error(`Fetch failed for ${url}:`, error.message);
        if (error.cause) console.error('Cause:', error.cause);
    }
}

async function run() {
    await testFetch('https://www.google.com');
    await testFetch('http://www.google.com');
    await testFetch(rpcUrl);
}

run();
