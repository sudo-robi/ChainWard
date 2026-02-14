// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import { Test } from "../lib/forge-std/src/Test.sol";
import { ValidatorRegistry } from "../src/ValidatorRegistry.sol";
import { SignalTypes } from "../src/SignalTypes.sol";

contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (msg.sender == from) {
            require(balanceOf[from] >= amount, "insufficient");
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
            return true;
        }
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        require(balanceOf[from] >= amount, "insufficient");
        allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ValidatorRegistryFuzz is Test {
    ValidatorRegistry registry;
    MockERC20 token;

    address reporter = address(0xA);
    address challenger = address(0xB);

    function setUp() public {
        token = new MockERC20();
        registry = new ValidatorRegistry(address(0), address(0)); // Simple mode
        registry.addSupportedToken(address(token), 1 ether);
    }

    // Fuzz: register with various bonds &then raise+resolve dispute as true
    // Invariant: reporter bond increases by exactly accuracyRewardRate% when validated true
    function testFuzzAccuracyReward(uint256 bond) public {
        bond = bound(bond, 1 ether, 50 ether);
        token.mint(reporter, bond);
        token.mint(challenger, bond);

        vm.prank(reporter);
        token.approve(address(registry), bond);
        vm.prank(reporter);
        registry.registerReporter(address(token), bond);

        uint256 sig = registry.recordSignal(reporter, 1, SignalTypes.SignalType.BATCH_POSTED, "batch");

        vm.prank(challenger);
        token.approve(address(registry), bond);
        vm.prank(challenger);
        uint256 dis = registry.raiseDispute(sig);

        // resolve as valid
        registry.resolveDispute(dis, true);

        (ValidatorRegistry.Reporter memory rep) = registry.getReporter(reporter);
        uint256 expected = bond + ((bond * registry.accuracyRewardRate()) / 100);
        assertEq(rep.bondAmount, expected);
    }
}
