import { ethers, upgrades, network } from "hardhat";
import { getDeployedContractAddress, tryStoreAddress } from "../utils/storeAddress";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { tryVerifyContract } from "../utils/verifyContract";
import { validateDeployBranchAndTags } from "../utils/auditedDeployVerifier";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  validateDeployBranchAndTags(hre.network.name);

  const contractName = "BridgedToken";
  const existingContractAddress = await getDeployedContractAddress(contractName, deployments);

  const [owner] = await ethers.getSigners();
  const chainId = await owner.getChainId();
  console.log(`Current network's chainId is ${chainId}`);

  if (existingContractAddress === undefined) {
    console.log(`Deploying initial version, NB: the address will be saved if env SAVE_ADDRESS=true.`);
  } else {
    console.log(`Deploying new version, NB: ${existingContractAddress} will be overwritten if env SAVE_ADDRESS=true.`);
  }

  // Deploy beacon for bridged token
  const BridgedToken = await ethers.getContractFactory(contractName);

  const bridgedToken = await upgrades.deployBeacon(BridgedToken);
  await bridgedToken.deployed();

  process.env.BRIDGED_TOKEN_ADDRESS = bridgedToken.address;

  await tryStoreAddress(network.name, contractName, bridgedToken.address, bridgedToken.deployTransaction.hash);

  console.log(`BridgedToken beacon deployed on ${network.name}, at address:`, bridgedToken.address);

  await tryVerifyContract(bridgedToken.address);
};
export default func;
func.tags = ["BridgedToken"];
