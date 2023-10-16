import { ethers, upgrades } from "hardhat";
import { requireEnv } from "../hardhat/utils";

async function main() {
  const newContractName = requireEnv("NEW_CONTRACT_NAME");
  const oldContractName = requireEnv("OLD_CONTRACT_NAME");
  const proxyAddress = requireEnv("PROXY_ADDRESS");
  const initialL2BlockNumber = requireEnv("ZKEVMV2_INITIAL_L2_BLOCK_NUMBER");
  const initialStateRootHash = requireEnv("ZKEVMV2_INITIAL_STATE_ROOT_HASH");

  if (!newContractName || !proxyAddress) {
    throw new Error(`PROXY_ADDRESS and CONTRACT_NAME env variables are undefined.`);
  }
  console.log(`Upgrading contract at ${proxyAddress}`);

  const oldContract = await ethers.getContractFactory(oldContractName);
  const newContract = await ethers.getContractFactory(newContractName);

  console.log("Importing contract");
  await upgrades.forceImport(proxyAddress, oldContract, {
    kind: "transparent",
  });

  try {
    await upgrades.validateUpgrade(proxyAddress, newContract, {
      kind: "transparent",
    });

    await upgrades.upgradeProxy(proxyAddress, newContract, {
      call: { fn: "initializeV2", args: [initialL2BlockNumber, initialStateRootHash] },
      kind: "transparent",
    });

    console.log(`Upgraded contract at ${proxyAddress} with a new version of ${newContractName}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("Failed to upgrade the proxy contract", error.message);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
