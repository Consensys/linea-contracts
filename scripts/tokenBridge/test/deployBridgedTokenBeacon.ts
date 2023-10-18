import { ethers, upgrades, network } from "hardhat";
import { tryStoreAddress } from "../../../utils/storeAddress";
import { tryVerifyContract } from "../../../utils/verifyContract";

export async function deployBridgedTokenBeacon(verbose = false) {
  const BridgedToken = await ethers.getContractFactory("BridgedToken");

  const l1TokenBeacon = await upgrades.deployBeacon(BridgedToken);
  await l1TokenBeacon.deployed();
  if (verbose) {
    console.log("L1TokenBeacon deployed, at address:", l1TokenBeacon.address);
  }

  const l2TokenBeacon = await upgrades.deployBeacon(BridgedToken);
  await l2TokenBeacon.deployed();
  if (verbose) {
    console.log("L2TokenBeacon deployed, at address:", l2TokenBeacon.address);
  }

  await tryStoreAddress(network.name, "l1TokenBeacon", l1TokenBeacon.address, l1TokenBeacon.deployTransaction.hash);
  await tryStoreAddress(network.name, "l2TokenBeacon", l2TokenBeacon.address, l2TokenBeacon.deployTransaction.hash);

  await tryVerifyContract(l1TokenBeacon.address);
  await tryVerifyContract(l2TokenBeacon.address);

  return { l1TokenBeacon, l2TokenBeacon };
}
