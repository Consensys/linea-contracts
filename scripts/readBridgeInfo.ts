#!/usr/bin/env node

/*
Description:
Read only script to print out some useful info about a bridge contract.

Usage:
ts-node scripts/readBridgeInfo.ts \
    --smc-address 0xE87d317eB8dcc9afE24d9f63D6C760e52Bc18A40 \
    --blockchain-url https://goerli.infura.io/v3/$INFURA_KEY

*/

import log from "npmlog";
import { ethers } from "ethers";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { sanitizeAddress } from "./cli";

const argv = yargs(hideBin(process.argv))
  .option("smc-address", {
    describe: "rollup smart contract address",
    type: "string",
    demandOption: true,
    coerce: sanitizeAddress("smc-address"),
  })
  .option("blockchain-url", {
    describe: "blockchain url",
    type: "string",
    demandOption: true,
  })
  .option("verbose", {
    describe: "verbose logs",
    type: "boolean",
    default: false,
    demandOption: false,
  })
  .parseSync();

async function main(args: typeof argv) {
  log.info("Script arguments:", JSON.stringify(args));
  if (args.verbose) {
    log.level = "verbose";
  }

  const provider = new ethers.providers.JsonRpcProvider(args.blockchainUrl);

  const smcInterface = new ethers.utils.Interface([
    "function minimumFee() view returns (uint256)",
    "function callGasLimit() view returns (uint256)",
    "function minimumDeadline() view returns (uint256)",
  ]);

  const contract = new ethers.Contract(args.smcAddress, smcInterface, provider);

  let minimumFee = contract.minimumFee();
  let callGasLimit = contract.callGasLimit();
  let minimumDeadline = contract.minimumDeadline();

  [minimumFee, callGasLimit, minimumDeadline] = await Promise.all([minimumFee, callGasLimit, minimumDeadline]);

  log.info("Minimum fee:", minimumFee.toString());
  log.info("Call gas limit:", callGasLimit.toString());
  log.info("Minimum deadline:", minimumDeadline.toString());
}

main(argv)
  .then(() => process.exit(0))
  .catch((error) => {
    log.error("", error);
    process.exit(1);
  });
