// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { AutomatedRunbook } from "src/response/AutomatedRunbook.sol";
import { WorkflowExecutor } from "src/response/WorkflowExecutor.sol";
import { ResponseAction } from "src/response/ResponseAction.sol";
import { IncidentResponseOrchestrator } from "src/response/IncidentResponseOrchestrator.sol";
import { SecureIncidentManager } from "src/response/SecureIncidentManager.sol";

contract DeployAutonomousResponse is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address incidentManagerAddr = vm.envAddress("INCIDENT_MANAGER_ADDRESS");
        
        require(deployerKey != 0, "PRIVATE_KEY not set");
        require(incidentManagerAddr != address(0), "INCIDENT_MANAGER_ADDRESS not set");

        vm.startBroadcast(deployerKey);

        // 1. Deploy Runbook Manager
        AutomatedRunbook runbookManager = new AutomatedRunbook();
        console2.log("AutomatedRunbook deployed at:", address(runbookManager));

        // 2. Deploy Workflow Executor
        WorkflowExecutor workflowExecutor = new WorkflowExecutor(address(runbookManager));
        console2.log("WorkflowExecutor deployed at:", address(workflowExecutor));

        // 3. Deploy Response Action
        ResponseAction actionManager = new ResponseAction();
        console2.log("ResponseAction deployed at:", address(actionManager));

        // 4. Deploy Orchestrator
        IncidentResponseOrchestrator orchestrator = new IncidentResponseOrchestrator(
            address(runbookManager),
            address(workflowExecutor),
            address(actionManager)
        );
        console2.log("IncidentResponseOrchestrator deployed at:", address(orchestrator));

        // 5. Setup Permissions
        // Orchestrator needs to be an executor for RunbookManager
        runbookManager.grantRole(runbookManager.EXECUTOR_ROLE(), address(orchestrator));
        
        // Orchestrator needs to be a MONITOR_ROLE for WorkflowExecutor
        workflowExecutor.grantRole(workflowExecutor.MONITOR_ROLE(), address(orchestrator));
        
        // IncidentManager needs to be authorized in Orchestrator
        orchestrator.grantRole(orchestrator.INCIDENT_MANAGER(), incidentManagerAddr);
        console2.log("Granted INCIDENT_MANAGER role to:", incidentManagerAddr);
        
        // IncidentManager needs to call Orchestrator, but Orchestrator also needs permissions in IncidentManager?
        // Actually, Orchestrator only reacts to calls from IncidentManager.

        // 6. Configure Default Runbook for BLOCK_LAG
        AutomatedRunbook.RunbookAction[] memory actions = new AutomatedRunbook.RunbookAction[](1);
        actions[0] = AutomatedRunbook.RunbookAction({
            actionType: "alert",
            targetContract: address(orchestrator), // Using orchestrator as dummy target for now
            callData: abi.encodeWithSignature("escalateResponse(uint256,string)", 0, "AUTO_ALERT"),
            gasLimit: 100000,
            required: true
        });

        uint256 runbookId = runbookManager.createRunbook(
            "Block Lag Recovery",
            "Initial automated response for block production delays",
            "BlockLag",
            actions
        );
        console2.log("Created Runbook:", runbookId);

        // 7. Configure Workflow Trigger
        uint256[] memory runbookIds = new uint256[](1);
        runbookIds[0] = runbookId;
        workflowExecutor.configureTrigger(
            "BlockLag",
            runbookIds,
            WorkflowExecutor.ResponsePriority.High,
            3600
        );
        console2.log("Configured Workflow Trigger for BlockLag");

        // 8. Configure Orchestrator Policy
        uint256[] memory emptyActionIds = new uint256[](0);
        orchestrator.configureResponsePolicy(
            "BlockLag",
            true, // autoRespond
            300,  // maxResponseTime (5 min)
            runbookIds,
            emptyActionIds,
            2 // escalationThreshold
        );
        console2.log("Configured Orchestrator Policy for BlockLag");

        // 9. Link Orchestrator in IncidentManager
        SecureIncidentManager(incidentManagerAddr).setOrchestrator(address(orchestrator));
        console2.log("Linked Orchestrator in IncidentManager");

        vm.stopBroadcast();
    }
}
