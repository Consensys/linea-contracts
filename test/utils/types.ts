import { BigNumber } from "ethers";

export type RawBlockData = {
  rootHash: string;
  timestamp: number;
  rlpEncodedTransactions: string[];
  l2ToL1MsgHashes: string[];
  batchReceptionIndices: number[];
  fromAddresses: string;
};

export type FormattedBlockData = Omit<
  RawBlockData,
  "rlpEncodedTransactions" | "timestamp" | "l2ToL1MsgHashes" | "fromAddresses" | "rootHash"
> & {
  l2BlockTimestamp: number;
  transactions: string[];
  l2ToL1MsgHashes: string[];
  fromAddresses: string;
  blockRootHash: string;
};

export type DebugData = {
  blocks: {
    txHashes: string[];
    hashOfTxHashes: string;
    logHashes: string[];
    hashOfLogHashes: string;
    hashOfPositions: string;
    HashForBlock: string;
  }[];
  hashForAllBlocks: string;
  hashOfRootHashes: string;
  timestampHashes: string;
  finalHash: string;
};

export type SubmissionData = {
  parentStateRootHash: string;
  dataParentHash: string;
  finalStateRootHash: string;
  firstBlockInData: BigNumber;
  finalBlockInData: BigNumber;
  snarkHash: string;
  compressedData: string;
};

export type FinalizationData = {
  aggregatedProof: string;
  parentStateRootHash: string;
  dataHashes: string[];
  dataParentHash: string;
  finalBlockNumber: BigNumber;
  lastFinalizedTimestamp: BigNumber;
  finalTimestamp: BigNumber;
  l1RollingHash: string;
  l1RollingHashMessageNumber: BigNumber;
  l2MerkleRoots: string[];
  l2MerkleTreesDepth: BigNumber;
  l2MessagingBlocksOffsets: string;
};
