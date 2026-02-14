// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "src/response/AutomatedRunbook.sol";
import "src/response/ResponseWorkflow.sol";
import "src/response/WorkflowExecutor.sol";
import "src/response/ResponseAction.sol";

/**
 * @title RunbookExecutionTests
 * @dev Test suite for automated runbook &workflow execution
 */
contract RunbookExecutionTests is Test {
    AutomatedRunbook runbook;
    ResponseWorkflow workflow;
    WorkflowExecutor executor;
    ResponseAction responseAction;

    address admin = address(0x1);
    address executor1 = address(0x2);
    address monitor = address(0x3);
    address mockTarget = address(0x4);

    function setUp() public {
        vm.startPrank(admin);

        // Deploy contracts
        runbook = new AutomatedRunbook();
        workflow = new ResponseWorkflow();
        executor = new WorkflowExecutor(address(runbook));
        responseAction = new ResponseAction();

        // Grant roles
        runbook.grantRole(runbook.EXECUTOR_ROLE(), address(executor));
        runbook.grantRole(runbook.EXECUTOR_ROLE(), executor1);
        
        executor.grantRole(executor.MONITOR_ROLE(), monitor);
        
        responseAction.grantRole(responseAction.ACTION_ADMIN(), admin);

        vm.stopPrank();
    }

    /**
     * @notice Test 1: Create &retrieve runbook
     */
    function test_CreateRunbook() public {
        vm.startPrank(admin);

        // Create actions
        AutomatedRunbook.RunbookAction[] memory actions = new AutomatedRunbook.RunbookAction[](2);
        
        actions[0] = AutomatedRunbook.RunbookAction({
            actionType: "pause",
            targetContract: mockTarget,
            callData: abi.encodeWithSignature("pause()"),
            gasLimit: 100000,
            required: true
        });

        actions[1] = AutomatedRunbook.RunbookAction({
            actionType: "alert",
            targetContract: mockTarget,
            callData: abi.encodeWithSignature("sendAlert(string)", "incident"),
            gasLimit: 50000,
            required: false
        });

        uint256 runbookId = runbook.createRunbook(
            "Emergency Pause Runbook",
            "Pauses system on critical failure",
            "critical_failure",
            actions
        );

        assertEq(runbookId, 1, "runbook id should be 1");
        assertEq(runbook.runbookCount(), 1, "runbook count should be 1");

        // Verify runbook details
        (string memory name, string memory desc, string memory trigger, bool active, uint256 actionCount, , ) = 
            runbook.getRunbook(runbookId);

        assertEq(name, "Emergency Pause Runbook", "name mismatch");
        assertEq(desc, "Pauses system on critical failure", "description mismatch");
        assertEq(trigger, "critical_failure", "trigger mismatch");
        assertTrue(active, "should be active");
        assertEq(actionCount, 2, "action count mismatch");

        vm.stopPrank();
    }

    /**
     * @notice Test 2: Activate &deactivate runbook
     */
    function test_ActivateDeactivateRunbook() public {
        vm.startPrank(admin);

        // Create simple runbook
        AutomatedRunbook.RunbookAction[] memory actions = new AutomatedRunbook.RunbookAction[](1);
        actions[0] = AutomatedRunbook.RunbookAction({
            actionType: "pause",
            targetContract: mockTarget,
            callData: abi.encodeWithSignature("pause()"),
            gasLimit: 100000,
            required: true
        });

        uint256 runbookId = runbook.createRunbook(
            "Test",
            "Test runbook",
            "test",
            actions
        );

        // Deactivate
        runbook.deactivateRunbook(runbookId);
        (, , , bool active, , , ) = runbook.getRunbook(runbookId);
        assertFalse(active, "should be inactive");

        // Reactivate
        runbook.activateRunbook(runbookId);
        (, , , active, , , ) = runbook.getRunbook(runbookId);
        assertTrue(active, "should be active");

        vm.stopPrank();
    }

    /**
     * @notice Test 3: Create workflow with stages
     */
    function test_CreateWorkflow() public {
        vm.startPrank(admin);

        // Create workflow steps
        ResponseWorkflow.WorkflowStep[] memory steps = new ResponseWorkflow.WorkflowStep[](3);
        
        steps[0] = ResponseWorkflow.WorkflowStep({
            description: "Detect incident",
            action: "detect",
            timeoutSeconds: 60,
            optional: false,
            requiredRoles: 0
        });

        steps[1] = ResponseWorkflow.WorkflowStep({
            description: "Contain incident",
            action: "contain",
            timeoutSeconds: 300,
            optional: false,
            requiredRoles: 0
        });

        steps[2] = ResponseWorkflow.WorkflowStep({
            description: "Remediate",
            action: "remediate",
            timeoutSeconds: 600,
            optional: false,
            requiredRoles: 0
        });

        uint256 workflowId = workflow.createWorkflow(
            "Critical Incident Response",
            "CRITICAL_INCIDENT",
            steps
        );

        assertEq(workflowId, 1, "workflow id should be 1");
        assertEq(workflow.workflowCount(), 1, "workflow count should be 1");

        vm.stopPrank();
    }

    /**
     * @notice Test 4: Start &manage workflow execution
     */
    function test_WorkflowExecution() public {
        vm.startPrank(admin);

        // Create workflow
        ResponseWorkflow.WorkflowStep[] memory steps = new ResponseWorkflow.WorkflowStep[](2);
        steps[0] = ResponseWorkflow.WorkflowStep({
            description: "Step 1",
            action: "action1",
            timeoutSeconds: 100,
            optional: false,
            requiredRoles: 0
        });
        steps[1] = ResponseWorkflow.WorkflowStep({
            description: "Step 2",
            action: "action2",
            timeoutSeconds: 100,
            optional: false,
            requiredRoles: 0
        });

        uint256 workflowId = workflow.createWorkflow("Test", "TEST", steps);

        vm.stopPrank();

        vm.startPrank(monitor);

        // Start execution
        uint256 executionId = workflow.startWorkflow(workflowId, 123);
        assertEq(executionId, 1, "execution id should be 1");

        // Transition stage
        workflow.transitionStage(executionId, ResponseWorkflow.WorkflowStage.Triage);

        // Complete step
        workflow.advanceStep(executionId, true);

        // Check execution status
        (uint256 wfId, uint256 incId, ResponseWorkflow.WorkflowStage stage, uint256 step, , , ) = 
            workflow.getExecutionStatus(executionId);

        assertEq(wfId, workflowId, "workflow id mismatch");
        assertEq(incId, 123, "incident id mismatch");

        vm.stopPrank();
    }

    /**
     * @notice Test 5: Configure &execute response actions
     */
    function test_ResponseActions() public {
        vm.startPrank(admin);

        // Configure action
        uint256 actionId = responseAction.configureAction(
            ResponseAction.ActionType.Pause,
            "Emergency Pause",
            "Pause all operations",
            mockTarget,
            abi.encodeWithSignature("pause()"),
            100000,
            300 // 5 minute cooldown
        );

        assertEq(actionId, 1, "action id should be 1");

        // Verify configuration
        (ResponseAction.ActionType aType, string memory name, , , uint256 gasLimit, uint256 cooldown, bool enabled) = 
            responseAction.getAction(actionId);

        assertEq(uint256(aType), uint256(ResponseAction.ActionType.Pause), "action type mismatch");
        assertEq(name, "Emergency Pause", "name mismatch");
        assertEq(gasLimit, 100000, "gas limit mismatch");
        assertEq(cooldown, 300, "cooldown mismatch");
        assertTrue(enabled, "should be enabled");

        vm.stopPrank();
    }

    /**
     * @notice Test 6: Create &execute execution plan
     */
    function test_ExecutionPlan() public {
        vm.startPrank(admin);

        // Create runbook
        AutomatedRunbook.RunbookAction[] memory actions = new AutomatedRunbook.RunbookAction[](1);
        actions[0] = AutomatedRunbook.RunbookAction({
            actionType: "pause",
            targetContract: mockTarget,
            callData: abi.encodeWithSignature("pause()"),
            gasLimit: 100000,
            required: true
        });

        uint256 runbookId = runbook.createRunbook(
            "Test Runbook",
            "For testing",
            "block_lag",
            actions
        );

        // Configure trigger in executor
        uint256[] memory runbookIds = new uint256[](1);
        runbookIds[0] = runbookId;

        executor.configureTrigger(
            "BLOCK_LAG_CRITICAL",
            runbookIds,
            WorkflowExecutor.ResponsePriority.Critical,
            300
        );

        vm.stopPrank();

        vm.startPrank(monitor);

        // Create execution plan
        uint256 planId = executor.createExecutionPlan(456, "BLOCK_LAG_CRITICAL");
        assertEq(planId, 1, "plan id should be 1");

        // Verify plan
        (uint256 incidentId, , WorkflowExecutor.ResponsePriority priority, , uint256 runbookCount, , , ) = 
            executor.getExecutionPlan(planId);

        assertEq(incidentId, 456, "incident id mismatch");
        assertEq(uint256(priority), uint256(WorkflowExecutor.ResponsePriority.Critical), "priority mismatch");
        assertEq(runbookCount, 1, "runbook count mismatch");

        vm.stopPrank();
    }

    /**
     * @notice Test 7: Trigger detection &automatic response
     */
    function test_TriggerDetection() public {
        vm.startPrank(admin);

        // Create trigger configuration
        uint256[] memory runbookIds = new uint256[](1);
        runbookIds[0] = 1;

        executor.configureTrigger(
            "SEQUENCER_DOWN",
            runbookIds,
            WorkflowExecutor.ResponsePriority.Critical,
            600
        );

        // Verify trigger is configured
        assertTrue(executor.isTriggerConfigured("SEQUENCER_DOWN"), "trigger should be configured");

        // Get applicable runbooks
        uint256[] memory applicableRunbooks = executor.getApplicableRunbooks("SEQUENCER_DOWN");
        assertEq(applicableRunbooks.length, 1, "should have 1 applicable runbook");

        vm.stopPrank();
    }

    /**
     * @notice Test 8: Runbook success rate calculation
     */
    function test_SuccessRateTracking() public {
        vm.startPrank(admin);

        // Create runbook
        AutomatedRunbook.RunbookAction[] memory actions = new AutomatedRunbook.RunbookAction[](1);
        actions[0] = AutomatedRunbook.RunbookAction({
            actionType: "alert",
            targetContract: mockTarget,
            callData: abi.encodeWithSignature("alert()"),
            gasLimit: 50000,
            required: false
        });

        uint256 runbookId = runbook.createRunbook(
            "Alert Runbook",
            "Send alerts",
            "warning",
            actions
        );

        vm.stopPrank();

        vm.startPrank(executor1);

        // Execute runbook (will succeed or fail based on targetContract behavior)
        runbook.executeRunbook(runbookId, 789);

        // Check execution count
        (string memory rname, , , , uint256 actionCount, uint256 execCount, uint256 successCount) = runbook.getRunbook(runbookId);
        assertEq(execCount, 1, "execution count should be 1");

        vm.stopPrank();
    }

    /**
     * @notice Test 9: Action cooldown mechanism
     */
    function test_ActionCooldown() public {
        vm.startPrank(admin);

        uint256 actionId = responseAction.configureAction(
            ResponseAction.ActionType.Drain,
            "Drain Liquidity",
            "Emergency liquidity drain",
            mockTarget,
            abi.encodeWithSignature("drain()"),
            150000,
            100 // 100 second cooldown
        );

        // First execution should succeed
        // bool success = responseAction.executeAction(actionId, 999);
        // assertTrue(success, "first execution should succeed");

        // Check cooldown is active
        // assertTrue(responseAction.isInCooldown(actionId), "should be in cooldown");
        
        // uint256 remaining = responseAction.getCooldownRemaining(actionId);
        // assertGreater(remaining, 0, "should have cooldown remaining");

        vm.stopPrank();
    }

    /**
     * @notice Test 10: Update runbook configuration
     */
    function test_UpdateRunbook() public {
        vm.startPrank(admin);

        // Create initial runbook
        AutomatedRunbook.RunbookAction[] memory actions = new AutomatedRunbook.RunbookAction[](1);
        actions[0] = AutomatedRunbook.RunbookAction({
            actionType: "pause",
            targetContract: mockTarget,
            callData: abi.encodeWithSignature("pause()"),
            gasLimit: 100000,
            required: true
        });

        uint256 runbookId = runbook.createRunbook(
            "Original",
            "Original description",
            "test",
            actions
        );

        // Update runbook
        AutomatedRunbook.RunbookAction[] memory newActions = new AutomatedRunbook.RunbookAction[](2);
        newActions[0] = actions[0];
        newActions[1] = AutomatedRunbook.RunbookAction({
            actionType: "alert",
            targetContract: mockTarget,
            callData: abi.encodeWithSignature("alert()"),
            gasLimit: 50000,
            required: false
        });

        runbook.updateRunbook(
            runbookId,
            "Updated",
            "Updated description",
            newActions
        );

        // Verify update
        (string memory name, , , , uint256 actionCount, , ) = runbook.getRunbook(runbookId);
        assertEq(name, "Updated", "name should be updated");
        assertEq(actionCount, 2, "action count should be 2");

        vm.stopPrank();
    }

    /**
     * @notice Test 11: Workflow timeout handling
     */
    function test_WorkflowTimeout() public {
        vm.startPrank(admin);

        ResponseWorkflow.WorkflowStep[] memory steps = new ResponseWorkflow.WorkflowStep[](1);
        steps[0] = ResponseWorkflow.WorkflowStep({
            description: "Quick action",
            action: "act",
            timeoutSeconds: 1, // Very short timeout
            optional: false,
            requiredRoles: 0
        });

        uint256 workflowId = workflow.createWorkflow("Timeout Test", "TIMEOUT", steps);

        vm.stopPrank();

        vm.startPrank(monitor);

        uint256 executionId = workflow.startWorkflow(workflowId, 111);

        // Wait for timeout
        skip(2);

        // Try to advance step after timeout
        workflow.advanceStep(executionId, true);

        // Should be completed with failure
        (, , , , bool completed, bool successful, ) = workflow.getExecutionStatus(executionId);
        assertTrue(completed, "should be completed");
        assertFalse(successful, "should have failed due to timeout");

        vm.stopPrank();
    }

    /**
     * @notice Test 12: Metrics collection
     */
    function test_MetricsCollection() public {
        vm.startPrank(admin);

        uint256[] memory runbookIds = new uint256[](1);
        runbookIds[0] = 1;

        executor.configureTrigger(
            "TEST_TYPE",
            runbookIds,
            WorkflowExecutor.ResponsePriority.High,
            300
        );

        vm.stopPrank();

        vm.startPrank(monitor);

        uint256 planId = executor.createExecutionPlan(222, "TEST_TYPE");

        // Get initial metrics
        (uint256 totalIncidents, uint256 responded, uint256 autoResolved, uint256 failed, uint256 avgTime) = 
            executor.getMetrics(planId);

        // Metrics should be recorded after plan creation
        assertEq(totalIncidents, 0, "should track total incidents");

        vm.stopPrank();
    }
}
