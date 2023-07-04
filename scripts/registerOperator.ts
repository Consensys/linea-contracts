import fs from "fs";
import { ethers } from "ethers";
import { getWallet, getProvider, get1559Fees } from "./utils";
import { getRollupContractConfigPath } from "../common";

async function main() {
  console.log("Going to register operator in smart contract");
  const rollupConfigJson = fs.readFileSync(getRollupContractConfigPath(), "utf8");
  const rollupConfig = JSON.parse(rollupConfigJson);

  const rollupConfigPath = process.argv[2];
  const contractData = JSON.parse(fs.readFileSync(rollupConfigPath, "utf8"));
  console.log("Contract address to register: ", contractData.address);

  const contractOwnerCredentialsFile = process.argv[3];

  const operatorCredentialsFile = process.argv[4];

  const wallet = getWallet(contractOwnerCredentialsFile);
  const provider = getProvider();
  const rollup = new ethers.Contract(contractData.address, contractData.abi, wallet);

  let result;

  if (
    rollupConfig.rollup_type === "Consensus" ||
    rollupConfig.rollup_type === "ConsensusGeneralProgrammability" ||
    rollupConfig.rollup_type === "ZkEvm"
  ) {
    const { account_key: accountKey } = JSON.parse(fs.readFileSync(operatorCredentialsFile, "utf8"));
    console.log(
      `Going to register operator ${accountKey.addr} from file ${operatorCredentialsFile} in consensus rollup`,
    );
    result = await rollup.registerOperator(accountKey.addr, get1559Fees(provider));
  } else if (rollupConfig.rollup_type === "PaZkp") {
    const { account_key: accountKey, encryption_key: encryptionKey } = JSON.parse(
      fs.readFileSync(operatorCredentialsFile, "utf8"),
    );
    console.log(
      `Going to register operator ${accountKey.addr} from file ${operatorCredentialsFile} in partially anonymous rollup`,
    );
    const encryptionKeyHexPrefixed = "0x" + encryptionKey.public_key;
    const encryptionKeyBytes = ethers.utils.arrayify(encryptionKeyHexPrefixed);
    result = await rollup.registerOperator(accountKey.addr, Array.from(encryptionKeyBytes), get1559Fees(provider));
  } else {
    throw new Error(`Unknown rollup type: ${rollupConfig.rollup_type}`);
  }

  console.log(`Operator has been registered ${result.hash}`);
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
