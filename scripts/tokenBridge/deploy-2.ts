import { ethers, network } from "hardhat";
import { default as deployments } from "../../deployments.json";
import { SupportedChainIds } from "./supportedNetworks";

export async function main() {
  const [owner] = await ethers.getSigners();
  const chainId = await owner.getChainId();

  if (!(chainId in SupportedChainIds)) {
    throw `Chaind Id ${chainId} not supported`;
  }

  if (!deployments.zkevm_dev.TokenBridge || !deployments.l2.TokenBridge) {
    throw "The TokenBridge needs to be deployed on both layers first";
  }

  let tokenBridgeAddress;
  let remoteTokenBridgeAddress;
  switch (chainId) {
    case SupportedChainIds.MAINNET:
    case SupportedChainIds.GOERLI:
      tokenBridgeAddress = deployments.zkevm_dev.TokenBridge;
      remoteTokenBridgeAddress = deployments.l2.TokenBridge;
      break;
    case SupportedChainIds.LINEA:
    case SupportedChainIds.LINEA_TESTNET:
      tokenBridgeAddress = deployments.l2.TokenBridge;
      remoteTokenBridgeAddress = deployments.zkevm_dev.TokenBridge;
      break;
  }

  const TokenBridge = await ethers.getContractFactory("TokenBridge");
  const tokenBridge = await TokenBridge.attach(tokenBridgeAddress);
  const tx = await tokenBridge.setRemoteTokenBridge(remoteTokenBridgeAddress);

  await tx.wait();

  console.log(`RemoteTokenBridge set for the TokenBridge on: ${network.name}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => {
    process.exitCode = 0;
    process.exit();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
    process.exit();
  });
