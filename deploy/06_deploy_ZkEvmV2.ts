import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployUpgradableFromFactory, requireEnv } from "../scripts/hardhat/utils";
import { getDeployedContractAddress, tryStoreAddress } from "../utils/storeAddress";
import { tryVerifyContract } from "../utils/verifyContract";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  const contractName = "ZkEvmV2";
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

  // ZKEVMV2 DEPLOYED AS UPGRADEABLE PROXY
  const ZkEvmV2_initialStateRootHash = requireEnv("ZKEVMV2_INITIAL_STATE_ROOT_HASH");
  const ZkEvmV2_initialL2BlockNumber = requireEnv("ZKEVMV2_INITIAL_L2_BLOCK_NUMBER");
  const ZKEVMV2_securityCouncil = requireEnv("ZKEVMV2_SECURITY_COUNCIL");
  const ZKEVMV2_operators = requireEnv("ZKEVMV2_OPERATORS");
  const ZKEVMV2_rateLimitPeriodInSeconds = requireEnv("ZKEVMV2_RATE_LIMIT_PERIOD");
  const ZKEVMV2_rateLimitAmountInWei = requireEnv("ZKEVMV2_RATE_LIMIT_AMOUNT");

  console.log(`Setting operators ${ZKEVMV2_operators}`);

  if (existingContractAddress === undefined) {
    console.log(`Deploying initial version, NB: the address will be saved if env SAVE_ADDRESS=true.`);
  } else {
    console.log(`Deploying new version, NB: ${existingContractAddress} will be overwritten if env SAVE_ADDRESS=true.`);
  }
  const contract = await deployUpgradableFromFactory(
    "ZkEvmV2",
    [
      ZkEvmV2_initialStateRootHash,
      ZkEvmV2_initialL2BlockNumber,
      verifierAddress,
      ZKEVMV2_securityCouncil,
      ZKEVMV2_operators?.split(","),
      ZKEVMV2_rateLimitPeriodInSeconds,
      ZKEVMV2_rateLimitAmountInWei,
    ],
    {
      initializer: "initialize(bytes32,uint256,address,address,address[],uint256,uint256)",
      unsafeAllow: ["constructor"],
    },
  );

  console.log(`${contractName} deployed at ${contract.address}`);

  await tryStoreAddress(hre.network.name, contractName, contract.address, contract.deployTransaction.hash);

  await tryVerifyContract(contract.address);
};

export default func;
func.tags = ["ZkEvmV2"];
