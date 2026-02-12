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

contract ValidatorRegistryFalseTest is Test {
    ValidatorRegistry registry;
    MockERC20 token;

    address reporter = address(0x1111);
    address challenger = address(0x2222);

    function setUp() public {
        token = new MockERC20();
        registry = new ValidatorRegistry(address(0), address(0)); // Simple mode
        registry.addSupportedToken(address(token), 1 ether);
    }

    function testFalseResolutionReducesReporterBond(uint256 bond) public {
        // fuzzed bond - constrain
        bond = bound(bond, 1 ether, 10 ether);

        // mint balances
        token.mint(reporter, bond);
        token.mint(challenger, bond);

        // reporter approves and registers
        vm.prank(reporter);
        token.approve(address(registry), bond);
        vm.prank(reporter);
        registry.registerReporter(address(token), bond);

        // record a signal
        uint256 sigId = registry.recordSignal(reporter, 1, SignalTypes.SignalType.FRAUD_PROOF_SUBMITTED, "fraud?");

        // challenger approves and raises dispute
        vm.prank(challenger);
        token.approve(address(registry), bond);
        vm.prank(challenger);
        uint256 disId = registry.raiseDispute(sigId);

        // resolve as FALSE (reporter was wrong)
        registry.resolveDispute(disId, false);

        // reporter bond decreased by slashRate %
        (ValidatorRegistry.Reporter memory rep) = registry.getReporter(reporter);
        uint256 expectedSlashed = (bond * registry.slashRate()) / 100;
        assertEq(rep.bondAmount, bond - expectedSlashed);
    }
}
