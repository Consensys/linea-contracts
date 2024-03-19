import { BytesLike, SigningKey, Transaction, Wallet, ethers } from "ethers";
import { BlobEIP4844Transaction, BlobEIP4844TxData } from "@ethereumjs/tx";
import { blobsToCommitments, blobsToProofs, commitmentsToVersionedHashes, initKZG } from "@ethereumjs/util";
import { Chain, Common, Hardfork } from "@ethereumjs/common";
import * as kzg from "c-kzg";
import submissionDataJson from "./blocks-1-46.json";
import submissionDataJson2 from "./blocks-47-92.json";
import submissionDataJson3 from "./blocks-93-127.json";
import aggregateProof1to46 from "./aggregatedProof-1-46.json";
import aggregateProof47to127 from "./aggregatedProof-47-127.json";
import { DataHexString } from "ethers/lib.commonjs/utils/data";

type SubmissionData = {
  parentStateRootHash: string;
  dataParentHash: string;
  finalStateRootHash: string;
  firstBlockInData: bigint;
  finalBlockInData: bigint;
  snarkHash: string;
};

export function generateSubmissionDataFromJSON(
  startingBlockNumber: number,
  endingBlockNumber: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parsedJSONData: any,
): { submissionData: SubmissionData; blob: Uint8Array } {
  const returnData = {
    parentStateRootHash: parsedJSONData.parentStateRootHash,
    dataParentHash: parsedJSONData.parentDataHash,
    finalStateRootHash: parsedJSONData.finalStateRootHash,
    firstBlockInData: BigInt(startingBlockNumber),
    finalBlockInData: BigInt(endingBlockNumber),
    snarkHash: parsedJSONData.snarkHash,
  };

  return {
    submissionData: returnData,
    blob: ethers.decodeBase64(parsedJSONData.compressedData),
  };
}
export function generateSubmissionCallDataFromJSON(
  startingBlockNumber: number,
  endingBlockNumber: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parsedJSONData: any,
): { submissionData: SubmissionData } {
  const returnData = {
    parentStateRootHash: parsedJSONData.parentStateRootHash,
    dataParentHash: parsedJSONData.parentDataHash,
    finalStateRootHash: parsedJSONData.finalStateRootHash,
    firstBlockInData: BigInt(startingBlockNumber),
    finalBlockInData: BigInt(endingBlockNumber),
    snarkHash: parsedJSONData.snarkHash,
    compressedData: ethers.hexlify(ethers.decodeBase64(parsedJSONData.compressedData)),
  };

  return {
    submissionData: returnData,
  };
}

function requireEnv(name: string): string {
  const envVariable = process.env[name];
  if (!envVariable) {
    throw new Error(`Missing ${name} environment variable`);
  }

  return envVariable;
}

function kzgCommitmentsToVersionedHashes(commitments: Uint8Array[]): string[] {
  const versionedHashes = commitmentsToVersionedHashes(commitments);
  return versionedHashes.map((versionedHash) => ethers.hexlify(versionedHash));
}

function createEIP4844Transaction(
  transaction: Transaction,
  signature: ethers.Signature,
  blobs: BytesLike[],
  kzgCommitments: BytesLike[],
  kzgProofs: BytesLike[],
): BlobEIP4844Transaction {
  let common: Common;

  if (Object.values(Chain).includes(parseInt(transaction.chainId.toString()))) {
    common = new Common({
      chain: transaction.chainId,
      hardfork: Hardfork.Cancun,
      eips: [4844],
      customCrypto: { kzg },
    });
  } else {
    common = Common.custom(
      {
        chainId: transaction.chainId,
        defaultHardfork: Hardfork.Cancun,
      },
      {
        eips: [4844],
        customCrypto: { kzg },
      },
    );
  }

  const txData: BlobEIP4844TxData = {
    value: transaction.value,
    v: signature.yParity,
    r: signature.r,
    s: signature.s,
    nonce: transaction.nonce,
    chainId: transaction.chainId,
    accessList: transaction.accessList,
    type: transaction.type!,
    data: transaction.data,
    gasLimit: transaction.gasLimit,
    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas!,
    maxFeePerGas: transaction.maxFeePerGas!,
    to: transaction.to!,
    blobVersionedHashes: transaction.blobVersionedHashes!,
    maxFeePerBlobGas: transaction.maxFeePerBlobGas!,
    blobs,
    kzgCommitments,
    kzgProofs: kzgProofs,
  };

  return BlobEIP4844Transaction.fromTxData(txData, { common });
}

