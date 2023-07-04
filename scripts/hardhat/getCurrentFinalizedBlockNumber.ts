/******************************************************************************************
 * npx hardhat run --network zkevm_dev scripts/hardhat/getCurrentFinalizedBlockNumber.ts  *
 *****************************************************************************************/

import { ethers } from "hardhat";
import { requireEnv } from "../hardhat/utils";

async function main() {
  const newContractName = requireEnv("NEW_CONTRACT_NAME");
  const proxyAddress = requireEnv("PROXY_ADDRESS");

  if (!newContractName || !proxyAddress) {
    throw new Error(`PROXY_ADDRESS and CONTRACT_NAME env variables are undefined.`);
  }

  const zkEvmContract = await ethers.getContractAt(newContractName, proxyAddress);
  const blockNum = await zkEvmContract.currentL2BlockNumber();

  console.log(blockNum);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
