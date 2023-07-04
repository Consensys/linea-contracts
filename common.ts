import fs from "fs";
import { ethers } from "ethers";

const MAX_GAS_LIMIT = process.env.TX_GAS_LIMIT ? parseInt(process.env.TX_GAS_LIMIT) : 500000000;

function getBatchType(
  numberOfAccountCreates: number,
  numberOfMoCreates: number,
  numberOfMoRedeems: number,
  numberOfAccountUpdates: number,
  numberOfOutboundTransfers: number,
  numberOfInboundTransfers: number,
): ethers.BigNumber {
  const two = ethers.BigNumber.from(2);
  let batchType = ethers.BigNumber.from(0);
  batchType = batchType.add(ethers.BigNumber.from(numberOfAccountCreates));
  batchType = batchType.add(ethers.BigNumber.from(numberOfMoCreates).mul(two.pow(ethers.BigNumber.from(16))));
  batchType = batchType.add(ethers.BigNumber.from(numberOfMoRedeems).mul(two.pow(ethers.BigNumber.from(32))));
  batchType = batchType.add(ethers.BigNumber.from(numberOfAccountUpdates).mul(two.pow(ethers.BigNumber.from(48))));
  batchType = batchType.add(ethers.BigNumber.from(numberOfOutboundTransfers).mul(two.pow(ethers.BigNumber.from(64))));
  batchType = batchType.add(ethers.BigNumber.from(numberOfInboundTransfers).mul(two.pow(ethers.BigNumber.from(80))));
  return batchType;
}

const accountCreateRegex = /AccountCreate([0-9]+)/;
const moneyOrderCreateRegex = /MoneyOrderCreate([0-9]+)/;
const moneyOrderRedeemRegex = /MoneyOrderRedeem([0-9]+)/;
const accountUpdateRegex = /AccountUpdate([0-9]+)/;
const outboundTransferRegex = /OutboundTransfer([0-9]+)/;
const inboundTransferRegex = /InboundTransfer([0-9]+)/;

function matchNumber(filename: string, regex: RegExp): number {
  let number = 0;
  const match = filename.match(regex);
  if (match) {
    number = parseInt(match[1]);
  }
  return number;
}

function getBatchTypeFromFileName(filename: string): ethers.BigNumber {
  const numberOfAccountCreates = matchNumber(filename, accountCreateRegex);
  const numberOfMoCreates = matchNumber(filename, moneyOrderCreateRegex);
  const numberOfMoRedeems = matchNumber(filename, moneyOrderRedeemRegex);
  const numberOfAccountUpdates = matchNumber(filename, accountUpdateRegex);
  const numberOfOutboundTransfers = matchNumber(filename, outboundTransferRegex);
  const numberOfInboundTransfers = matchNumber(filename, inboundTransferRegex);

  return getBatchType(
    numberOfAccountCreates,
    numberOfMoCreates,
    numberOfMoRedeems,
    numberOfAccountUpdates,
    numberOfOutboundTransfers,
    numberOfInboundTransfers,
  );
}

/**
 * Helper function to deal with account JSON files
 * @param {string} filePath full path to file with private key
 */
function getPrivateKeyFromFile(filePath: string): string {
  let privateKey;
  if (fs.existsSync(filePath)) {
    const account = fs.readFileSync(filePath, "utf8");
    privateKey = JSON.parse(account).account_key.priv_key;
  } else {
    console.warn(`Path ${filePath} with private key does not exist`);
  }
  return privateKey;
}

/**
 * Get private key of contract owner, based on several assumptions
 */
function getContractOwnerPrivateKey(
  keyFile: string,
  bridgeOwnerPathOverride: string,
  bridgeOwnerPrivateKeyOverride: string,
): string {
  let contractOwnerJsonPath;

  if (bridgeOwnerPrivateKeyOverride) {
    return bridgeOwnerPrivateKeyOverride;
  } else if (bridgeOwnerPathOverride && fs.existsSync(bridgeOwnerPathOverride)) {
    contractOwnerJsonPath = bridgeOwnerPathOverride;
  } else {
    contractOwnerJsonPath = keyFile;
  }
  return getPrivateKeyFromFile(contractOwnerJsonPath);
}

function getBlockchainNode(): string {
  return process.env.BLOCKCHAIN_NODE || "http://127.0.0.1:8545";
}

function getL2BlockchainNode(): string | undefined {
  return process.env.L2_BLOCKCHAIN_NODE;
}

/**
 * Returns path to JSON file with address of deployed rollup smart config, which contains address and ABI
 * @returns {string}
 */
function getRollupContractConfigPath(): string {
  return process.env.SMC_CONFIG_PATH || "/smart_contract/data/smc_config.json";
}

function getRollupJsonPath(): string {
  return process.env.ROLLUP_JSON_PATH || "/smart_contract/data/rollup.json";
}

export {
  getBatchType,
  MAX_GAS_LIMIT,
  getBatchTypeFromFileName,
  getContractOwnerPrivateKey,
  getBlockchainNode,
  getRollupContractConfigPath,
  getRollupJsonPath,
  getL2BlockchainNode,
};
