import { requireEnv } from "../hardhat/utils";
import { ethers } from "hardhat";

async function main() {
  const messageServiceAddress = requireEnv("MESSAGE_SERVICE_ADDRESS");
  const messageServiceContractType = requireEnv("MESSAGE_SERVICE_TYPE");
  const withdrawLimitInWei = requireEnv("WITHDRAW_LIMIT_IN_WEI");

  const messageService = await ethers.getContractAt(messageServiceContractType, messageServiceAddress);

  // get existing limit
  const limitInWei = await messageService.limitInWei();
  console.log(
    `Starting with rate limit in wei of ${limitInWei} at ${messageServiceAddress} of type ${messageServiceContractType}`,
  );

  // set limit

  const updateTx = await messageService.resetRateLimitAmount(withdrawLimitInWei);
  await updateTx.wait();

  console.log(`Changed rate limit in wei to ${withdrawLimitInWei} at ${messageServiceAddress}`);

  // get new updated limited
  const newLimitInWei = await messageService.limitInWei();
  console.log(`Validated rate limit in wei of ${newLimitInWei} at ${messageServiceAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
