// Test agnostic script for
import fs from "fs";
import { ethers } from "ethers";
import { getWallet, getProvider } from "./utils";
import { MAX_GAS_LIMIT } from "../common";

async function main() {
  const rollupConfigPath = process.argv[2];
  const contractData = JSON.parse(fs.readFileSync(rollupConfigPath, "utf8"));
  const credentialsFile = process.argv[3];
  const amount = process.argv[4];
  const amountInWei = ethers.utils.parseEther(amount);
  const provider = getProvider();

  console.log(`Going to send ${amount} ETH to ${contractData.address}`);
  const tx = {
    to: contractData.address,
    value: amountInWei,
    gasLimit: MAX_GAS_LIMIT,
  };

  const wallet = getWallet(credentialsFile);

  const result = await wallet.sendTransaction(tx);
  console.log(`Done. ${amount} ETH has been sent in transaction ${result.hash}`);
  const receipt = await provider.waitForTransaction(result.hash, 1);
  if (receipt === null || receipt.status !== 1) {
    console.warn("Transaction status is not successful");
    console.log("Operator registration receipt:");
    console.log(receipt);
    throw new Error("Transaction status is not successful");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
