// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { OrbitChainRegistry } from "../src/registries/OrbitChainRegistry.sol";

/**
 * @title ActivateChain
 * @dev Script to activate a chain in OrbitChainRegistry.
 * Run with: forge script script/ActivateChain.s.sol --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY
 */
contract ActivateChain is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address registryAddr = vm.envAddress("REGISTRY_ADDRESS");
        uint256 chainId = vm.envUint("CHAIN_ID");
        
        // These should match your desired config
        address operator = 0xB7cB63B75ffD4ce00C6B7B85e1C59501A338Da3a;
        uint256 expectedBlockTime = 200; // ms
        uint256 maxBlockLag = 60; // blocks
        string memory chainName = "Arbitrum Sepolia";

        vm.startBroadcast(deployerKey);

        OrbitChainRegistry registry = OrbitChainRegistry(registryAddr);
        
        console2.log("Activating chain:", chainId);
        console2.log("Registry:", registryAddr);

        // registerChain will succeed if isActive is currently false
        registry.registerChain(
            chainId,
            operator,
            expectedBlockTime,
            maxBlockLag,
            chainName
        );

        vm.stopBroadcast();
        
        console2.log("Chain successfully activated!");
    }
}
