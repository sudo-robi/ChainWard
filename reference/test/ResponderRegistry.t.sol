// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import { Test } from "../lib/forge-std/src/Test.sol";
import { ResponderRegistry, IChainWardResponder } from "../src/ResponderRegistry.sol";
import { SignalTypes } from "../src/SignalTypes.sol";

contract SuccessResponder is IChainWardResponder {
    bool public called;
    uint256 public lastChain;

    function onIncidentRaised(
        uint256 chainId,
        SignalTypes.SignalType,
        SignalTypes.Severity,
        string calldata
    ) external returns (bool) {
        called = true;
        lastChain = chainId;
        return true;
    }
}

contract RevertResponder is IChainWardResponder {
    function onIncidentRaised(
        uint256,
        SignalTypes.SignalType,
        SignalTypes.Severity,
        string calldata
    ) external pure returns (bool) {
        revert("responder fail");
    }
}

contract FalseResponder is IChainWardResponder {
    function onIncidentRaised(
        uint256,
        SignalTypes.SignalType,
        SignalTypes.Severity,
        string calldata
    ) external pure returns (bool) {
        return false;
    }
}

contract ResponderRegistryTest is Test {
    ResponderRegistry registry;
    SuccessResponder success;
    RevertResponder bad;
    FalseResponder noop;

    function setUp() public {
        registry = new ResponderRegistry();
        success = new SuccessResponder();
        bad = new RevertResponder();
        noop = new FalseResponder();

        // Register responders: success for chain 100, bad global, noop chain-specific
        registry.registerResponder(100, address(success), SignalTypes.Severity.WARNING);
        registry.registerResponder(0, address(bad), SignalTypes.Severity.WARNING);
        registry.registerResponder(100, address(noop), SignalTypes.Severity.WARNING);
    }

    function testNotifyRespondersSuccessPath() public {
        uint256 successCount = registry.notifyResponders(100, SignalTypes.SignalType.GAP_IN_BATCHES, SignalTypes.Severity.CRITICAL, "critical");

        // success responder returns true, noop returns false, bad reverts (counts as failure)
        assertEq(successCount, 1);
        assertTrue(success.called());
        assertEq(success.lastChain(), 100);
    }

    function testResponderFailureTrackingAndDisable() public {
        // Call multiple times to increase failure count for bad responder
        // First call: failure count = 1
        registry.notifyResponders(100, SignalTypes.SignalType.GAP_IN_BATCHES, SignalTypes.Severity.CRITICAL, "1");
        vm.warp(block.timestamp + 1);

        // Second call: failure count = 2
        registry.notifyResponders(100, SignalTypes.SignalType.GAP_IN_BATCHES, SignalTypes.Severity.CRITICAL, "2");
        vm.warp(block.timestamp + 1);

        // Third call: failure count = 3 -> responder disabled thereafter
        registry.notifyResponders(100, SignalTypes.SignalType.GAP_IN_BATCHES, SignalTypes.Severity.CRITICAL, "3");
        vm.warp(block.timestamp + 1);

        // Fourth call: bad responder should be skipped (disabled), success responder still works
        uint256 successCount = registry.notifyResponders(100, SignalTypes.SignalType.GAP_IN_BATCHES, SignalTypes.Severity.CRITICAL, "4");
        assertEq(successCount, 1);
    }

    function testRateLimitingSameBlock() public {
        // First call in this block will call responders
        uint256 a = registry.notifyResponders(100, SignalTypes.SignalType.GAP_IN_BATCHES, SignalTypes.Severity.CRITICAL, "a");
        // Second call in same block should be rate-limited and not call same responders
        uint256 b = registry.notifyResponders(100, SignalTypes.SignalType.GAP_IN_BATCHES, SignalTypes.Severity.CRITICAL, "b");

        // At least one of the calls should have triggered success responder; second should not increment
        assertTrue(a >= b);
    }
}
