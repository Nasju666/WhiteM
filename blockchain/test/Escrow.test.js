import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("Escrow", function () {
    let escrow;
    let arbiter, buyer, seller, stranger;

    const ONE_ETH = ethers.parseEther("1.0");

    beforeEach(async function () {
        [arbiter, buyer, seller, stranger] = await ethers.getSigners();
        const Escrow = await ethers.getContractFactory("Escrow", arbiter);
        escrow = await Escrow.deploy();
        await escrow.waitForDeployment();
    });

    // ── Creation ─────────────────────────────────────────────────────

    describe("createEscrow", function () {
        it("should create an escrow and hold the deposit", async function () {
            await escrow
                .connect(buyer)
                .createEscrow(seller.address, { value: ONE_ETH });

            const e = await escrow.getEscrow(0);
            expect(e.buyer).to.equal(buyer.address);
            expect(e.seller).to.equal(seller.address);
            expect(e.amount).to.equal(ONE_ETH);
            expect(e.status).to.equal(0n); // AwaitingDelivery

            // Contract balance should hold the deposit
            const balance = await ethers.provider.getBalance(
                await escrow.getAddress()
            );
            expect(balance).to.equal(ONE_ETH);
        });

        it("should emit EscrowCreated event", async function () {
            await expect(
                escrow.connect(buyer).createEscrow(seller.address, { value: ONE_ETH })
            )
                .to.emit(escrow, "EscrowCreated")
                .withArgs(0, buyer.address, seller.address, ONE_ETH);
        });

        it("should revert with zero deposit", async function () {
            await expect(
                escrow.connect(buyer).createEscrow(seller.address, { value: 0 })
            ).to.be.revertedWith("Deposit required");
        });

        it("should revert if buyer == seller", async function () {
            await expect(
                escrow.connect(buyer).createEscrow(buyer.address, { value: ONE_ETH })
            ).to.be.revertedWith("Buyer cannot be seller");
        });
    });

    // ── Confirm Delivery ─────────────────────────────────────────────

    describe("confirmDelivery", function () {
        beforeEach(async function () {
            await escrow
                .connect(buyer)
                .createEscrow(seller.address, { value: ONE_ETH });
        });

        it("should transfer funds to seller on confirmation", async function () {
            const sellerBefore = await ethers.provider.getBalance(seller.address);

            await escrow.connect(buyer).confirmDelivery(0);

            const sellerAfter = await ethers.provider.getBalance(seller.address);
            expect(sellerAfter - sellerBefore).to.equal(ONE_ETH);

            const e = await escrow.getEscrow(0);
            expect(e.status).to.equal(1n); // Complete
        });

        it("should emit DeliveryConfirmed event", async function () {
            await expect(escrow.connect(buyer).confirmDelivery(0))
                .to.emit(escrow, "DeliveryConfirmed")
                .withArgs(0);
        });

        it("should revert if called by non-buyer", async function () {
            await expect(
                escrow.connect(seller).confirmDelivery(0)
            ).to.be.revertedWith("Only buyer");
        });

        it("should revert if already completed", async function () {
            await escrow.connect(buyer).confirmDelivery(0);
            await expect(
                escrow.connect(buyer).confirmDelivery(0)
            ).to.be.revertedWith("Invalid status");
        });
    });

    // ── Dispute ──────────────────────────────────────────────────────

    describe("disputeEscrow", function () {
        beforeEach(async function () {
            await escrow
                .connect(buyer)
                .createEscrow(seller.address, { value: ONE_ETH });
        });

        it("should allow buyer to raise dispute", async function () {
            await escrow.connect(buyer).disputeEscrow(0);
            const e = await escrow.getEscrow(0);
            expect(e.status).to.equal(2n); // Disputed
        });

        it("should allow seller to raise dispute", async function () {
            await escrow.connect(seller).disputeEscrow(0);
            const e = await escrow.getEscrow(0);
            expect(e.status).to.equal(2n);
        });

        it("should emit DisputeRaised event", async function () {
            await expect(escrow.connect(buyer).disputeEscrow(0))
                .to.emit(escrow, "DisputeRaised")
                .withArgs(0, buyer.address);
        });

        it("should revert if called by stranger", async function () {
            await expect(
                escrow.connect(stranger).disputeEscrow(0)
            ).to.be.revertedWith("Only buyer or seller");
        });
    });

    // ── Resolve Dispute ──────────────────────────────────────────────

    describe("resolveDispute", function () {
        beforeEach(async function () {
            await escrow
                .connect(buyer)
                .createEscrow(seller.address, { value: ONE_ETH });
            await escrow.connect(buyer).disputeEscrow(0);
        });

        it("should refund buyer when arbiter resolves in buyer favor", async function () {
            const buyerBefore = await ethers.provider.getBalance(buyer.address);

            await escrow.connect(arbiter).resolveDispute(0, true);

            const buyerAfter = await ethers.provider.getBalance(buyer.address);
            expect(buyerAfter - buyerBefore).to.equal(ONE_ETH);

            const e = await escrow.getEscrow(0);
            expect(e.status).to.equal(3n); // Resolved
        });

        it("should pay seller when arbiter resolves in seller favor", async function () {
            const sellerBefore = await ethers.provider.getBalance(seller.address);

            await escrow.connect(arbiter).resolveDispute(0, false);

            const sellerAfter = await ethers.provider.getBalance(seller.address);
            expect(sellerAfter - sellerBefore).to.equal(ONE_ETH);
        });

        it("should emit DisputeResolved event", async function () {
            await expect(escrow.connect(arbiter).resolveDispute(0, true))
                .to.emit(escrow, "DisputeResolved")
                .withArgs(0, true, ONE_ETH);
        });

        it("should revert if called by non-arbiter", async function () {
            await expect(
                escrow.connect(buyer).resolveDispute(0, true)
            ).to.be.revertedWith("Only arbiter");
        });

        it("should revert if escrow is not disputed", async function () {
            // Create a second escrow that is NOT disputed
            await escrow
                .connect(buyer)
                .createEscrow(seller.address, { value: ONE_ETH });
            await expect(
                escrow.connect(arbiter).resolveDispute(1, true)
            ).to.be.revertedWith("Not disputed");
        });
    });
});
