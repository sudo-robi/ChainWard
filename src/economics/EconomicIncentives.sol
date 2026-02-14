// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";

interface IRewardsDistribution {
    function accrueAccurateReportReward(address reporter, uint256 incidentId, uint256 severity) external;
    function accrueMultiChainBonus(address reporter, uint256[] calldata incidentIds, uint256 chainCount) external;
    function accrueQualityBonus(address reporter, uint256 incidentId, uint256 detectionTime, uint256 incidentTime) external;
    function addSlashedFunds(uint256 amount) external;
}

interface IDisputeResolution {
    function fileDispute(uint256 incidentId, address reporter, string calldata evidence) external payable;
    function submitReporterEvidence(uint256 disputeId, string calldata evidence) external;
    function castVote(uint256 disputeId, bool support) external;
    function resolveDispute(uint256 disputeId) external;
}

interface IInsurancePool {
    function fileClaim(uint256 incidentId, uint256 claimedAmount, string calldata evidence) external returns (uint256);
    function approveClaim(uint256 claimId, uint256 approvedAmount) external;
    function rejectClaim(uint256 claimId, string calldata reason) external;
    function payClaim(uint256 claimId) external;
    function addSlashedFunds(uint256 amount) external payable;
}

/**
 * @title EconomicIncentives
 * @dev Unified orchestrator for rewards, disputes, &insurance
 *      Coordinates all token economics &incentive mechanisms
 */
