#!/usr/bin/env node

/*
Finds the MessageDispatched events on L2 and prints out each transaction data.

Can be used to find transactions that were supposed to be bridged to L1.

Note that it doesn't check if a given transaction has been bridged or not it only fetches events.

Usage:
ts-node scripts/inspectL2BridgeLogs.ts \
    --l2-bridge-address 0xA59477f7742Ba7d51bb1E487a8540aB339d6801d \
    --from-block 32144  \
    --to-block 32317 \
    --l2-blockchain-url https://archive.dev.zkevm.consensys.net/
*/

import log from "npmlog";
import { providers, utils } from "ethers";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { sanitizeAddress } from "./cli";

const argv = yargs(hideBin(process.argv))
  .option("l2-bridge-address", {
    describe: "Address of the Bridge smart contract on L2",
    type: "string",
    demandOption: true,
    coerce: sanitizeAddress("smc-address"),
  })
  .option("from-block", {
    describe: "Starting block for dispatch events",
    type: "number",
    demandOption: true,
  })
  .option("to-block", {
    describe: "Ending block for dispatch events",
    type: "number",
    demandOption: true,
  })
  .option("l2-blockchain-url", {
    describe: "RPC url for the l2 blockchain",
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
  if (args.verbose) {
    log.level = "verbose";
  }

  const l2Provider = new providers.JsonRpcProvider(args.l2BlockchainUrl);

  const bridgeInterface = new utils.Interface([
    "event MessageDispatched(address,address,uint256,uint256,uint256,bytes)",
  ]);

  const logs = await l2Provider.getLogs({
    address: args.l2BridgeAddress,
    topics: [bridgeInterface.getEventTopic("MessageDispatched")],
    fromBlock: args.fromBlock,
    toBlock: args.toBlock,
  });

  for (const log of logs) {
    console.log(`Transaction hash: ${log.transactionHash}`);
  }

  console.log(`Found ${logs.length} MessageDispatched events between blocks ${args.fromBlock} and ${args.toBlock}`);
}

main(argv)
  .then(() => process.exit(0))
  .catch((error) => {
    log.error("", error);
    process.exit(1);
  });
