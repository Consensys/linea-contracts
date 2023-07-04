import fs from "fs";
import path from "path";
import { ethers, artifacts } from "hardhat";
import { deployFromFactory, deployUpgradableFromFactory } from "./utils";
import { MAX_GAS_LIMIT, getBatchTypeFromFileName, getRollupContractConfigPath, getRollupJsonPath } from "../../common";
import { get1559Fees } from "../utils";
import { Contract } from "ethers";

async function deployVerifiers() {
  const startTime = new Date();
  const addresses = [];
  const batchTypes = [];
  const verifiersPath = path.resolve(__dirname, "../../contracts/verifiers/");

  for (const filename of fs.readdirSync(verifiersPath)) {
    const batchType = getBatchTypeFromFileName(filename);
    if (batchType.gt(0)) {
      const verifierArtifactName = filename.replace(".sol", "");
      const VerifierArtifact = await ethers.getContractFactory(verifierArtifactName);
      const verifierInstance = await VerifierArtifact.deploy({
        gasLimit: MAX_GAS_LIMIT,
      });
      addresses.push(verifierInstance.address);
      batchTypes.push(batchType);
    } else {
      console.log(`Skipping ${filename} as it does not match any batch type`);
    }
  }
  const endTime = new Date();
  const timeDiff = +endTime - +startTime; // in ms

  console.log(`Deploying verifiers took ${timeDiff}ms`);
  return { addresses, batchTypes };
}

async function main() {
  console.log("Deploying rollup contracts");

  const rollupJsonPath = getRollupJsonPath();
  const rollupConfigJson = fs.readFileSync(getRollupContractConfigPath(), "utf8");
  const rollupConfig = JSON.parse(rollupConfigJson);

  const serialization = await deployFromFactory("Serialization", ethers.provider, await get1559Fees(ethers.provider));
  console.log("Serialization has been deployed:", serialization.address);

  let rollupAddress;
  let abi;

  const slotDurationInBlocks = 15;
  const forcedTransactionsTimeout = 86400;
  const firstAvailableAccountId = 0;

  if (rollupConfig.rollup_type === "Consensus") {
    ({ rollupAddress, abi } = await deployConsensus(
      rollupConfig,
      slotDurationInBlocks,
      forcedTransactionsTimeout,
      firstAvailableAccountId,
    ));
  } else if (rollupConfig.rollup_type === "PaZkp") {
    ({ rollupAddress, abi } = await deployPartiallyAnonymous(
      rollupConfig,
      slotDurationInBlocks,
      forcedTransactionsTimeout,
      firstAvailableAccountId,
    ));
  } else if (rollupConfig.rollup_type === "ConsensusGeneralProgrammability") {
    ({ rollupAddress, abi } = await deployGeneralProgrammability(rollupConfig, slotDurationInBlocks));
  } else if (rollupConfig.rollup_type === "ZkEvm") {
    ({ rollupAddress, abi } = await deployZkEvm(rollupConfig, slotDurationInBlocks));
  } else {
    console.error("Unknown rollup type: " + rollupConfig.rollup_type);
  }

  console.log("Rollup contract deployed, writing config file");
  const rollup = { address: rollupAddress, abi };

  fs.writeFileSync(rollupJsonPath, JSON.stringify(rollup));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error, error.toString());
    process.exit(1);
  });

async function deployConsensus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rollupConfig: any,
  slotDurationInBlocks: number,
  forcedTransactionsTimeout: number,
  firstAvailableAccountId: number,
) {
  const artifactName = "Consensus";
  const votingThreshold = 1;
  const maxBatchOffset = 40;
  const consensus = await deployUpgradableFromFactory(
    artifactName,
    [
      rollupConfig.root_hash,
      slotDurationInBlocks,
      votingThreshold,
      maxBatchOffset,
      forcedTransactionsTimeout,
      firstAvailableAccountId,
    ],
    {
      initializer: "initialize(bytes32,uint16,uint8,uint256,uint32,uint32)",
    },
  );
  console.log("Consensus Rollup has been deployed: ", consensus.address);

  return logAndReturnAbi(artifactName, consensus);
}

async function deployPartiallyAnonymous(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rollupConfig: any,
  slotDurationInBlocks: number,
  forcedTransactionsTimeout: number,
  firstAvailableAccountId: number,
) {
  const verifiersData = await deployVerifiers();
  console.log("Verifiers have been deployed:", verifiersData);
  const artifactName = "PartiallyAnonymous";
  console.log("Going to deploy Partially anonymous rollup with these parameters:");
  console.log({
    rootHash: rollupConfig.root_hash,
    slotDurationInBlocks,
    forcedTransactionsTimeout,
    verifiersAddresses: verifiersData.addresses,
    verifiersBatchTypes: verifiersData.batchTypes,
    firstAvailableAccountId,
    txParams: { gasLimit: MAX_GAS_LIMIT },
  });
  const partiallyAnonymous = await deployUpgradableFromFactory(
    artifactName,
    [
      rollupConfig.root_hash,
      slotDurationInBlocks,
      forcedTransactionsTimeout,
      verifiersData.addresses,
      verifiersData.batchTypes,
      firstAvailableAccountId,
    ],
    {
      initializer: "initialize(bytes32,uint16,uint32,address[],uint128[],uint256)",
    },
  );

  const rootHash = await partiallyAnonymous.lastFinalizedStateRootHash();
  console.log(`State root hash after deployment ${rootHash}`);
  return logAndReturnAbi(artifactName, partiallyAnonymous);
}

async function deployGeneralProgrammability(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rollupConfig: any,
  slotDurationInBlocks: number,
) {
  const artifactName = "GeneralProgrammability";
  const votingThreshold = 1;
  const maxBatchOffset = 40;

  console.log(`Deploying GP smart contract with root hash ${rollupConfig.root_hash}`);

  const generalProgrammability = await deployUpgradableFromFactory(
    artifactName,
    [rollupConfig.root_hash, slotDurationInBlocks, votingThreshold, maxBatchOffset],
    {
      initializer: "initialize(bytes32,uint16,uint8,uint256)",
    },
  );

  return logAndReturnAbi(artifactName, generalProgrammability);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deployZkEvm(rollupConfig: any, slotDurationInBlocks: number) {
  console.log("Going to deploy ZkEvm related contracts");
  await deployFromFactory("NumUtils", ethers.provider, await get1559Fees(ethers.provider));
  const proverDevLightVersion = process.env.PROVER_DEV_LIGHT_VERSION === "true" || false;
  const verifierContractName = proverDevLightVersion ? "ZkEvmVerifierDev" : "ZkEvmVerifierFull";
  const verifier = await deployFromFactory(verifierContractName, ethers.provider, await get1559Fees(ethers.provider));
  console.log(`ZkEVm Verifier has been deployed: ${verifier.address}`);
  const artifactName = "ZkEvm";
  // Value taken from Verifier
  const zkEvm = await deployUpgradableFromFactory(
    artifactName,
    [rollupConfig.root_hash, slotDurationInBlocks, verifier.address],
    {
      ...(await get1559Fees(ethers.provider)),
      initializer: "initialize(bytes32,uint16,address)",
    },
  );

  return logAndReturnAbi(artifactName, zkEvm);
}

async function logAndReturnAbi(name: string, deployedContract: Contract) {
  console.log(`${name} Rollup has been deployed: `, deployedContract.address);

  const rollupAddress = deployedContract.address;
  const artifact = await artifacts.readArtifact(name);

  return { rollupAddress, abi: artifact.abi };
}