async function main() {
  const rpcUrl = requireEnv("RPC_URL");
  const privateKey = requireEnv("PRIVATE_KEY");
  const destinationAddress = requireEnv("DESTINATION_ADDRESS");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const signingKey = new SigningKey(privateKey);

  initKZG(kzg, `${__dirname}/../trusted_setup.txt`);

  const { submissionData } = generateSubmissionCallDataFromJSON(1, 46, submissionDataJson);
  const { submissionData: submissionData2, blob: blob2 } = generateSubmissionDataFromJSON(47, 92, submissionDataJson2);
  const { submissionData: submissionData3, blob: blob3 } = generateSubmissionDataFromJSON(93, 127, submissionDataJson3);

  const fullblob2 = blob2;
  const fullblob3 = blob3;

  const commitments2 = blobsToCommitments([fullblob2]);
  const commitments3 = blobsToCommitments([fullblob3]);

  const versionedHashes2 = kzgCommitmentsToVersionedHashes(commitments2);
  const versionedHashes3 = kzgCommitmentsToVersionedHashes(commitments3);

  const kzgProofs2 = blobsToProofs([fullblob2], commitments2);
  const kzgProofs3 = blobsToProofs([fullblob3], commitments3);

  await submitCalldata(submissionData, 0);

  let encodedCall = encodeCall(submissionData2, commitments2, submissionDataJson2);
  await submitBlob(
    provider,
    wallet,
    encodedCall,
    destinationAddress,
    versionedHashes2,
    signingKey,
    fullblob2,
    commitments2,
    kzgProofs2,
    0,
  );

  encodedCall = encodeCall(submissionData3, commitments3, submissionDataJson3);
  await submitBlob(
    provider,
    wallet,
    encodedCall,
    destinationAddress,
    versionedHashes3,
    signingKey,
    fullblob3,
    commitments3,
    kzgProofs3,
    1,
  );

  await sendProof(aggregateProof1to46, 2);
  await sendProof(aggregateProof47to127, 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function encodeCall(submissionData: SubmissionData, commitments: BytesLike[], submissionDataJson: any): DataHexString {
  const encodedCall = ethers.concat([
    "0x2d3c12e5",
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(bytes32,bytes32,bytes32,uint256,uint256,bytes32)", "uint256", "bytes", "bytes"],
      [
        [
          submissionData.parentStateRootHash,
          submissionData.dataParentHash,
          submissionData.finalStateRootHash,
          submissionData.firstBlockInData,
          submissionData.finalBlockInData,
          submissionData.snarkHash,
        ],
        submissionDataJson.expectedY,
        commitments[0],
        submissionDataJson.kzgProofContract,
      ],
    ),
  ]);

  return encodedCall;
}

async function submitBlob(
  provider: ethers.JsonRpcProvider,
  wallet: Wallet,
  encodedCall: string,
  destinationAddress: string,
  versionedHashes: string[],
  signingKey: SigningKey,
  fullblob: Uint8Array,
  commitments: BytesLike[],
  kzgProofs: BytesLike[],
  nonceOffset: number,
) {
  const { maxFeePerGas, maxPriorityFeePerGas } = await provider.getFeeData();
  let nonce = await provider.getTransactionCount(wallet.address);
  nonce = nonce + nonceOffset;

  console.log("nonce", nonce);
  const transaction = Transaction.from({
    data: encodedCall,
    maxPriorityFeePerGas: maxPriorityFeePerGas!,
    maxFeePerGas: maxFeePerGas!,
    to: destinationAddress,
    chainId: 31648428,
    type: 3,
    nonce,
    value: 0,
    gasLimit: 5_000_000,
    blobVersionedHashes: versionedHashes,
    maxFeePerBlobGas: maxFeePerGas!,
  });

  const signature = signingKey.sign(transaction.unsignedHash);

  const eip4844Transaction = createEIP4844Transaction(transaction, signature, [fullblob], commitments, kzgProofs);
  const serializedEip4844Tx = eip4844Transaction.serializeNetworkWrapper();
  const res = await provider.send("eth_sendRawTransaction", [ethers.hexlify(serializedEip4844Tx)]);

  console.log(res);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendProof(proofFile: any, nonceOffset: number) {
  console.log("proof");

  const rpcUrl = requireEnv("RPC_URL");
  const privateKey = requireEnv("PRIVATE_KEY");
  const destinationAddress = requireEnv("DESTINATION_ADDRESS");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);

  const encodedCall = ethers.concat([
    "0xd630280f",
    ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "bytes",
        "uint256",
        "tuple(bytes32,bytes32[],bytes32,uint256,uint256,uint256,bytes32,uint256,bytes32[],uint256,bytes)",
      ],
      [
        proofFile.aggregatedProof,
        0,
        [
          proofFile.parentStateRootHash,
          proofFile.dataHashes,
          proofFile.dataParentHash,
          proofFile.finalBlockNumber,
          proofFile.parentAggregationLastBlockTimestamp,
          proofFile.finalTimestamp,
          proofFile.l1RollingHash,
          proofFile.l1RollingHashMessageNumber,
          proofFile.l2MerkleRoots,
          proofFile.l2MerkleTreesDepth,
          proofFile.l2MessagingBlocksOffsets,
        ],
      ],
    ),
  ]);

  const { maxFeePerGas, maxPriorityFeePerGas } = await provider.getFeeData();
  let nonce = await provider.getTransactionCount(wallet.address);
  nonce = nonce + nonceOffset;

  console.log(encodedCall);

  const transaction = Transaction.from({
    data: encodedCall,
    maxPriorityFeePerGas: maxPriorityFeePerGas!,
    maxFeePerGas: maxFeePerGas!,
    to: destinationAddress,
    chainId: 31648428,
    nonce,
    value: 0,
    gasLimit: 5_000_000,
  });

  const res = await wallet.sendTransaction(transaction);
  console.log(res);

  const rec = await res.wait();
  console.log(rec);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function submitCalldata(calldata: any, nonceOffset: number) {
  const rpcUrl = requireEnv("RPC_URL");
  const privateKey = requireEnv("PRIVATE_KEY");
  const destinationAddress = requireEnv("DESTINATION_ADDRESS");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);

  const encodedCall = ethers.concat([
    "0x7a776315",
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(bytes32,bytes32,bytes32,uint256,uint256,bytes32,bytes)"],
      [
        [
          calldata.parentStateRootHash,
          calldata.dataParentHash,
          calldata.finalStateRootHash,
          calldata.firstBlockInData,
          calldata.finalBlockInData,
          calldata.snarkHash,
          calldata.compressedData,
        ],
      ],
    ),
  ]);

  const { maxFeePerGas, maxPriorityFeePerGas } = await provider.getFeeData();
  let nonce = await provider.getTransactionCount(wallet.address);
  nonce = nonce + nonceOffset;

  const transaction = Transaction.from({
    data: encodedCall,
    maxPriorityFeePerGas: maxPriorityFeePerGas!,
    maxFeePerGas: maxFeePerGas!,
    to: destinationAddress,
    chainId: 31648428,
    nonce,
    value: 0,
    gasLimit: 5_000_000,
  });

  const res = await wallet.sendTransaction(transaction);
  console.log(res);

  const rec = await res.wait();
  console.log(rec);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
