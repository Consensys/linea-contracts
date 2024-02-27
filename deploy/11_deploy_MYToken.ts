import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployFromFactory, requireEnv } from "../scripts/hardhat/utils";
import { getDeployedContractAddress, tryStoreAddress } from "../utils/storeAddress";
import { tryVerifyContractWithConstructorArgs } from "../utils/verifyContract";
import { ethers } from "hardhat";
import { get1559Fees } from "../scripts/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  const contractName = "MyToken";
  const existingContractAddress = await getDeployedContractAddress(contractName, deployments);
  const provider = ethers.provider;

  const adminAddress = requireEnv("MYTOKEN_ADMIN_ADDRESS");

  if (existingContractAddress === undefined) {
    console.log(`Deploying initial version, NB: the address will be saved if env SAVE_ADDRESS=true.`);
  } else {
    console.log(`Deploying new version, NB: ${existingContractAddress} will be overwritten if env SAVE_ADDRESS=true.`);
  }
  const contract = await deployFromFactory(contractName, provider, adminAddress, await get1559Fees(provider));

  console.log(`${contractName} deployed at ${contract.address}`);

  await tryStoreAddress(hre.network.name, contractName, contract.address, contract.deployTransaction.hash);

  const args = [adminAddress];

  await tryVerifyContractWithConstructorArgs(contract.address, "contracts/token/MyToken.sol:MyToken", args);
};
export default func;
func.tags = ["MYToken"];