contract EconomicIncentives is AccessControl {
    bytes32 public constant INCIDENT_MANAGER_ROLE = keccak256("INCIDENT_MANAGER_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    struct IncidentEconomics {
        address reporter;
        uint256 severity;
        uint256 chainCount;
        uint256 detectionTime;
        uint256 incidentTime;
        uint256 rewardPoolBudget;
        bool rewardsDistributed;
        bool insuranceClaimed;
        uint256 totalPayouts;
    }

    struct EconomicMetrics {
        uint256 totalRewardsDistributed;
        uint256 totalSlashed;
        uint256 totalInsurancePaid;
        uint256 activeDisputes;
        uint256 resolvedDisputes;
        uint256 totalReporters;
        uint256 totalValidators;
    }

    IRewardsDistribution public rewardsDistribution;
    IDisputeResolution public disputeResolution;
    IInsurancePool public insurancePool;

    mapping(uint256 => IncidentEconomics) public incidentEconomics;
    EconomicMetrics public metrics;

    event RewardsMinted(uint256 indexed incidentId, address indexed reporter, uint256 amount);
    event FundsSlashed(address indexed slashedAddress, uint256 amount);
    event InsuranceClaimed(uint256 indexed incidentId, address indexed claimant, uint256 amount);
    event DisputeInitiated(uint256 indexed disputeId, uint256 indexed incidentId);
    event EconomicCycleCompleted(uint256 indexed incidentId, uint256 rewards, uint256 insurance);

    constructor(
        address _rewardsDistribution,
        address _disputeResolution,
        address _insurancePool
    ) {
        require(_rewardsDistribution != address(0), "zero rewards address");
        require(_disputeResolution != address(0), "zero dispute address");
        require(_insurancePool != address(0), "zero insurance address");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(INCIDENT_MANAGER_ROLE, msg.sender);
        _grantRole(GOVERNANCE_ROLE, msg.sender);

        rewardsDistribution = IRewardsDistribution(_rewardsDistribution);
        disputeResolution = IDisputeResolution(_disputeResolution);
        insurancePool = IInsurancePool(_insurancePool);

        metrics = EconomicMetrics({
            totalRewardsDistributed: 0,
            totalSlashed: 0,
            totalInsurancePaid: 0,
            activeDisputes: 0,
            resolvedDisputes: 0,
            totalReporters: 0,
            totalValidators: 0
        });
    }

    /**
     * @dev Register incident with economic parameters
     * Called by IncidentManager when incident is created
     */
    function registerIncident(
        uint256 _incidentId,
        address _reporter,
        uint256 _severity,
        uint256 _chainCount,
        uint256 _detectionTime,
        uint256 _incidentTime
    ) external onlyRole(INCIDENT_MANAGER_ROLE) {
        require(_reporter != address(0), "invalid reporter");

        incidentEconomics[_incidentId] = IncidentEconomics({
            reporter: _reporter,
            severity: _severity,
            chainCount: _chainCount,
            detectionTime: _detectionTime,
            incidentTime: _incidentTime,
            rewardPoolBudget: _calculateRewardBudget(_severity),
            rewardsDistributed: false,
            insuranceClaimed: false,
            totalPayouts: 0
        });
    }

    /**
     * @dev Distribute rewards for accurate incident detection
     * @param _incidentId Incident ID
     */
    function distributeRewards(uint256 _incidentId)
        external
        onlyRole(INCIDENT_MANAGER_ROLE)
    {
        IncidentEconomics storage eco = incidentEconomics[_incidentId];
        require(!eco.rewardsDistributed, "already distributed");
        require(eco.reporter != address(0), "invalid incident");

        eco.rewardsDistributed = true;

        // Base accurate report reward
        rewardsDistribution.accrueAccurateReportReward(
            eco.reporter,
            _incidentId,
            eco.severity
        );

        // Multi-chain bonus
        if (eco.chainCount > 1) {
            uint256[] memory incidentIds = new uint256[](1);
            incidentIds[0] = _incidentId;
            rewardsDistribution.accrueMultiChainBonus(eco.reporter, incidentIds, eco.chainCount);
        }

        // Quality/speed bonus
        rewardsDistribution.accrueQualityBonus(
            eco.reporter,
            _incidentId,
            eco.detectionTime,
            eco.incidentTime
        );

        metrics.totalRewardsDistributed += eco.rewardPoolBudget;

        emit RewardsMinted(_incidentId, eco.reporter, eco.rewardPoolBudget);
    }

    /**
     * @dev Handle reporter misbehavior - slash stake
     * @param _reporter Reporter address
     * @param _slashAmount Amount to slash
     * @param _reason Reason for slashing
     */
    function slashReporter(
        address _reporter,
        uint256 _slashAmount,
        string calldata _reason
    ) external onlyRole(INCIDENT_MANAGER_ROLE) {
        require(_reporter != address(0), "invalid reporter");
        require(_slashAmount > 0, "invalid amount");

        // Add slashed funds to both reward pool &insurance
        rewardsDistribution.addSlashedFunds(_slashAmount / 2);
        insurancePool.addSlashedFunds{value: _slashAmount / 2}(_slashAmount / 2);

        metrics.totalSlashed += _slashAmount;

        emit FundsSlashed(_reporter, _slashAmount);
    }

    /**
     * @dev File insurance claim for incident impact
     * @param _incidentId Incident ID
     * @param _claimedAmount Amount to claim
     * @param _evidence Evidence of impact
     */
    function fileInsuranceClaim(
        uint256 _incidentId,
        uint256 _claimedAmount,
        string calldata _evidence
    ) external returns (uint256 claimId) {
        uint256 claimIdReturned = insurancePool.fileClaim(
            _incidentId,
            _claimedAmount,
            _evidence
        );

        incidentEconomics[_incidentId].insuranceClaimed = true;

        emit InsuranceClaimed(_incidentId, msg.sender, _claimedAmount);
        return claimIdReturned;
    }

    /**
     * @dev Initiate dispute against a report
     * @param _incidentId Incident ID
     * @param _reporter Reporter address
     * @param _evidence Evidence of false report
     */
    function initiateDispute(
        uint256 _incidentId,
        address _reporter,
        string calldata _evidence
    ) external payable returns (uint256 disputeId) {
        require(msg.value > 0, "no stake");

        // For now, return a placeholder disputeId
        // In production, would call disputeResolution.fileDispute
        metrics.activeDisputes++;

        emit DisputeInitiated(uint256(1), _incidentId); // Placeholder

        return uint256(1);
    }

    /**
     * @dev Complete economic cycle for incident
     *      Settle all rewards, disputes, &insurance
     */
    function completeEconomicCycle(uint256 _incidentId)
        external
        onlyRole(GOVERNANCE_ROLE)
    {
        IncidentEconomics storage eco = incidentEconomics[_incidentId];
        require(eco.reporter != address(0), "invalid incident");

        uint256 totalRewards = eco.rewardPoolBudget;
        uint256 totalInsurance = 0;

        eco.totalPayouts = totalRewards + totalInsurance;

        emit EconomicCycleCompleted(_incidentId, totalRewards, totalInsurance);
    }

    /**
     * @dev Update contract addresses (admin only)
     */
    function updateContracts(
        address _rewards,
        address _disputes,
        address _insurance
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_rewards != address(0)) rewardsDistribution = IRewardsDistribution(_rewards);
        if (_disputes != address(0)) disputeResolution = IDisputeResolution(_disputes);
        if (_insurance != address(0)) insurancePool = IInsurancePool(_insurance);
    }

    // View functions
    function getIncidentEconomics(uint256 _incidentId)
        external
        view
        returns (
            address reporter,
            uint256 severity,
            uint256 chainCount,
            uint256 rewardBudget,
            bool rewardsDistributed,
            bool insuranceClaimed,
            uint256 totalPayouts
        )
    {
        IncidentEconomics storage eco = incidentEconomics[_incidentId];
        return (
            eco.reporter,
            eco.severity,
            eco.chainCount,
            eco.rewardPoolBudget,
            eco.rewardsDistributed,
            eco.insuranceClaimed,
            eco.totalPayouts
        );
    }

    function getMetrics()
        external
        view
        returns (
            uint256 rewardsDistributed,
            uint256 slashed,
            uint256 insurancePaid,
            uint256 activeDisputes,
            uint256 resolvedDisputes
        )
    {
        return (
            metrics.totalRewardsDistributed,
            metrics.totalSlashed,
            metrics.totalInsurancePaid,
            metrics.activeDisputes,
            metrics.resolvedDisputes
        );
    }

    // Internal functions
    function _calculateRewardBudget(uint256 _severity) internal pure returns (uint256) {
        // Severity: 0=low, 1=medium, 2=critical (P1), 3=critical (P0)
        if (_severity >= 3) {
            return 10 ether; // P0 - highest reward
        } else if (_severity == 2) {
            return 5 ether; // P1 - medium reward
        } else if (_severity == 1) {
            return 2 ether; // Medium - lower reward
        } else {
            return 1 ether; // Low - baseline
        }
    }

    /**
     * @dev Allow contract to receive ETH for operations
     */
    receive() external payable {}
}
