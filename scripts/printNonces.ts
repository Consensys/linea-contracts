import { getWallet, getProvider } from "./utils";

async function main() {
  const credentialsFile = process.argv[2];
  const wallet = getWallet(credentialsFile);
  console.log(getCurrentDate() + `Going to print nonces for address: ${wallet.address}`);
  const provider = getProvider();
  console.log(getCurrentDate() + "Provider:", { provider });
  console.log(getCurrentDate() + "Start listening...");
  const result = await provider.send("eth_chainId", []);
  console.log("eth_chainId", { result });

  async function listenLoop() {
    const count = await provider.getTransactionCount(wallet.address);
    const currentDate = getCurrentDate();
    console.log(`${currentDate} - transaction count for ${wallet.address}: ${count} `);
    setTimeout(listenLoop, 1000);
  }
  await listenLoop();
}

function getCurrentDate() {
  return "[" + new Date().toUTCString() + "] ";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
