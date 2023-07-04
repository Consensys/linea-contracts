import { getWallet, getRollupContract } from "./utils";

async function main() {
  const rollupConfigPath = process.argv[2];
  const contractOwnerCredentialsFile = process.argv[3];

  const wallet = getWallet(contractOwnerCredentialsFile);
  const rollup = getRollupContract(rollupConfigPath, wallet);

  try {
    const result = await rollup.isVerificationEnabled();
    console.log("------------------");
    console.log(`ZK Proof verification status is "${result}"`);
    console.log("------------------");
  } catch (e) {
    console.error("Setting verification failed:");
    console.error(e);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
