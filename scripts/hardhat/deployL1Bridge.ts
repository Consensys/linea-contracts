import { deployUpgradableFromFactory } from "./utils";

async function main() {
  console.log("Deploying L1 bridge contract");

  const contract = await deployUpgradableFromFactory("L1Bridge");

  console.log(`L1Bridge deployed at ${contract.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
