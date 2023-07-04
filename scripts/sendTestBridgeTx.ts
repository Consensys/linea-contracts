import fs from "fs";
import { ethers } from "ethers";
import yargs from "yargs";
import { getWallet } from "./utils";

const argv = yargs
  .scriptName("l2")
  .option("credentials", {
    alias: "c",
    description: "Path to the credentials file",
    type: "string",
    demandOption: true,
  })
  .option("bridge", {
    alias: "b",
    description: "Address of the bridge contract",
    type: "string",
    demandOption: true,
  })
  .option("bridgeAbi", {
    alias: "a",
    description: "Path to the bridge contract ABI",
    type: "string",
    demandOption: true,
  })
  .option("to", {
    alias: "t",
    description: "Address of the recipient",
    type: "string",
    demandOption: true,
  })
  .option("value", {
    alias: "v",
    description: "Amount of ETH to send",
    type: "string",
    demandOption: true,
  })
  .help()
  .parseSync();

console.log(argv);

async function main(args: typeof argv) {
  console.log("Send test bridge transaction via L1 bridge");

  const wallet = getWallet(args.credentials);
  const provider = wallet.provider;
  const amountInWei = ethers.utils.parseEther(args.value);

  const contractAbi = JSON.parse(fs.readFileSync(args.bridgeAbi, "utf8"));

  const bridge = new ethers.Contract(args.bridge, contractAbi, wallet);

  console.log("Sending the transaction to the bridge");
  const result = await bridge.relayMessage(args.to, [], {
    value: amountInWei,
    gasPrice: 10000,
  });

  console.log(`Done. ${argv.value} ETH has been sent in transaction ${result.hash}`);

  const receipt = await provider.waitForTransaction(result.hash, 1);
  console.log(receipt);
}

main(argv)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
