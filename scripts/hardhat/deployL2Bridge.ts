import { deployUpgradableFromFactory } from "./utils";

async function main() {
  console.log("Deploying L2 bridge contract");

  const contract = await deployUpgradableFromFactory("L2Bridge");

  console.log(`L2 bridge deployed at ${contract.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
