import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { requireEnv } from "../scripts/hardhat/utils";
import { getDeployedContractAddress } from "../utils/storeAddress";
import { ethers, upgrades } from "hardhat";
import { ZkEvmV2Init__factory } from "../typechain-types";
import { tryVerifyContract } from "../utils/verifyContract";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  const contractName = "ZkEvmV2Init";
  const existingContractAddress = await getDeployedContractAddress(contractName, deployments);

  const proxyAddress = requireEnv("ZKEVMV2_ADDRESS");
  const initialL2BlockNumber = "3";
  const initialStateRootHash = "0x3450000000000000000000000000000000000000000000000000000000000000";

  const factory = await ethers.getContractFactory("ZkEvmV2Init");

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

  // The encoding should be used through the safe.
  const upgradeCallWithReinitializationUsingSecurityCouncil = ethers.utils.hexConcat([
    "0x9623609d",
    ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "bytes"],
      [
        proxyAddress,
        v2contract,
        ZkEvmV2Init__factory.createInterface().encodeFunctionData("initializeV2", [
          initialL2BlockNumber,
          initialStateRootHash,
        ]),
      ],
    ),
  ]);

  console.log(
    "Encoded Tx Upgrade with Reinitialization from Security Council:",
    "\n",
    upgradeCallWithReinitializationUsingSecurityCouncil,
  );
  console.log("\n");

  await tryVerifyContract(contract);
};

export default func;
func.tags = ["ZkEvmV2withReinitialization"];
