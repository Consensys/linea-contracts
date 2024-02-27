import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployFromFactory } from "../scripts/hardhat/utils";
import { getDeployedContractAddress, tryStoreAddress } from "../utils/storeAddress";
import { tryVerifyContract } from "../utils/verifyContract";
import { validateDeployBranchAndTags } from "../utils/auditedDeployVerifier";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  validateDeployBranchAndTags(hre.network.name);

  const { deployments } = hre;
  const contractName = "IntegrationTestTrueVerifier";
  const existingContractAddress = await getDeployedContractAddress(contractName, deployments);

  if (existingContractAddress === undefined) {
    console.log(`Deploying initial version, NB: the address will be saved if env SAVE_ADDRESS=true.`);
  } else {
    console.log(`Deploying new version, NB: ${existingContractAddress} will be overwritten if env SAVE_ADDRESS=true.`);
  }
  const contract = await deployFromFactory(contractName);
  console.log(`${contractName} deployed at ${contract.address}`);

  process.env.PLONKVERIFIER_ADDRESS = contract.address;

  await tryStoreAddress(hre.network.name, contractName, contract.address, contract.deployTransaction.hash);

  await tryVerifyContract(contract.address);
};
export default func;
func.tags = ["IntegrationTestTrueVerifier"];
