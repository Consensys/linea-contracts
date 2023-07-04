import { deployFromFactory, requireEnv } from "../hardhat/utils";

async function main() {
  const verifierContractName = requireEnv("VERIFIER_CONTRACT_NAME");

  // PLONK VERIFIER
  const verifier = await deployFromFactory(verifierContractName);
  console.log(`PlonkVerifier deployed at ${verifier.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
