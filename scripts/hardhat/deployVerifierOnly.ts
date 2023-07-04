import { ethers } from "hardhat";
import { deployFromFactory } from "./utils";
import { get1559Fees } from "../utils";

async function main() {
  console.log("Deploying verifier contract");

  const rollupAddress = process.env.ROLLUP_ADDRESS;

  if (rollupAddress) {
    await deployVerifyerUpdateZkEvm(rollupAddress);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    console.error(error.toString());
    process.exit(1);
  });

async function deployVerifyerUpdateZkEvm(zkEvmAddress: string) {
  console.log("Going to deploy ZkEvm related contracts");
  const proverDevLightVersion = process.env.PROVER_DEV_LIGHT_VERSION === "true" || false;

  const verifierContractName = proverDevLightVersion ? "ZkEvmVerifierDev" : "ZkEvmVerifierFull";

  const verifier = await deployFromFactory(verifierContractName, ethers.provider, await get1559Fees(ethers.provider));

  console.log(`ZkEVm Verifier has been deployed: ${verifier.address}`);
  const artifactName = "ZkEvm";
  // Value taken from Verifier
  const zkEvm = await ethers.getContractFactory(artifactName);

  const zkEvmInstance = await zkEvm.attach(zkEvmAddress);
  await zkEvmInstance.changeVerifierAddress(verifier.address, await get1559Fees(ethers.provider));
}
