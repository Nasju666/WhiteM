// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Escrow
 * @notice Holds ETH in escrow between buyer and seller.
 *         The contract owner acts as arbiter for disputes.
 */
contract Escrow {
    // ── Types ────────────────────────────────────────────────────────
    enum Status {
        AwaitingDelivery,
        Complete,
        Disputed,
        Resolved
    }

    struct EscrowRecord {
        address buyer;
        address seller;
        uint256 amount;
        Status status;
    }

    // ── State ────────────────────────────────────────────────────────
    address public arbiter;
    uint256 public nextEscrowId;
    mapping(uint256 => EscrowRecord) public escrows;

    // ── Events ───────────────────────────────────────────────────────
    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        uint256 amount
    );
    event DeliveryConfirmed(uint256 indexed escrowId);
    event DisputeRaised(uint256 indexed escrowId, address raisedBy);
    event DisputeResolved(
        uint256 indexed escrowId,
        bool refundedBuyer,
        uint256 amount
    );

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
    constructor() {
        arbiter = msg.sender;
    }

    // ── Core Functions ───────────────────────────────────────────────

    /**
     * @notice Buyer creates an escrow by depositing ETH.
     * @param _seller The address of the seller.
     * @return escrowId The ID of the newly created escrow.
     */
    function createEscrow(address _seller) external payable returns (uint256) {
        require(msg.value > 0, "Deposit required");
        require(_seller != address(0), "Invalid seller");
        require(_seller != msg.sender, "Buyer cannot be seller");

        uint256 escrowId = nextEscrowId++;

        escrows[escrowId] = EscrowRecord({
            buyer: msg.sender,
            seller: _seller,
            amount: msg.value,
            status: Status.AwaitingDelivery
        });

        emit EscrowCreated(escrowId, msg.sender, _seller, msg.value);
        return escrowId;
    }

    /**
     * @notice Buyer confirms delivery — releases funds to seller.
     */
    function confirmDelivery(uint256 _id) external escrowExists(_id) {
        EscrowRecord storage e = escrows[_id];
        require(msg.sender == e.buyer, "Only buyer");
        require(e.status == Status.AwaitingDelivery, "Invalid status");

        e.status = Status.Complete;

        (bool sent, ) = e.seller.call{value: e.amount}("");
        require(sent, "Transfer failed");

        emit DeliveryConfirmed(_id);
    }

    /**
     * @notice Buyer or seller raises a dispute.
     */
    function disputeEscrow(uint256 _id) external escrowExists(_id) {
        EscrowRecord storage e = escrows[_id];
        require(
            msg.sender == e.buyer || msg.sender == e.seller,
            "Only buyer or seller"
        );
        require(e.status == Status.AwaitingDelivery, "Invalid status");

        e.status = Status.Disputed;

        emit DisputeRaised(_id, msg.sender);
    }

    /**
     * @notice Arbiter resolves a dispute.
     * @param _refundBuyer If true, funds go to buyer; otherwise to seller.
     */
    function resolveDispute(
        uint256 _id,
        bool _refundBuyer
    ) external onlyArbiter escrowExists(_id) {
        EscrowRecord storage e = escrows[_id];
        require(
            e.status == Status.Disputed || e.status == Status.AwaitingDelivery,
            "Cannot resolve: escrow already completed or resolved"
        );

        e.status = Status.Resolved;

        address recipient = _refundBuyer ? e.buyer : e.seller;
        (bool sent, ) = recipient.call{value: e.amount}("");
        require(sent, "Transfer failed");

        emit DisputeResolved(_id, _refundBuyer, e.amount);
    }

    // ── View Helpers ─────────────────────────────────────────────────

    function getEscrow(
        uint256 _id
    )
        external
        view
        escrowExists(_id)
        returns (
            address buyer,
            address seller,
            uint256 amount,
            Status status
        )
    {
        EscrowRecord storage e = escrows[_id];
        return (e.buyer, e.seller, e.amount, e.status);
    }
}
