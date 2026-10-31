import "@nomicfoundation/hardhat-toolbox";

// Load the project-root .env (same file Django uses), if present.
try {
    process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
    /* no .env — rely on real environment variables */
}

// Deployer = arbiter. Only needed for public networks.
const deployerKey = process.env.ARBITER_PRIVATE_KEY;
const remoteAccounts = deployerKey ? [deployerKey] : [];

/** @type import('hardhat/config').HardhatUserConfig */
export default {
    solidity: {
        version: "0.8.24",
        settings: { optimizer: { enabled: true, runs: 200 } },
    },
    networks: {
        hardhat: {
            accounts: {
                count: 20,
                accountsBalance: "10000000000000000000", // 10 ETH each, for gas only
            },
        },
        localhost: {
            url: "http://127.0.0.1:8545",
        },

        // ── Base (Ethereum L2, fees are fractions of a cent) ──
        baseSepolia: {
            url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
            chainId: 84532,
            accounts: remoteAccounts,
        },
        base: {
            url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
            chainId: 8453,
            accounts: remoteAccounts,
        },
    },
};
