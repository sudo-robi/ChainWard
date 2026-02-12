const { ethers } = require('ethers');

async function main() {
    const mnemonic = "test test test test test test test test test test test junk";
    const hdNode = ethers.HDNodeWallet.fromMnemonic(
        ethers.Mnemonic.fromPhrase(mnemonic),
        "m/44'/60'/0'/0/0"
    );

    console.log('Default Mnemonic Address (Index 0):', hdNode.address);

    const target = '0xB7cB63B75ffD4ce00C6B7B85e1C59501A338Da3a';
    if (hdNode.address.toLowerCase() === target.toLowerCase()) {
        console.log('MATCH!');
        console.log('Private Key:', hdNode.privateKey);
    } else {
        console.log('No match.');
    }
}

main().catch(console.error);
