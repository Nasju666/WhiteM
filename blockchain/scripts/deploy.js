import hre from "hardhat";

async function main() {
    const Escrow = await hre.ethers.getContractFactory("Escrow");
    const escrow = await Escrow.deploy();
    await escrow.waitForDeployment();

    const address = await escrow.getAddress();
    console.log(`Escrow deployed to: ${address}`);
    console.log(`Arbiter (deployer): ${(await hre.ethers.getSigners())[0].address}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
