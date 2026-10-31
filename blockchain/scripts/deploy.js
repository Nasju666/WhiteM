import hre from "hardhat";
import { writeFileSync } from "node:fs";

// Official Circle USDC addresses. Re-check at
// https://developers.circle.com/stablecoins/usdc-contract-addresses before mainnet use.
const USDC_BY_CHAIN = {
    8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet
    84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
};
const LOCAL_CHAINS = new Set([31337, 1337]);

async function main() {
    const { ethers, network } = hre;
    const chainId = Number((await ethers.provider.getNetwork()).chainId);
    const [deployer, ...others] = await ethers.getSigners();

    const feeBps = Number(process.env.ESCROW_FEE_BPS || 0);
    const releaseDays = Number(process.env.ESCROW_AUTO_RELEASE_DAYS || 14);

    // ── Payment token ──
    let tokenAddress = process.env.USDC_TOKEN_ADDRESS || USDC_BY_CHAIN[chainId];
    // A fresh local node forgets old contracts: only reuse a token that still exists.
    if (tokenAddress && (await ethers.provider.getCode(tokenAddress)) === "0x") {
        if (!LOCAL_CHAINS.has(chainId)) {
            throw new Error(`No contract at USDC_TOKEN_ADDRESS ${tokenAddress} on chain ${chainId}.`);
        }
        tokenAddress = undefined;
    }
    if (!tokenAddress && LOCAL_CHAINS.has(chainId)) {
        const Mock = await ethers.getContractFactory("MockUSDC");
        const mock = await Mock.deploy();
        await mock.waitForDeployment();
        tokenAddress = await mock.getAddress();

        // Give every local test account 10,000 USDC
        const amount = 10_000n * 10n ** 6n;
        for (const s of [deployer, ...others]) {
            await (await mock.mint(s.address, amount)).wait();
        }
        console.log(`MockUSDC deployed to: ${tokenAddress} (10,000 USDC minted to each local account)`);
    }
    if (!tokenAddress) {
        throw new Error(`No USDC address known for chain ${chainId}. Set USDC_TOKEN_ADDRESS.`);
    }

    // ── Escrow ──
    const Escrow = await ethers.getContractFactory("Escrow");
    const escrow = await Escrow.deploy(tokenAddress, feeBps, releaseDays * 24 * 60 * 60);
    await escrow.waitForDeployment();
    const escrowAddress = await escrow.getAddress();
    const deployTx = escrow.deploymentTransaction();
    const receipt = deployTx ? await deployTx.wait() : null;

    // ── Export ABI for the Django backend ──
    const artifact = await hre.artifacts.readArtifact("Escrow");
    const abiJson = JSON.stringify(artifact.abi, null, 2);
    writeFileSync(new URL("../../core/escrow_abi.json", import.meta.url), abiJson);
    writeFileSync(new URL("../../frontend/js/escrow_abi.json", import.meta.url), abiJson);

    console.log(`\nNetwork: ${network.name} (chain ${chainId})`);
    console.log(`Escrow deployed to: ${escrowAddress}`);
    console.log(`Arbiter (deployer): ${deployer.address}`);
    console.log(`Fee: ${feeBps} bps, auto-release after ${releaseDays} days`);
    console.log(`\nAdd these to the project .env:\n`);
    console.log(`CHAIN_ID=${chainId}`);
    console.log(`ESCROW_CONTRACT_ADDRESS=${escrowAddress}`);
    console.log(`USDC_TOKEN_ADDRESS=${tokenAddress}`);
    if (receipt) console.log(`ESCROW_DEPLOY_BLOCK=${receipt.blockNumber}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
