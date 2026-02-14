// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title DisputeResolution
 * @dev Validator challenge system - allows validators to dispute reporter claims
 *      with escalating stakes &resolution mechanisms
 */
contract DisputeResolution is AccessControl {
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");

    enum DisputeStatus {
        PENDING,      // Dispute filed, awaiting evidence
        EVIDENCE_PHASE,    // Both sides submitting evidence
        VOTING,       // Arbitrators voting
        RESOLVED,     // Resolution complete
        APPEALED      // Under appeal
    }

    enum DisputeOutcome {
        PENDING_OUTCOME,
        REPORTER_CORRECT,
        REPORTER_INCORRECT,
        INCONCLUSIVE
    }

    struct Dispute {
        uint256 incidentId;
        address reporter;
        address challenger;
        uint256 reporterStake;
        uint256 challengerStake;
        DisputeStatus status;
        DisputeOutcome outcome;
        uint256 createdAt;
        uint256 resolvedAt;
        uint256 votesForReporter;
        uint256 votesAgainstReporter;
        uint256 totalVoters;
        string reporterEvidence;
        string challengerEvidence;
        bool appealed;
    }

    struct Validator {
        uint256 stake;
        uint256 successfulVotes;
        uint256 failedVotes;
        bool active;
        uint256 joinedAt;
    }

    struct DisputeConfig {
        uint256 minChallengeStake;         // Minimum stake to challenge
        uint256 minValidatorStake;         // Minimum stake for validator
        uint256 votingPeriod;              // Duration for voting phase
        uint256 quorumPercentage;          // % of validators needed
        uint256 majorityPercentage;        // % needed to decide (>50%)
        uint256 appealCost;                // Cost to appeal decision
    }

    DisputeConfig public config;

    mapping(uint256 => Dispute) public disputes;
    mapping(address => Validator) public validators;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => bool)) public vote; // dispute -> voter -> vote
    mapping(address => uint256) public validatorRewards;

    uint256 public nextDisputeId = 1;
    address[] public activeValidators;
    mapping(address => bool) private _isValidator;

    event DisputeFiled(
        uint256 indexed disputeId,
        uint256 indexed incidentId,
        address indexed reporter,
        address challenger,
        uint256 challengerStake
    );
    event EvidenceSubmitted(
        uint256 indexed disputeId,
        address indexed submitter,
        string evidence
    );
    event DisputeVotingStarted(uint256 indexed disputeId);
    event VoteCast(uint256 indexed disputeId, address indexed voter, bool support);
    event DisputeResolved(
        uint256 indexed disputeId,
        DisputeOutcome outcome,
        uint256 winnerReward
    );
    event AppealFiled(uint256 indexed disputeId, address indexed appellant);
    event ValidatorJoined(address indexed validator, uint256 stake);
    event ValidatorStakeIncreased(address indexed validator, uint256 newStake);
    event ValidatorRemoved(address indexed validator);
    event RewardDistributed(address indexed validator, uint256 reward);

    constructor(
        uint256 _minChallengeStake,
        uint256 _minValidatorStake,
        uint256 _votingPeriod,
        uint256 _quorumPercentage,
        uint256 _majorityPercentage,
        uint256 _appealCost
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MANAGER_ROLE, msg.sender);
        _grantRole(ARBITRATOR_ROLE, msg.sender);

        config = DisputeConfig({
            minChallengeStake: _minChallengeStake,
            minValidatorStake: _minValidatorStake,
            votingPeriod: _votingPeriod,
            quorumPercentage: _quorumPercentage,
            majorityPercentage: _majorityPercentage,
            appealCost: _appealCost
        });
    }

    /**
     * @dev Validator joins the dispute resolution system
     * @param _stake Amount to stake as validator
     */
    function joinAsValidator(uint256 _stake) external payable {
        require(msg.value == _stake, "stake mismatch");
        require(_stake >= config.minValidatorStake, "stake too small");
        require(!validators[msg.sender].active, "already validator");

        validators[msg.sender] = Validator({
            stake: _stake,
            successfulVotes: 0,
            failedVotes: 0,
            active: true,
            joinedAt: block.timestamp
        });

        activeValidators.push(msg.sender);
        _isValidator[msg.sender] = true;
        _grantRole(VALIDATOR_ROLE, msg.sender);

        emit ValidatorJoined(msg.sender, _stake);
    }

    /**
     * @dev Increase validator stake
     */
    function increaseValidatorStake() external payable {
        require(msg.value > 0, "no stake");
        require(validators[msg.sender].active, "not validator");

        validators[msg.sender].stake += msg.value;
        emit ValidatorStakeIncreased(msg.sender, validators[msg.sender].stake);
    }

    /**
     * @dev File a dispute against a report
     * @param _incidentId Incident being disputed
     * @param _reporter Reporter address
     * @param _evidence Evidence supporting the challenge
     */
    function fileDispute(
        uint256 _incidentId,
        address _reporter,
        string calldata _evidence
    ) external payable {
        require(msg.value >= config.minChallengeStake, "insufficient stake");
        require(_reporter != address(0), "invalid reporter");
        require(bytes(_evidence).length > 0, "missing evidence");

        uint256 disputeId = nextDisputeId++;

        disputes[disputeId] = Dispute({
            incidentId: _incidentId,
            reporter: _reporter,
            challenger: msg.sender,
            reporterStake: 0, // Will be set by manager
            challengerStake: msg.value,
            status: DisputeStatus.EVIDENCE_PHASE,
            outcome: DisputeOutcome.PENDING_OUTCOME,
            createdAt: block.timestamp,
            resolvedAt: 0,
            votesForReporter: 0,
            votesAgainstReporter: 0,
            totalVoters: 0,
            reporterEvidence: "",
            challengerEvidence: _evidence,
            appealed: false
        });

        emit DisputeFiled(disputeId, _incidentId, _reporter, msg.sender, msg.value);
    }

    /**
     * @dev Reporter submits evidence in response to challenge
     * @param _disputeId Dispute ID
     * @param _evidence Evidence supporting reporter claim
     */
    function submitReporterEvidence(uint256 _disputeId, string calldata _evidence)
        external
        onlyRole(MANAGER_ROLE)
    {
        Dispute storage dispute = disputes[_disputeId];
        require(dispute.status == DisputeStatus.EVIDENCE_PHASE, "not in evidence phase");
        require(bytes(_evidence).length > 0, "missing evidence");

        dispute.reporterEvidence = _evidence;

        emit EvidenceSubmitted(_disputeId, dispute.reporter, _evidence);

        // Automatically transition to voting after evidence from both sides
        dispute.status = DisputeStatus.VOTING;
        emit DisputeVotingStarted(_disputeId);
    }

    /**
     * @dev Validator casts vote on dispute
     * @param _disputeId Dispute ID
     * @param _support True = reporter correct, False = reporter incorrect
     */
    function castVote(uint256 _disputeId, bool _support)
        external
        onlyRole(VALIDATOR_ROLE)
    {
        Dispute storage dispute = disputes[_disputeId];
        require(dispute.status == DisputeStatus.VOTING, "not in voting phase");
        require(!hasVoted[_disputeId][msg.sender], "already voted");
        require(block.timestamp <= dispute.createdAt + config.votingPeriod, "voting closed");

        hasVoted[_disputeId][msg.sender] = true;
        vote[_disputeId][msg.sender] = _support;

        if (_support) {
            dispute.votesForReporter++;
        } else {
            dispute.votesAgainstReporter++;
        }
        dispute.totalVoters++;

        emit VoteCast(_disputeId, msg.sender, _support);

        // Auto-resolve if quorum reached &majority clear
        _tryAutoResolve(_disputeId);
    }

    /**
     * @dev Manually resolve dispute after voting period
     * @param _disputeId Dispute ID
     */
    function resolveDispute(uint256 _disputeId)
        external
        onlyRole(ARBITRATOR_ROLE)
    {
        Dispute storage dispute = disputes[_disputeId];
        require(dispute.status == DisputeStatus.VOTING, "not in voting phase");
        require(block.timestamp > dispute.createdAt + config.votingPeriod, "voting not closed");

        _resolveDispute(_disputeId);
    }

    /**
     * @dev Appeal a dispute decision
     * @param _disputeId Dispute ID
     */
    function appealDispute(uint256 _disputeId) external payable {
        Dispute storage dispute = disputes[_disputeId];
        require(dispute.status == DisputeStatus.RESOLVED, "not resolved");
        require(msg.value >= config.appealCost, "insufficient appeal fee");
        require(!dispute.appealed, "already appealed");

        dispute.appealed = true;
        dispute.status = DisputeStatus.APPEALED;
        dispute.outcome = DisputeOutcome.PENDING_OUTCOME;
        dispute.votesForReporter = 0;
        dispute.votesAgainstReporter = 0;
        dispute.totalVoters = 0;

        emit AppealFiled(_disputeId, msg.sender);
    }

    /**
     * @dev Get dispute details
     */
    function getDispute(uint256 _disputeId)
        external
        view
        returns (
            uint256 incidentId,
            address reporter,
            address challenger,
            DisputeStatus status,
            DisputeOutcome outcome,
            uint256 votesFor,
            uint256 votesAgainst,
            uint256 totalVoters
        )
    {
        Dispute storage dispute = disputes[_disputeId];
        return (
            dispute.incidentId,
            dispute.reporter,
            dispute.challenger,
            dispute.status,
            dispute.outcome,
            dispute.votesForReporter,
            dispute.votesAgainstReporter,
            dispute.totalVoters
        );
    }

    function getValidator(address _validator)
        external
        view
        returns (
            uint256 stake,
            uint256 successfulVotes,
            uint256 failedVotes,
            bool active
        )
    {
        Validator storage v = validators[_validator];
        return (v.stake, v.successfulVotes, v.failedVotes, v.active);
    }

    function getActiveValidatorCount() external view returns (uint256) {
        return activeValidators.length;
    }

    function getValidatorRewards(address _validator)
        external
        view
        returns (uint256)
    {
        return validatorRewards[_validator];
    }

    // Internal functions
    function _tryAutoResolve(uint256 _disputeId) internal {
        Dispute storage dispute = disputes[_disputeId];
        
        uint256 minVoters = (activeValidators.length * config.quorumPercentage) / 100;
        if (dispute.totalVoters < minVoters) {
            return; // Quorum not reached
        }

        uint256 majority = (dispute.totalVoters * config.majorityPercentage) / 100;
        if (dispute.votesForReporter > majority) {
            _resolveDisputeAsReporterCorrect(_disputeId);
        } else if (dispute.votesAgainstReporter > majority) {
            _resolveDisputeAsChallengerCorrect(_disputeId);
        }
    }

    function _resolveDispute(uint256 _disputeId) internal {
        Dispute storage dispute = disputes[_disputeId];

        uint256 majority = (dispute.totalVoters * config.majorityPercentage) / 100;

        if (dispute.votesForReporter > majority) {
            _resolveDisputeAsReporterCorrect(_disputeId);
        } else if (dispute.votesAgainstReporter > majority) {
            _resolveDisputeAsChallengerCorrect(_disputeId);
        } else {
            dispute.status = DisputeStatus.RESOLVED;
            dispute.outcome = DisputeOutcome.INCONCLUSIVE;
            dispute.resolvedAt = block.timestamp;
            emit DisputeResolved(_disputeId, DisputeOutcome.INCONCLUSIVE, 0);
        }
    }

    function _resolveDisputeAsReporterCorrect(uint256 _disputeId) internal {
        Dispute storage dispute = disputes[_disputeId];
        dispute.status = DisputeStatus.RESOLVED;
        dispute.outcome = DisputeOutcome.REPORTER_CORRECT;
        dispute.resolvedAt = block.timestamp;

        // Reward reporters (supporter validators get rewarded, challengerStake goes to reporter)
        uint256 totalReward = dispute.challengerStake + (dispute.reporterStake / 2);

        // Distribute to voters who voted correctly
        uint256 rewardPerValidator = (totalReward * 90) / 100 / dispute.votesForReporter;
        for (uint256 i = 0; i < activeValidators.length; i++) {
            if (hasVoted[_disputeId][activeValidators[i]] && vote[_disputeId][activeValidators[i]]) {
                validatorRewards[activeValidators[i]] += rewardPerValidator;
                validators[activeValidators[i]].successfulVotes++;
            }
        }

        emit DisputeResolved(_disputeId, DisputeOutcome.REPORTER_CORRECT, totalReward);
    }

    function _resolveDisputeAsChallengerCorrect(uint256 _disputeId) internal {
        Dispute storage dispute = disputes[_disputeId];
        dispute.status = DisputeStatus.RESOLVED;
        dispute.outcome = DisputeOutcome.REPORTER_INCORRECT;
        dispute.resolvedAt = block.timestamp;

        // Reward challenger (reporter's stake Service Level Agreementshed)
        uint256 totalReward = dispute.reporterStake + (dispute.challengerStake / 2);

        // Distribute to voters who voted correctly
        uint256 rewardPerValidator = (totalReward * 90) / 100 / dispute.votesAgainstReporter;
        for (uint256 i = 0; i < activeValidators.length; i++) {
            if (hasVoted[_disputeId][activeValidators[i]] && !vote[_disputeId][activeValidators[i]]) {
                validatorRewards[activeValidators[i]] += rewardPerValidator;
                validators[activeValidators[i]].successfulVotes++;
            }
        }

        emit DisputeResolved(_disputeId, DisputeOutcome.REPORTER_INCORRECT, totalReward);
    }
}
