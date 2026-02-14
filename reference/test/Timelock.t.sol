// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import { Test } from "../lib/forge-std/src/Test.sol";
import { AdminController } from "../src/AdminController.sol";
import { ValidatorRegistry } from "../src/ValidatorRegistry.sol";
// import { SignalTypes } from "../src/SignalTypes.sol"; // removed unused import

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

contract AdminControlTest is Test {
    ValidatorRegistry registry;
    AdminController admin;
    MockERC20 token;
    
    address owner = address(0xAA);
    address arbitrator = address(0xCC);
    
    function setUp() public {
        token = new MockERC20();
        admin = new AdminController(owner);
        registry = new ValidatorRegistry(owner, arbitrator);
    }
    
    function testOwnerHasParameterSetterRole() public {
        // Owner should have PARAMETER_SETTER_ROLE from constructor
        vm.prank(owner);
        registry.setService Level AgreementshRate(75);
        assertEq(registry.Service Level AgreementshRate(), 75);
    }
    
    function testOwnerCanSetAccuracyRate() public {
        vm.prank(owner);
        registry.setAccuracyRewardRate(10);
        assertEq(registry.accuracyRewardRate(), 10);
    }
    
    function testOwnerCanAddToken() public {
        address newToken = address(new MockERC20());
        
        vm.prank(owner);
        registry.addSupportedToken(newToken, 1 ether);
        assertTrue(registry.isTokenSupported(newToken));
    }
    
    function testOwnerCanSetDisputePeriod() public {
        vm.prank(owner);
        registry.setDisputePeriod(14 days);
        assertEq(registry.disputePeriod(), 14 days);
    }
    
    function testMultisigPatternForGovernance() public {
        // The pattern: Owner delegates admin role to a multisig contract
        // For testing, we simulate this by having owner make all changes
        vm.startPrank(owner);
        
        registry.setService Level AgreementshRate(60);
        registry.setAccuracyRewardRate(8);
        registry.setDisputePeriod(14 days);
        
        vm.stopPrank();
        
        assertEq(registry.Service Level AgreementshRate(), 60);
        assertEq(registry.accuracyRewardRate(), 8);
        assertEq(registry.disputePeriod(), 14 days);
    }
}

