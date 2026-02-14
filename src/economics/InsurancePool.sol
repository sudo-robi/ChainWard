// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title InsurancePool
 * @dev Insurance pool to compensate users affected by verified incidents
 *      Funded by slashing malicious actors &optional deposits
 */
contract InsurancePool is AccessControl, ReentrancyGuard {
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant CLAIMS_PROCESSOR_ROLE = keccak256("CLAIMS_PROCESSOR_ROLE");

    enum ClaimStatus {
        PENDING,
        UNDER_REVIEW,
        APPROVED,
        REJECTED,
        PAID,
        DISPUTED
    }

    struct InsuranceConfig {
        uint256 maxClaimAmount;           // Maximum per claim
        uint256 maxAnnualPayouts;         // Annual budget
        uint256 deductible;               // User's responsibility
        uint256 claimProcessingPeriod;    // Days to review claim
        uint256 feePercentage;            // % fee on payouts
    }

    struct Claim {
        uint256 incidentId;
        address claimant;
        uint256 claimedAmount;
        uint256 approvedAmount;
        uint256 paidAmount;
        ClaimStatus status;
        uint256 filedAt;
        uint256 processedAt;
        string evidence;
        string rejectionReason;
    }

    InsuranceConfig public config;

    mapping(uint256 => Claim[]) public incidentClaims;  // incidentId -> claims
    mapping(address => uint256[]) public claimantClaims; // claimant -> claim IDs
    mapping(uint256 => uint256) public incidentPayouts; // incidentId -> total paid

    uint256 public poolBalance;
    uint256 public totalAccumulated;
    uint256 public totalPaidOut;
    uint256 public currentYearPayouts;
    uint256 public yearStartTimestamp;

    uint256 private _nextClaimId = 1;
    mapping(uint256 => Claim) public claims; // Global claim lookup

    event PoolFunded(address indexed funder, uint256 amount);
    event ClaimFiled(
        uint256 indexed claimId,
        uint256 indexed incidentId,
        address indexed claimant,
        uint256 amount
    );
    event ClaimApproved(uint256 indexed claimId, uint256 approvedAmount);
    event ClaimRejected(uint256 indexed claimId, string reason);
    event ClaimPaid(uint256 indexed claimId, address indexed claimant, uint256 amount);
    event SlashedFundsReceived(uint256 amount);
    event ConfigUpdated(
        uint256 maxClaim,
        uint256 maxAnnual,
        uint256 deductible,
        uint256 period,
        uint256 fee
    );
    event InsuranceCoverageLimitReached();

    constructor(
        uint256 _maxClaimAmount,
        uint256 _maxAnnualPayouts,
        uint256 _deductible,
        uint256 _claimProcessingPeriod,
        uint256 _feePercentage
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MANAGER_ROLE, msg.sender);
        _grantRole(CLAIMS_PROCESSOR_ROLE, msg.sender);

        config = InsuranceConfig({
            maxClaimAmount: _maxClaimAmount,
            maxAnnualPayouts: _maxAnnualPayouts,
            deductible: _deductible,
            claimProcessingPeriod: _claimProcessingPeriod,
            feePercentage: _feePercentage
        });

        poolBalance = 0;
        totalAccumulated = 0;
        totalPaidOut = 0;
        currentYearPayouts = 0;
        yearStartTimestamp = block.timestamp;
    }

    /**
     * @dev Fund the insurance pool
     */
    function fundPool() external payable onlyRole(MANAGER_ROLE) {
        require(msg.value > 0, "invalid amount");

        poolBalance += msg.value;
        totalAccumulated += msg.value;

        emit PoolFunded(msg.sender, msg.value);
    }

    /**
     * @dev Add slashed funds from malicious actors
     * @param _amount Amount of slashed funds
     */
    function addSlashedFunds(uint256 _amount) external payable onlyRole(MANAGER_ROLE) {
        require(msg.value == _amount, "amount mismatch");
        require(_amount > 0, "invalid amount");

        poolBalance += _amount;
        totalAccumulated += _amount;

        emit SlashedFundsReceived(_amount);
    }

    /**
     * @dev File an insurance claim for an incident
     * @param _incidentId Incident ID
     * @param _claimedAmount Amount claiming
     * @param _evidence Evidence of damage/loss
     */
    function fileClaim(
        uint256 _incidentId,
        uint256 _claimedAmount,
        string calldata _evidence
    ) external returns (uint256 claimId) {
        require(_claimedAmount > 0, "invalid amount");
        require(_claimedAmount <= config.maxClaimAmount, "exceeds max claim");
        require(bytes(_evidence).length > 0, "missing evidence");

        claimId = _nextClaimId++;

        Claim memory newClaim = Claim({
            incidentId: _incidentId,
            claimant: msg.sender,
            claimedAmount: _claimedAmount,
            approvedAmount: 0,
            paidAmount: 0,
            status: ClaimStatus.PENDING,
            filedAt: block.timestamp,
            processedAt: 0,
            evidence: _evidence,
            rejectionReason: ""
        });

        claims[claimId] = newClaim;
        incidentClaims[_incidentId].push(newClaim);
        claimantClaims[msg.sender].push(claimId);

        emit ClaimFiled(claimId, _incidentId, msg.sender, _claimedAmount);

        return claimId;
    }

    /**
     * @dev Approve a claim
     * @param _claimId Claim ID
     * @param _approvedAmount Amount to approve (after deductible)
     */
    function approveClaim(uint256 _claimId, uint256 _approvedAmount)
        external
        onlyRole(CLAIMS_PROCESSOR_ROLE)
    {
        Claim storage claim = claims[_claimId];
        require(claim.status == ClaimStatus.PENDING, "not pending");
        require(_approvedAmount <= claim.claimedAmount, "exceeds claimed");
        require(_approvedAmount > config.deductible, "below deductible");

        // Apply deductible
        uint256 netAmount = _approvedAmount - config.deductible;
        require(netAmount <= poolBalance, "insufficient pool balance");

        uint256 netAfterFee = (netAmount * (100 - config.feePercentage)) / 100;

        claim.status = ClaimStatus.APPROVED;
        claim.approvedAmount = netAfterFee;
        claim.processedAt = block.timestamp;

        emit ClaimApproved(_claimId, netAfterFee);
    }

    /**
     * @dev Reject a claim
     * @param _claimId Claim ID
     * @param _reason Rejection reason
     */
    function rejectClaim(uint256 _claimId, string calldata _reason)
        external
        onlyRole(CLAIMS_PROCESSOR_ROLE)
    {
        Claim storage claim = claims[_claimId];
        require(claim.status == ClaimStatus.PENDING, "not pending");
        require(bytes(_reason).length > 0, "missing reason");

        claim.status = ClaimStatus.REJECTED;
        claim.rejectionReason = _reason;
        claim.processedAt = block.timestamp;

        emit ClaimRejected(_claimId, _reason);
    }

    /**
     * @dev Pay approved claim
     * @param _claimId Claim ID
     */
    function payClaim(uint256 _claimId) external nonReentrant {
        Claim storage claim = claims[_claimId];
        require(claim.status == ClaimStatus.APPROVED, "not approved");
        require(claim.paidAmount == 0, "already paid");

        uint256 payoutAmount = claim.approvedAmount;
        require(payoutAmount <= poolBalance, "insufficient balance");

        // Check annual limits
        if (block.timestamp >= yearStartTimestamp + 365 days) {
            currentYearPayouts = 0;
            yearStartTimestamp = block.timestamp;
        }

        require(currentYearPayouts + payoutAmount <= config.maxAnnualPayouts, "annual limit exceeded");

        // Effects
        claim.status = ClaimStatus.PAID;
        claim.paidAmount = payoutAmount;
        poolBalance -= payoutAmount;
        totalPaidOut += payoutAmount;
        currentYearPayouts += payoutAmount;
        incidentPayouts[claim.incidentId] += payoutAmount;

        // Interaction
        (bool success, ) = claim.claimant.call{value: payoutAmount}("");
        require(success, "transfer failed");

        emit ClaimPaid(_claimId, claim.claimant, payoutAmount);

        // Check if limit reached
        if (currentYearPayouts >= config.maxAnnualPayouts) {
            emit InsuranceCoverageLimitReached();
        }
    }

    /**
     * @dev Update configuration
     */
    function updateConfig(
        uint256 _maxClaim,
        uint256 _maxAnnual,
        uint256 _deductible,
        uint256 _period,
        uint256 _fee
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_fee <= 50, "fee too high"); // Max 50%

        config.maxClaimAmount = _maxClaim;
        config.maxAnnualPayouts = _maxAnnual;
        config.deductible = _deductible;
        config.claimProcessingPeriod = _period;
        config.feePercentage = _fee;

        emit ConfigUpdated(_maxClaim, _maxAnnual, _deductible, _period, _fee);
    }

    // View functions
    function getPoolStats()
        external
        view
        returns (
            uint256 balance,
            uint256 accumulated,
            uint256 paidOut,
            uint256 yearPayouts
        )
    {
        return (poolBalance, totalAccumulated, totalPaidOut, currentYearPayouts);
    }

    function getClaim(uint256 _claimId) external view returns (Claim memory) {
        return claims[_claimId];
    }

    function getIncidentClaimCount(uint256 _incidentId)
        external
        view
        returns (uint256)
    {
        return incidentClaims[_incidentId].length;
    }

    function getIncidentClaim(uint256 _incidentId, uint256 _index)
        external
        view
        returns (Claim memory)
    {
        return incidentClaims[_incidentId][_index];
    }

    function getClaimantClaimCount(address _claimant) external view returns (uint256) {
        return claimantClaims[_claimant].length;
    }

    function getClaimantClaim(address _claimant, uint256 _index)
        external
        view
        returns (uint256)
    {
        return claimantClaims[_claimant][_index];
    }

    function getIncidentPayouts(uint256 _incidentId) external view returns (uint256) {
        return incidentPayouts[_incidentId];
    }

    function getConfig()
        external
        view
        returns (
            uint256 maxClaim,
            uint256 maxAnnual,
            uint256 deductible,
            uint256 period,
            uint256 fee
        )
    {
        return (
            config.maxClaimAmount,
            config.maxAnnualPayouts,
            config.deductible,
            config.claimProcessingPeriod,
            config.feePercentage
        );
    }

    /**
     * @dev Allow contract to receive ETH
     */
    receive() external payable {
        poolBalance += msg.value;
        totalAccumulated += msg.value;
    }
}
