import fs from "fs";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import path from "path";
import { deployUpgradableWithAbiAndByteCode, requireEnv } from "../scripts/hardhat/utils";
import { validateDeployBranchAndTags } from "../utils/auditedDeployVerifier";
import { getDeployedContractAddress, tryStoreAddress } from "../utils/storeAddress";
import { tryVerifyContract } from "../utils/verifyContract";
import { abi, bytecode } from "./V1/L2MessageServiceV1Deployed.json";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  validateDeployBranchAndTags(hre.network.name);

  const mainnetDeployedL2MessageServiceCacheFolder = path.resolve("./deploy/V1/L2MessageServiceV1Cache/");

  const validationFilePath = path.join(hre.config.paths.cache, "validations.json");
  const validationFileBackupPath = path.join(hre.config.paths.cache, "validations_backup.json");

  if (fs.existsSync(validationFilePath)) {
    fs.copyFileSync(validationFilePath, validationFileBackupPath);
  }

  fs.copyFileSync(path.join(mainnetDeployedL2MessageServiceCacheFolder, "validations.json"), validationFilePath);

  const contractName = "L2MessageServiceLineaMainnet";
  const existingContractAddress = await getDeployedContractAddress(contractName, deployments);

  const L2MessageService_securityCouncil = requireEnv("L2MSGSERVICE_SECURITY_COUNCIL");
  const L2MessageService_l1l2MessageSetter = requireEnv("L2MSGSERVICE_L1L2_MESSAGE_SETTER");
  const L2MessageService_rateLimitPeriod = requireEnv("L2MSGSERVICE_RATE_LIMIT_PERIOD");
  const L2MessageService_rateLimitAmount = requireEnv("L2MSGSERVICE_RATE_LIMIT_AMOUNT");

  if (existingContractAddress === undefined) {
    console.log(`Deploying initial version, NB: the address will be saved if env SAVE_ADDRESS=true.`);
  } else {
    console.log(`Deploying new version, NB: ${existingContractAddress} will be overwritten if env SAVE_ADDRESS=true.`);
  }

  const [deployer] = await ethers.getSigners();

  const contract = await deployUpgradableWithAbiAndByteCode(
    deployer,
    "L2MessageServiceLineaMainnet",
    JSON.stringify(abi),
    bytecode,
    [
      L2MessageService_securityCouncil,
      L2MessageService_l1l2MessageSetter,
      L2MessageService_rateLimitPeriod,
      L2MessageService_rateLimitAmount,
    ],
    {
      initializer: "initialize(address,address,uint256,uint256)",
      unsafeAllow: ["constructor"],
    },
  );

  const contractAddress = await contract.getAddress();
  const txReceipt = await contract.deploymentTransaction()?.wait();
  if (!txReceipt) {
    throw "Contract deployment transaction receipt not found.";
  }

  console.log(`${contractName} deployed at ${contractAddress}`);

  await tryStoreAddress(hre.network.name, contractName, contractAddress, txReceipt.hash);

  await tryVerifyContract(contractAddress);

  fs.unlinkSync(path.join(hre.config.paths.cache, "validations.json"));
  if (fs.existsSync(validationFileBackupPath)) {
    fs.copyFileSync(validationFileBackupPath, validationFilePath);
    fs.unlinkSync(validationFileBackupPath);
  }
};
export default func;
func.tags = ["L2MessageServiceLineaMainnet"];
