import { ethers, upgrades } from "hardhat";
import { deployFromFactory, requireEnv } from "../hardhat/utils";
import { get1559Fees } from "../utils";

async function main() {
  const provider = ethers.provider;

  const timeLockProposers = requireEnv("TIMELOCK_PROPOSERS");
  const timelockExecutors = requireEnv("TIMELOCK_EXECUTORS");

  const minDelay = process.env.MIN_DELAY || 0;

  const timelock = await deployFromFactory(
    "TimeLock",
    provider,
    minDelay,
    timeLockProposers?.split(","),
    timelockExecutors?.split(","),
    ethers.constants.AddressZero,
    await get1559Fees(provider),
  );

  console.log("TimeLock deployed to:", timelock.address);

  // CHANGE OWNERSHIP OF PROXY ADMIN
  await upgrades.admin.transferProxyAdminOwnership(timelock.address);
  // https://forum.openzeppelin.com/t/transferproxyadminownership-results-in-ownable-caller-is-not-the-owner/4927
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
