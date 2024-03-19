import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { deployUpgradableFromFactory, requireEnv } from "../scripts/hardhat/utils";
import { validateDeployBranchAndTags } from "../utils/auditedDeployVerifier";
import { getDeployedContractAddress, tryStoreAddress } from "../utils/storeAddress";
import { tryVerifyContract } from "../utils/verifyContract";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  validateDeployBranchAndTags(hre.network.name);

  const contractName = "LineaRollup";
  const verifierName = "PlonkVerifier";
  const existingContractAddress = await getDeployedContractAddress(contractName, deployments);
  let verifierAddress = await getDeployedContractAddress(verifierName, deployments);
  if (verifierAddress === undefined) {
    if (process.env["PLONKVERIFIER_ADDRESS"] !== undefined) {
      console.log(`Using environment variable for PlonkVerifier , ${process.env["PLONKVERIFIER_ADDRESS"]}`);
      verifierAddress = process.env["PLONKVERIFIER_ADDRESS"];
    } else {
      throw "Missing PLONKVERIFIER_ADDRESS environment variable";
    }
  } else {
    console.log(`Using deployed variable for PlonkVerifier , ${verifierAddress}`);
  }

  // LineaRollup DEPLOYED AS UPGRADEABLE PROXY
  const LineaRollup_initialStateRootHash = requireEnv("LINEA_ROLLUP_INITIAL_STATE_ROOT_HASH");
  const LineaRollup_initialL2BlockNumber = requireEnv("LINEA_ROLLUP_INITIAL_L2_BLOCK_NUMBER");
  const LineaRollup_securityCouncil = requireEnv("LINEA_ROLLUP_SECURITY_COUNCIL");
  const LineaRollup_operators = requireEnv("LINEA_ROLLUP_OPERATORS");
  const LineaRollup_rateLimitPeriodInSeconds = requireEnv("LINEA_ROLLUP_RATE_LIMIT_PERIOD");
  const LineaRollup_rateLimitAmountInWei = requireEnv("LINEA_ROLLUP_RATE_LIMIT_AMOUNT");
  const LineaRollup_genesisTimestamp = requireEnv("LINEA_ROLLUP_GENESIS_TIMESTAMP");

  console.log(`Setting operators ${LineaRollup_operators}`);

  if (existingContractAddress === undefined) {
    console.log(`Deploying initial version, NB: the address will be saved if env SAVE_ADDRESS=true.`);
  } else {
    console.log(`Deploying new version, NB: ${existingContractAddress} will be overwritten if env SAVE_ADDRESS=true.`);
  }
  const contract = await deployUpgradableFromFactory(
    "LineaRollup",
    [
      LineaRollup_initialStateRootHash,
      LineaRollup_initialL2BlockNumber,
      verifierAddress,
      LineaRollup_securityCouncil,
      LineaRollup_operators?.split(","),
      LineaRollup_rateLimitPeriodInSeconds,
      LineaRollup_rateLimitAmountInWei,
      LineaRollup_genesisTimestamp,
    ],
    {
      initializer: "initialize(bytes32,uint256,address,address,address[],uint256,uint256,uint256)",
      unsafeAllow: ["constructor"],
    },
  );
  const contractAddress = await contract.getAddress();
  const txReceipt = await contract.deploymentTransaction()?.wait();
  if (!txReceipt) {
    throw "Contract deployment transaction receipt not found.";
  }

  console.log(`${contractName} deployed: address=${contractAddress} blockNumber=${txReceipt.blockNumber}`);

  await tryStoreAddress(hre.network.name, contractName, contractAddress, txReceipt.hash);

  await tryVerifyContract(contractAddress);
};

export default func;
func.tags = ["LineaRollup"];
