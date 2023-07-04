import { ethers } from "ethers";
import { getRollupJsonPath } from "../../common";
import { getRollupContractData, checkExistsWithTimeout } from "../utils";

async function main() {
  console.log(getCurrentDate() + "Starting events monitoring script...");
  // params
  const rollupJsonPath = getRollupJsonPath();
  await checkExistsWithTimeout(rollupJsonPath, 120000);
  const rollupContractData = getRollupContractData(rollupJsonPath);

  const rollup = new ethers.Contract(rollupContractData.address, rollupContractData.abi);

  rollup.on("BatchVerified", (stateRootHash: string) => {
    const currentDate = getCurrentDate();
    console.log(`${currentDate} 'BatchVerified' event has been received: `, stateRootHash);
  });

  rollup.on("TransactionBatchAccepted", (prevStateRootHash: string, nextStateRootHash: string) => {
    const currentDate = getCurrentDate();
    console.log(`${currentDate} 'TransactionBatchAccepted' event has been received: `, {
      prevStateRootHash,
      nextStateRootHash,
    });
  });

  rollup.on(
    "ForcedInboundTransferReceived",
    (accountId: number, amount: number, index: number, tokenId: number, expireAt: number) => {
      const currentDate = getCurrentDate();
      console.log(`${currentDate} 'ForcedInboundTransfer' event has been received:`, {
        accountId,
        amount,
        index,
        tokenId,
        expireAt,
      });
    },
  );
}

function getCurrentDate() {
  return "[" + new Date().toUTCString() + "] ";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
