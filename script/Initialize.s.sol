// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script } from "forge-std/Script.sol";
import { OrbitChainRegistry } from "src/registries/OrbitChainRegistry.sol";

contract Initialize is Script {
    function run() external {
        // Arbitrum Sepolia deployment addresses
        address registryAddr = 0xf8f7EE86662e6eC391033EFcF4221057F723f9B1;
        
        // Chain configuration for Arbitrum Sepolia (Chain ID: 421614)
        uint256 chainId = 421614;
        address operator = vm.envAddress("OPERATOR_ADDRESS");
        uint256 expectedBlockTime = 250; // milliseconds (0.25 seconds)
        uint256 maxBlockLag = 60; // 60 blocks = ~15 seconds
        string memory chainName = "Arbitrum Sepolia";
        
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        OrbitChainRegistry registry = OrbitChainRegistry(registryAddr);
        
        registry.registerChain(
            chainId,
            operator,
            expectedBlockTime,
            maxBlockLag,
            chainName
        );

        vm.stopBroadcast();
    }
}
