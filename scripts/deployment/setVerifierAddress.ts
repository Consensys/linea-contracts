import { requireEnv } from "../hardhat/utils";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";

async function main() {
  const verifProof = requireEnv("VERIFIER_PROOF");
  const zkEvmAddress = requireEnv("ZKEVMV2_ADDRESS");
  const verifier = requireEnv("VERIFIER_ADDRESS");

  const zkEvmV2 = await ethers.getContractAt("ZkEvmV2", zkEvmAddress);

  // Set Verifier address to IntegrationTestTrueVerifier
  await zkEvmV2.setVerifierAddress(verifier, BigNumber.from(verifProof));

  const checkVerifierIsSet = await zkEvmV2.verifiers(BigNumber.from(verifProof));
  console.log(`ZkEvmV2 implementation added ${checkVerifierIsSet} as new verifier`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
