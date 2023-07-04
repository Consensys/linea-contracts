import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import * as dotenv from "dotenv";
import "hardhat-tracer";
import { HardhatUserConfig } from "hardhat/config";
import { MAX_GAS_LIMIT, getBlockchainNode, getContractOwnerPrivateKey, getL2BlockchainNode } from "./common";

dotenv.config();

const BLOCKCHAIN_TIMEOUT = process.env.BLOCKCHAIN_TIMEOUT_MS ? parseInt(process.env.BLOCKCHAIN_TIMEOUT_MS) : 300000;

const blockchainNode = getBlockchainNode();
const l2BlockchainNode = getL2BlockchainNode();

const ownerPrivateKey = getContractOwnerPrivateKey(
  "../node-data/test/keys/contract_owner.acc",
  "/node-data/test/keys/contract_owner.acc",
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  process.env.L1_ROLLUP_OWNER_PRIVATE_KEY!,
);

const accounts = [];

if (ownerPrivateKey) {
  accounts.push(ownerPrivateKey);
}

const config: HardhatUserConfig = {
  paths: {
    artifacts: "./build",
  },
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100000,
          },
        },
      },
      {
        version: "0.8.15",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100000,
          },
        },
      },
    ],
  },
  networks: {
    besu: {
      url: blockchainNode,
      accounts,
      gasPrice: 0,
      gas: MAX_GAS_LIMIT,
      blockGasLimit: MAX_GAS_LIMIT,
      timeout: BLOCKCHAIN_TIMEOUT,
    },
    ganache: {
      url: "http://127.0.0.1:8545",
      accounts,
      gasPrice: 0,
      gas: MAX_GAS_LIMIT,
      blockGasLimit: MAX_GAS_LIMIT,
      timeout: BLOCKCHAIN_TIMEOUT,
    },
    zkevm_dev: {
      url: blockchainNode,
      accounts,
      timeout: BLOCKCHAIN_TIMEOUT,
    },
    ...(l2BlockchainNode
      ? {
          l2: {
            url: l2BlockchainNode,
            accounts,
            allowUnlimitedContractSize: true,
            timeout: 300000,
          },
        }
      : {}),
  },
  gasReporter: {
    enabled: !!process.env.REPORT_GAS,
  },
  mocha: {
    timeout: 20000,
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY ?? "",
      goerli: process.env.ETHERSCAN_API_KEY ?? "",
      l2: process.env.LINEASCAN_API_KEY ?? "",
      // TODO Add for linea mainnet
    },
    customChains: [
      {
        network: "l2",
        chainId: 59140,
        urls: {
          apiURL: "https://api-goerli.lineascan.build/api",
          browserURL: "https://goerli.lineascan.build/",
        },
      },
    ],
  },
};

export default config;
