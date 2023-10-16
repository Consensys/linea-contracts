import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployFromFactory, requireEnv } from "../scripts/hardhat/utils";
import { getDeployedContractAddress, tryStoreAddress } from "../utils/storeAddress";
import { tryVerifyContractWithConstructorArgs } from "../utils/verifyContract";
import { get1559Fees } from "../scripts/utils";
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  const contractName = "TimeLock";
  const existingContractAddress = await getDeployedContractAddress(contractName, deployments);

  const provider = ethers.provider;

  // This should be the safe
  const timeLockProposers = requireEnv("TIMELOCK_PROPOSERS");

  // This should be the safe
  const timelockExecutors = requireEnv("TIMELOCK_EXECUTORS");

  // This should be the safe
  const adminAddress = requireEnv("TIMELOCK_ADMIN_ADDRESS");

  const minDelay = process.env.MIN_DELAY || 0;

  if (existingContractAddress === undefined) {
    console.log(`Deploying initial version, NB: the address will be saved if env SAVE_ADDRESS=true.`);
  } else {
    console.log(`Deploying new version, NB: ${existingContractAddress} will be overwritten if env SAVE_ADDRESS=true.`);
  }
  const contract = await deployFromFactory(
    contractName,
    provider,
    minDelay,
    timeLockProposers?.split(","),
    timelockExecutors?.split(","),
    adminAddress,
    await get1559Fees(provider),
  );

  console.log(`${contractName} deployed at ${contract.address}`);

  await tryStoreAddress(hre.network.name, contractName, contract.address, contract.deployTransaction.hash);
  const args = [minDelay, timeLockProposers?.split(","), timelockExecutors?.split(","), adminAddress];

  await tryVerifyContractWithConstructorArgs(
    contract.address,
    "contracts/messageService/lib/TimeLock.sol:TimeLock",
    args,
  );
};
export default func;
func.tags = ["Timelock"];
