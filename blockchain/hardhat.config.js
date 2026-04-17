import "@nomicfoundation/hardhat-toolbox";

/** @type import('hardhat/config').HardhatUserConfig */
export default {
    solidity: "0.8.24",
    networks: {
        hardhat: {
            accounts: {
                count: 20,
                accountsBalance: "100000000000000000", // 0.1 ETH = ₱10,000
            },
        },
        localhost: {
            url: "http://127.0.0.1:8545",
        },
    },
};
