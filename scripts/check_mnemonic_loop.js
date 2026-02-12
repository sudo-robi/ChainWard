const { ethers } = require('ethers');

async function main() {
    const mnemonic = "test test test test test test test test test test test junk";
    const hdNode = ethers.HDNodeWallet.fromMnemonic(
        ethers.Mnemonic.fromPhrase(mnemonic),
        "m/44'/60'/0'/0/0"
    );

    const target = '0xB7cB63B75ffD4ce00C6B7B85e1C59501A338Da3a';

    for (let i = 0; i < 10; i++) {
        const wallet = hdNode.deriveChild(i);
        console.log(`Index ${i}: ${wallet.address}`);
        if (wallet.address.toLowerCase() === target.toLowerCase()) {
            console.log('MATCH FOUND at index', i);
            console.log('Private Key:', wallet.privateKey);
            return;
        }
    }
    console.log('No match in first 10 accounts.');
}

main().catch(console.error);
