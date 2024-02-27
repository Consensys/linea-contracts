import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { requireEnv } from "../scripts/hardhat/utils";
import { getDeployedContractAddress } from "../utils/storeAddress";
import { ethers, upgrades } from "hardhat";
import { LineaRollupInit__factory } from "../typechain-types";
import { tryVerifyContract } from "../utils/verifyContract";
import { validateDeployBranchAndTags } from "../utils/auditedDeployVerifier";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  validateDeployBranchAndTags(hre.network.name);

  const contractName = "LineaRollupInit";
  const existingContractAddress = await getDeployedContractAddress(contractName, deployments);

  const proxyAddress = requireEnv("LINEA_ROLLUP_ADDRESS");
  const initialL2BlockNumber = "3";
  const initialStateRootHash = "0x3450000000000000000000000000000000000000000000000000000000000000";

  const factory = await ethers.getContractFactory("LineaRollupInit");

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

  // The encoding should be used through the safe.
  const upgradeCallWithReinitializationUsingSecurityCouncil = ethers.utils.hexConcat([
    "0x9623609d",
    ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "bytes"],
      [
        proxyAddress,
        newContract,
        LineaRollupInit__factory.createInterface().encodeFunctionData("initializeV2", [
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
func.tags = ["LineaRollupWithReinitialization"];
