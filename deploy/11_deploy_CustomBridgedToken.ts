import { ethers, network } from "hardhat";
import { getDeployedContractAddress, tryStoreAddress } from "../utils/storeAddress";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { tryVerifyContract } from "../utils/verifyContract";
import { deployUpgradableFromFactory, requireEnv } from "../scripts/hardhat/utils";
import { validateDeployBranchAndTags } from "../utils/auditedDeployVerifier";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  validateDeployBranchAndTags(hre.network.name);

  const contractName = "CustomBridgedToken";
  const existingContractAddress = await getDeployedContractAddress(contractName, deployments);

  const CustomTokenBridge_name = requireEnv("CUSTOMTOKENBRIDGE_NAME");
  const CustomTokenBridge_symbol = requireEnv("CUSTOMTOKENBRIDGE_SYMBOL");
  const CustomTokenBridge_decimals = requireEnv("CUSTOMTOKENBRIDGE_DECIMALS");
  const CustomTokenBridge_bridge_address = requireEnv("CUSTOMTOKENBRIDGE_BRIDGE_ADDRESS");

  const [owner] = await ethers.getSigners();
  const chainId = await owner.getChainId();
  console.log(`Current network's chainId is ${chainId}`);

  if (existingContractAddress === undefined) {
    console.log(`Deploying initial version, NB: the address will be saved if env SAVE_ADDRESS=true.`);
  } else {
    console.log(`Deploying new version, NB: ${existingContractAddress} will be overwritten if env SAVE_ADDRESS=true.`);
  }

  // Deploy proxy for custom bridged token
  const customBridgedToken = await deployUpgradableFromFactory(
    contractName,
    [CustomTokenBridge_name, CustomTokenBridge_symbol, CustomTokenBridge_decimals, CustomTokenBridge_bridge_address],
    {
      initializer: "initializeV2(string,string,uint8,address)",
      unsafeAllow: ["constructor"],
    },
  );

  await customBridgedToken.deployed();

  await tryStoreAddress(
    network.name,
    contractName,
    customBridgedToken.address,
    customBridgedToken.deployTransaction.hash,
  );

  console.log(`CustomBridgedToken deployed on ${network.name}, at address:`, customBridgedToken.address);

  await tryVerifyContract(customBridgedToken.address);
};
export default func;
func.tags = ["CustomBridgedToken"];
