// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import { Test } from "../lib/forge-std/src/Test.sol";
import { ChainTypeRegistry, IChainValidator } from "../src/ChainTypeRegistry.sol";
import { SignalTypes } from "../src/SignalTypes.sol";

contract MockValidator is IChainValidator {
    bool public willValidate;
    string public nameStr;

    constructor(bool _willValidate, string memory _name) {
        willValidate = _willValidate;
        nameStr = _name;
    }

    function validateSignal(uint256, SignalTypes.SignalType, bytes calldata) external view override returns (bool isValid, string memory reason) {
        if (willValidate) return (true, "");
        return (false, "mock invalid");
    }

    function getDefaultThreshold(SignalTypes.SignalType) external pure override returns (uint256) {
        return 42;
    }

    function chainType() external view override returns (string memory) {
        return nameStr;
    }
}

contract ChainTypeRegistryTest is Test {
    ChainTypeRegistry registry;
    MockValidator valGood;
    MockValidator valBad;

    function setUp() public {
        registry = new ChainTypeRegistry();
        valGood = new MockValidator(true, "GOOD");
        valBad = new MockValidator(false, "BAD");

        // set implementation for ARBITRUM_ORBIT type
        registry.setValidatorImplementation(ChainTypeRegistry.ChainType.ARBITRUM_ORBIT, address(valGood));

        // register chain 100 with default validator for ARBITRUM_ORBIT
        registry.registerChainType(100, ChainTypeRegistry.ChainType.ARBITRUM_ORBIT, address(0), 2, 10, 600, 3600);
    }

    function testValidateSignalPasses() public {
        (bool ok, string memory reason) = registry.validateSignal(100, SignalTypes.SignalType.BLOCK_PRODUCED, abi.encode(uint256(1), uint256(2)));
        assertTrue(ok);
    }

    function testGetThresholdAndType() public {
        uint256 t = registry.getSignalThreshold(100, SignalTypes.SignalType.BLOCK_PRODUCED);
        assertEq(t, 42);

        string memory ct = registry.getChainType(100);
        assertEq(ct, "GOOD");
    }

    function testUpdateValidator() public {
        // update to a validator that returns false
        registry.updateChainValidator(100, address(valBad));
        (bool ok, ) = registry.validateSignal(100, SignalTypes.SignalType.BLOCK_PRODUCED, abi.encode(uint256(1), uint256(2)));
        assertFalse(ok);
    }
}
