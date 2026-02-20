// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { OrbitChainRegistry } from "../src/registries/OrbitChainRegistry.sol";

contract DeployRegistryV2 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        OrbitChainRegistry registry = new OrbitChainRegistry();
        
        vm.stopBroadcast();
        
        console2.log("OrbitChainRegistry V2 deployed at:", address(registry));
    }
}
