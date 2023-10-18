import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { requireEnv } from "../scripts/hardhat/utils";
import { getDeployedContractAddress } from "../utils/storeAddress";
import { ethers, upgrades } from "hardhat";
import { tryVerifyContract } from "../utils/verifyContract";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  const contractName = "ZkEvmV2Init";
  const existingContractAddress = await getDeployedContractAddress(contractName, deployments);

  const proxyAddress = requireEnv("ZKEVMV2_ADDRESS");

  const factory = await ethers.getContractFactory("ZkEvmV2");

  if (existingContractAddress === undefined) {
    console.log(`Deploying initial version, NB: the address will be saved if env SAVE_ADDRESS=true.`);
  } else {
    console.log(`Deploying new version, NB: ${existingContractAddress} will be overwritten if env SAVE_ADDRESS=true.`);
  }

  console.log("Deploying V2 Contract...");
  const v2contract = await upgrades.deployImplementation(factory, {
    kind: "transparent",
  });

  const contract = v2contract.toString();

  console.log(`Contract deployed at ${contract}`);

  const upgradeCallUsingSecurityCouncil = ethers.utils.hexConcat([
    "0x99a88ec4",
    ethers.utils.defaultAbiCoder.encode(["address", "address"], [proxyAddress, v2contract]),
  ]);

  console.log("Encoded Tx Upgrade from Security Council:", "\n", upgradeCallUsingSecurityCouncil);

  console.log("\n");

  await tryVerifyContract(contract);
};

export default func;
func.tags = ["ZkEvmV2Implementation"];
