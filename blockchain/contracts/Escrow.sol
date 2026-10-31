// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Escrow
 * @notice Holds an ERC-20 stablecoin (USDC) in escrow between buyer and seller.
 *
 *  Flow:
 *   1. Buyer approves this contract for `amount` USDC, then calls createEscrow().
 *   2. Buyer calls confirmDelivery() -> seller is paid (minus optional platform fee).
 *   3. If the buyer never confirms and nobody disputes, anyone may call
 *      releaseExpired() after `releaseAfter` -> seller is paid.
 *   4. Buyer, seller or arbiter can freeze the escrow with disputeEscrow();
 *      the arbiter then decides with resolveDispute().
 *   5. The seller may voluntarily refund the buyer (e.g. out of stock) with refundBuyer().
 */
contract Escrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Types ────────────────────────────────────────────────────────
    enum Status {
        AwaitingDelivery, // 0
        Complete,         // 1  seller paid by buyer confirmation or auto-release
        Disputed,         // 2
        Resolved,         // 3  arbiter decided
        Refunded          // 4  seller refunded buyer voluntarily
    }

    struct EscrowRecord {
        address buyer;
        address seller;
        uint256 amount;
        uint256 orderId;
        uint64 releaseAfter;
        Status status;
    }

    // ── Constants / immutables ───────────────────────────────────────
    uint16 public constant MAX_FEE_BPS = 1000; // 10% hard cap

    IERC20 public immutable token;
    uint16 public immutable feeBps;
    uint64 public immutable autoReleasePeriod;

    // ── State ────────────────────────────────────────────────────────
    address public arbiter;
    address public feeRecipient;
    uint256 public nextEscrowId;
    mapping(uint256 => EscrowRecord) public escrows;
    /// @dev keccak256(buyer, orderId) => escrowId + 1 (0 = none). Keyed by buyer so a
    ///      third party can't block an order by funding its ID first.
    mapping(bytes32 => uint256) private _escrowIdPlusOne;

    // ── Events ───────────────────────────────────────────────────────
    event EscrowCreated(
        uint256 indexed escrowId,
        uint256 indexed orderId,
        address indexed buyer,
        address seller,
        uint256 amount,
        uint64 releaseAfter
    );
    event DeliveryConfirmed(uint256 indexed escrowId);
    event AutoReleased(uint256 indexed escrowId);
    event DisputeRaised(uint256 indexed escrowId, address raisedBy);
    event DisputeResolved(uint256 indexed escrowId, bool refundedBuyer, uint256 amount);
    event RefundedBySeller(uint256 indexed escrowId);
    event FundsReleased(uint256 indexed escrowId, address indexed to, uint256 amount, uint256 fee);
    event ArbiterChanged(address indexed previousArbiter, address indexed newArbiter);
    event FeeRecipientChanged(address indexed newRecipient);

    // ── Modifiers ────────────────────────────────────────────────────
    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Only arbiter");
        _;
    }

    modifier escrowExists(uint256 _id) {
        require(_id < nextEscrowId, "Escrow does not exist");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────
    /**
     * @param _token             ERC-20 used for payments (USDC on Base).
     * @param _feeBps            Platform fee in basis points taken from seller payouts (100 = 1%).
     * @param _autoReleasePeriod Seconds after creation when undisputed funds may be released to the seller.
     */
    constructor(IERC20 _token, uint16 _feeBps, uint64 _autoReleasePeriod) {
        require(address(_token) != address(0), "Invalid token");
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        require(_autoReleasePeriod >= 1 days, "Release period too short");
        token = _token;
        feeBps = _feeBps;
        autoReleasePeriod = _autoReleasePeriod;
        arbiter = msg.sender;
        feeRecipient = msg.sender;
    }

    // ── Core Functions ───────────────────────────────────────────────

    /**
     * @notice Buyer locks `_amount` tokens for an order. Requires prior approve().
     * @param _orderId Off-chain order ID; each order can be funded only once.
     */
    function createEscrow(
        uint256 _orderId,
        address _seller,
        uint256 _amount
    ) external nonReentrant returns (uint256 escrowId) {
        require(_amount > 0, "Deposit required");
        require(_seller != address(0), "Invalid seller");
        require(_seller != msg.sender, "Buyer cannot be seller");
        bytes32 key = _orderKey(msg.sender, _orderId);
        require(_escrowIdPlusOne[key] == 0, "Order already funded");

        escrowId = nextEscrowId++;
        uint64 releaseAfter = uint64(block.timestamp) + autoReleasePeriod;

        escrows[escrowId] = EscrowRecord({
            buyer: msg.sender,
            seller: _seller,
            amount: _amount,
            orderId: _orderId,
            releaseAfter: releaseAfter,
            status: Status.AwaitingDelivery
        });
        _escrowIdPlusOne[key] = escrowId + 1;

        token.safeTransferFrom(msg.sender, address(this), _amount);

        emit EscrowCreated(escrowId, _orderId, msg.sender, _seller, _amount, releaseAfter);
    }

    /// @notice Buyer confirms delivery and releases funds to the seller.
    function confirmDelivery(uint256 _id) external nonReentrant escrowExists(_id) {
        EscrowRecord storage e = escrows[_id];
        require(msg.sender == e.buyer, "Only buyer");
        require(e.status == Status.AwaitingDelivery, "Invalid status");

        e.status = Status.Complete;
        _paySeller(_id, e);
        emit DeliveryConfirmed(_id);
    }

    /// @notice After the release deadline, anyone can push undisputed funds to the seller.
    function releaseExpired(uint256 _id) external nonReentrant escrowExists(_id) {
        EscrowRecord storage e = escrows[_id];
        require(e.status == Status.AwaitingDelivery, "Invalid status");
        require(block.timestamp >= e.releaseAfter, "Not yet releasable");

        e.status = Status.Complete;
        _paySeller(_id, e);
        emit AutoReleased(_id);
    }

    /// @notice Buyer, seller, or arbiter freezes the escrow pending arbitration.
    function disputeEscrow(uint256 _id) external escrowExists(_id) {
        EscrowRecord storage e = escrows[_id];
        require(
            msg.sender == e.buyer || msg.sender == e.seller || msg.sender == arbiter,
            "Only buyer, seller or arbiter"
        );
        require(e.status == Status.AwaitingDelivery, "Invalid status");

        e.status = Status.Disputed;
        emit DisputeRaised(_id, msg.sender);
    }

    /// @notice Seller voluntarily returns the full amount to the buyer.
    function refundBuyer(uint256 _id) external nonReentrant escrowExists(_id) {
        EscrowRecord storage e = escrows[_id];
        require(msg.sender == e.seller, "Only seller");
        require(e.status == Status.AwaitingDelivery, "Invalid status");

        e.status = Status.Refunded;
        token.safeTransfer(e.buyer, e.amount);
        emit FundsReleased(_id, e.buyer, e.amount, 0);
        emit RefundedBySeller(_id);
    }

    /**
     * @notice Arbiter settles a disputed (or still-open) escrow.
     * @param _refundBuyer true = full refund to buyer, false = pay seller (minus fee).
     */
    function resolveDispute(uint256 _id, bool _refundBuyer)
        external
        nonReentrant
        onlyArbiter
        escrowExists(_id)
    {
        EscrowRecord storage e = escrows[_id];
        require(
            e.status == Status.Disputed || e.status == Status.AwaitingDelivery,
            "Cannot resolve: escrow already settled"
        );

        e.status = Status.Resolved;
        if (_refundBuyer) {
            token.safeTransfer(e.buyer, e.amount);
            emit FundsReleased(_id, e.buyer, e.amount, 0);
        } else {
            _paySeller(_id, e);
        }
        emit DisputeResolved(_id, _refundBuyer, e.amount);
    }

    // ── Admin ────────────────────────────────────────────────────────

    function transferArbiter(address _newArbiter) external onlyArbiter {
        require(_newArbiter != address(0), "Invalid arbiter");
        emit ArbiterChanged(arbiter, _newArbiter);
        arbiter = _newArbiter;
    }

    function setFeeRecipient(address _recipient) external onlyArbiter {
        require(_recipient != address(0), "Invalid recipient");
        feeRecipient = _recipient;
        emit FeeRecipientChanged(_recipient);
    }

    // ── Views ────────────────────────────────────────────────────────

    function getEscrow(uint256 _id)
        external
        view
        escrowExists(_id)
        returns (EscrowRecord memory)
    {
        return escrows[_id];
    }

    /// @notice Returns (true, escrowId) if `_buyer` has funded `_orderId`.
    function escrowIdForOrder(address _buyer, uint256 _orderId)
        external
        view
        returns (bool exists, uint256 escrowId)
    {
        uint256 v = _escrowIdPlusOne[_orderKey(_buyer, _orderId)];
        if (v == 0) return (false, 0);
        return (true, v - 1);
    }

    // ── Internal ─────────────────────────────────────────────────────

    function _orderKey(address _buyer, uint256 _orderId) private pure returns (bytes32) {
        return keccak256(abi.encode(_buyer, _orderId));
    }

    function _paySeller(uint256 _id, EscrowRecord storage e) private {
        uint256 fee = (e.amount * feeBps) / 10_000;
        uint256 payout = e.amount - fee;
        if (fee > 0) token.safeTransfer(feeRecipient, fee);
        token.safeTransfer(e.seller, payout);
        emit FundsReleased(_id, e.seller, payout, fee);
    }
}
