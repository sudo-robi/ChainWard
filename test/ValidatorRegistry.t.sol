// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/ValidatorRegistry.sol";
import { SignalTypes } from "../src/SignalTypes.sol";

contract MockERC20 {
    string public name = "Mock";
    string public symbol = "MCK";
    uint8 public decimals = 18;

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
        // allow direct transfer when caller == from (convenience for contracts)
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

contract ValidatorRegistryTest is Test {
    ValidatorRegistry registry;
    MockERC20 token;

    address owner;
    address reporter = address(0xBEEF);
    address challenger = address(0xCAFE);

    function setUp() public {
        owner = address(this);
        token = new MockERC20();
        registry = new ValidatorRegistry();

        // Add token as supported with min bond = 1 ether
        registry.addSupportedToken(address(token), 1 ether);
    }

    function testRegisterReportAndDisputeResolveValid() public {
        // Give reporter and challenger tokens
        token.mint(reporter, 10 ether);
        token.mint(challenger, 10 ether);

        // reporter approve registry to pull bond
        vm.prank(reporter);
        token.approve(address(registry), 2 ether);

        // register reporter with 2 ether bond
        vm.prank(reporter);
        registry.registerReporter(address(token), 2 ether);

        // verify reporter info
        (ValidatorRegistry.Reporter memory rep) = registry.getReporter(reporter);
        assertEq(rep.bondAmount, 2 ether);
        assertTrue(rep.isActive);

        // Record a signal (any caller can call recordSignal for an active reporter)
        uint256 sigId = registry.recordSignal(reporter, 42161, SignalTypes.SignalType.BATCH_POSTED, "test batch");

        (ValidatorRegistry.SignalRecord memory sig) = registry.getSignal(sigId);
        assertEq(sig.chainId, 42161);
        assertEq(sig.reporter, reporter);
        assertFalse(sig.isDisputed);

        // challenger approve registry to post matching bond
        vm.prank(challenger);
        token.approve(address(registry), 2 ether);

        // raise dispute
        vm.prank(challenger);
        uint256 disId = registry.raiseDispute(sigId);

        (ValidatorRegistry.Dispute memory dis) = registry.getDispute(disId);
        assertEq(dis.signalId, sigId);
        assertEq(dis.challenger, challenger);

        // resolve dispute as VALID (reporter was correct) by arbitrator (owner)
        // default arbitrator is deployer (this)
        registry.resolveDispute(disId, true);

        // After resolution, reporter bond increased by accuracy reward (5%)
        (ValidatorRegistry.Reporter memory rep2) = registry.getReporter(reporter);
        uint256 expectedReward = (2 ether * registry.accuracyRewardRate()) / 100;
        assertEq(rep2.bondAmount, 2 ether + expectedReward);
    }
}
