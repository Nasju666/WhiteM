import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

const DAY = 24 * 60 * 60;
const RELEASE_PERIOD = 14 * DAY;
const usdc = (n) => ethers.parseUnits(String(n), 6);

async function increaseTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
}

describe("Escrow (USDC)", function () {
    let token, escrow, escrowAddr;
    let arbiter, buyer, seller, stranger, treasury;
    const AMOUNT = usdc(100);
    const ORDER_ID = 42n;

    async function deploy(feeBps = 0) {
        const Escrow = await ethers.getContractFactory("Escrow", arbiter);
        escrow = await Escrow.deploy(await token.getAddress(), feeBps, RELEASE_PERIOD);
        await escrow.waitForDeployment();
        escrowAddr = await escrow.getAddress();
    }

    async function fund(orderId = ORDER_ID, amount = AMOUNT) {
        await token.connect(buyer).approve(escrowAddr, amount);
        return escrow.connect(buyer).createEscrow(orderId, seller.address, amount);
    }

    beforeEach(async function () {
        [arbiter, buyer, seller, stranger, treasury] = await ethers.getSigners();
        const Mock = await ethers.getContractFactory("MockUSDC");
        token = await Mock.deploy();
        await token.waitForDeployment();
        await token.mint(buyer.address, usdc(1000));
        await deploy();
    });

    // ── Constructor ──────────────────────────────────────────────────

    describe("constructor", function () {
        it("sets token, arbiter and parameters", async function () {
            expect(await escrow.token()).to.equal(await token.getAddress());
            expect(await escrow.arbiter()).to.equal(arbiter.address);
            expect(await escrow.feeRecipient()).to.equal(arbiter.address);
            expect(await escrow.autoReleasePeriod()).to.equal(RELEASE_PERIOD);
        });

        it("rejects fee above cap", async function () {
            const Escrow = await ethers.getContractFactory("Escrow");
            await expect(
                Escrow.deploy(await token.getAddress(), 1001, RELEASE_PERIOD)
            ).to.be.revertedWith("Fee too high");
        });
    });

    // ── Creation ─────────────────────────────────────────────────────

    describe("createEscrow", function () {
        it("pulls tokens and records the escrow", async function () {
            await fund();
            const e = await escrow.getEscrow(0);
            expect(e.buyer).to.equal(buyer.address);
            expect(e.seller).to.equal(seller.address);
            expect(e.amount).to.equal(AMOUNT);
            expect(e.orderId).to.equal(ORDER_ID);
            expect(e.status).to.equal(0n);
            expect(await token.balanceOf(escrowAddr)).to.equal(AMOUNT);

            const [exists, id] = await escrow.escrowIdForOrder(buyer.address, ORDER_ID);
            expect(exists).to.equal(true);
            expect(id).to.equal(0n);
        });

        it("a third party funding the same order ID does not block the buyer", async function () {
            await token.mint(stranger.address, usdc(1));
            await token.connect(stranger).approve(escrowAddr, usdc(1));
            await escrow.connect(stranger).createEscrow(ORDER_ID, seller.address, usdc(1));

            await fund(); // real buyer still succeeds
            const [exists, id] = await escrow.escrowIdForOrder(buyer.address, ORDER_ID);
            expect(exists).to.equal(true);
            expect(id).to.equal(1n);
        });

        it("emits EscrowCreated with orderId", async function () {
            await token.connect(buyer).approve(escrowAddr, AMOUNT);
            await expect(escrow.connect(buyer).createEscrow(ORDER_ID, seller.address, AMOUNT))
                .to.emit(escrow, "EscrowCreated")
                .withArgs(0, ORDER_ID, buyer.address, seller.address, AMOUNT, (v) => v > 0n);
        });

        it("rejects funding the same order twice", async function () {
            await fund();
            await token.connect(buyer).approve(escrowAddr, AMOUNT);
            await expect(
                escrow.connect(buyer).createEscrow(ORDER_ID, seller.address, AMOUNT)
            ).to.be.revertedWith("Order already funded");
        });

        it("rejects zero amount", async function () {
            await expect(
                escrow.connect(buyer).createEscrow(ORDER_ID, seller.address, 0)
            ).to.be.revertedWith("Deposit required");
        });

        it("rejects buyer == seller", async function () {
            await expect(
                escrow.connect(buyer).createEscrow(ORDER_ID, buyer.address, AMOUNT)
            ).to.be.revertedWith("Buyer cannot be seller");
        });

        it("reverts without approval", async function () {
            await expect(
                escrow.connect(buyer).createEscrow(ORDER_ID, seller.address, AMOUNT)
            ).to.be.reverted;
        });
    });

    // ── Confirm Delivery ─────────────────────────────────────────────

    describe("confirmDelivery", function () {
        beforeEach(async () => { await fund(); });

        it("pays the seller in full when fee is 0", async function () {
            await escrow.connect(buyer).confirmDelivery(0);
            expect(await token.balanceOf(seller.address)).to.equal(AMOUNT);
            expect((await escrow.getEscrow(0)).status).to.equal(1n);
        });

        it("emits DeliveryConfirmed", async function () {
            await expect(escrow.connect(buyer).confirmDelivery(0))
                .to.emit(escrow, "DeliveryConfirmed").withArgs(0);
        });

        it("only buyer can confirm", async function () {
            await expect(escrow.connect(seller).confirmDelivery(0)).to.be.revertedWith("Only buyer");
        });

        it("cannot confirm twice", async function () {
            await escrow.connect(buyer).confirmDelivery(0);
            await expect(escrow.connect(buyer).confirmDelivery(0)).to.be.revertedWith("Invalid status");
        });
    });

    // ── Platform fee ─────────────────────────────────────────────────

    describe("platform fee", function () {
        beforeEach(async function () {
            await deploy(150); // 1.5%
            await escrow.connect(arbiter).setFeeRecipient(treasury.address);
            await fund();
        });

        it("splits payout between seller and fee recipient", async function () {
            await escrow.connect(buyer).confirmDelivery(0);
            expect(await token.balanceOf(treasury.address)).to.equal(usdc("1.5"));
            expect(await token.balanceOf(seller.address)).to.equal(usdc("98.5"));
        });

        it("refunds to buyer carry no fee", async function () {
            const before = await token.balanceOf(buyer.address);
            await escrow.connect(arbiter).resolveDispute(0, true);
            expect((await token.balanceOf(buyer.address)) - before).to.equal(AMOUNT);
            expect(await token.balanceOf(treasury.address)).to.equal(0n);
        });
    });

    // ── Auto-release ─────────────────────────────────────────────────

    describe("releaseExpired", function () {
        beforeEach(async () => { await fund(); });

        it("cannot release before deadline", async function () {
            await expect(escrow.connect(stranger).releaseExpired(0)).to.be.revertedWith("Not yet releasable");
        });

        it("anyone can release to seller after deadline", async function () {
            await increaseTime(RELEASE_PERIOD + 1);
            await expect(escrow.connect(stranger).releaseExpired(0))
                .to.emit(escrow, "AutoReleased").withArgs(0);
            expect(await token.balanceOf(seller.address)).to.equal(AMOUNT);
        });

        it("a dispute blocks auto-release", async function () {
            await escrow.connect(buyer).disputeEscrow(0);
            await increaseTime(RELEASE_PERIOD + 1);
            await expect(escrow.connect(stranger).releaseExpired(0)).to.be.revertedWith("Invalid status");
        });
    });

    // ── Dispute ──────────────────────────────────────────────────────

    describe("disputeEscrow", function () {
        beforeEach(async () => { await fund(); });

        for (const who of ["buyer", "seller", "arbiter"]) {
            it(`${who} can raise a dispute`, async function () {
                const signer = { buyer, seller, arbiter }[who];
                await expect(escrow.connect(signer).disputeEscrow(0))
                    .to.emit(escrow, "DisputeRaised").withArgs(0, signer.address);
                expect((await escrow.getEscrow(0)).status).to.equal(2n);
            });
        }

        it("stranger cannot dispute", async function () {
            await expect(escrow.connect(stranger).disputeEscrow(0))
                .to.be.revertedWith("Only buyer, seller or arbiter");
        });
    });

    // ── Seller refund ────────────────────────────────────────────────

    describe("refundBuyer", function () {
        beforeEach(async () => { await fund(); });

        it("seller returns full amount to buyer", async function () {
            const before = await token.balanceOf(buyer.address);
            await expect(escrow.connect(seller).refundBuyer(0)).to.emit(escrow, "RefundedBySeller");
            expect((await token.balanceOf(buyer.address)) - before).to.equal(AMOUNT);
            expect((await escrow.getEscrow(0)).status).to.equal(4n);
        });

        it("only seller can refund", async function () {
            await expect(escrow.connect(buyer).refundBuyer(0)).to.be.revertedWith("Only seller");
        });
    });

    // ── Resolve Dispute ──────────────────────────────────────────────

    describe("resolveDispute", function () {
        beforeEach(async function () {
            await fund();
            await escrow.connect(buyer).disputeEscrow(0);
        });

        it("refunds buyer", async function () {
            const before = await token.balanceOf(buyer.address);
            await escrow.connect(arbiter).resolveDispute(0, true);
            expect((await token.balanceOf(buyer.address)) - before).to.equal(AMOUNT);
            expect((await escrow.getEscrow(0)).status).to.equal(3n);
        });

        it("pays seller", async function () {
            await escrow.connect(arbiter).resolveDispute(0, false);
            expect(await token.balanceOf(seller.address)).to.equal(AMOUNT);
        });

        it("emits DisputeResolved", async function () {
            await expect(escrow.connect(arbiter).resolveDispute(0, true))
                .to.emit(escrow, "DisputeResolved").withArgs(0, true, AMOUNT);
        });

        it("only arbiter can resolve", async function () {
            await expect(escrow.connect(buyer).resolveDispute(0, true)).to.be.revertedWith("Only arbiter");
        });

        it("cannot resolve twice", async function () {
            await escrow.connect(arbiter).resolveDispute(0, true);
            await expect(escrow.connect(arbiter).resolveDispute(0, false))
                .to.be.revertedWith("Cannot resolve: escrow already settled");
        });
    });

    // ── Admin ────────────────────────────────────────────────────────

    describe("admin", function () {
        it("arbiter can be transferred", async function () {
            await escrow.connect(arbiter).transferArbiter(stranger.address);
            expect(await escrow.arbiter()).to.equal(stranger.address);
            await expect(escrow.connect(arbiter).setFeeRecipient(treasury.address))
                .to.be.revertedWith("Only arbiter");
        });
    });
});
