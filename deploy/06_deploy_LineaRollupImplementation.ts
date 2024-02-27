import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { requireEnv } from "../scripts/hardhat/utils";
import { getDeployedContractAddress } from "../utils/storeAddress";
import { ethers, upgrades } from "hardhat";
import { tryVerifyContract } from "../utils/verifyContract";
import { validateDeployBranchAndTags } from "../utils/auditedDeployVerifier";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  validateDeployBranchAndTags(hre.network.name);

  const contractName = "LineaRollup";
  const existingContractAddress = await getDeployedContractAddress(contractName, deployments);

  const proxyAddress = requireEnv("LINEA_ROLLUP_ADDRESS");

  const factory = await ethers.getContractFactory("LineaRollup");

  if (existingContractAddress === undefined) {
    console.log(`Deploying initial version, NB: the address will be saved if env SAVE_ADDRESS=true.`);
  } else {
    console.log(`Deploying new version, NB: ${existingContractAddress} will be overwritten if env SAVE_ADDRESS=true.`);
  }

  console.log("Deploying Contract...");
  const newContract = await upgrades.deployImplementation(factory, {
    kind: "transparent",
  });

  const contract = newContract.toString();

  console.log(`Contract deployed at ${contract}`);

  const upgradeCallUsingSecurityCouncil = ethers.utils.hexConcat([
    "0x99a88ec4",
    ethers.utils.defaultAbiCoder.encode(["address", "address"], [proxyAddress, newContract]),
  ]);

  console.log("Encoded Tx Upgrade from Security Council:", "\n", upgradeCallUsingSecurityCouncil);

  console.log("\n");

  await tryVerifyContract(contract);
};

export default func;
func.tags = ["LineaRollupImplementation"];
