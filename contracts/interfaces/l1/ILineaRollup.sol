// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.22;

/**
 * @title LineaRollup interface for current functions, events and errors.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */
interface ILineaRollup {
  /**
   * @dev parentStateRootHash is the starting root hash.
   * @dev dataParentHash is used in order to link data.
   * @dev finalStateRootHash is used to set next data.
   * @dev firstBlockInData is the first block that is included in the data submitted.
   * @dev finalBlockInData is the last block that is included in the data submitted.
   * @dev snarkHash is the computed hash for compressed data (using a SNARK-friendly hash function) that aggregates per data submission to be used in public input.
   * @dev compressedData is the compressed transaction data. It contains ordered data for each L2 block - l2Timestamps, the encoded txData.
   */
  struct SubmissionData {
    bytes32 parentStateRootHash;
    bytes32 dataParentHash;
    bytes32 finalStateRootHash;
    uint256 firstBlockInData;
    uint256 finalBlockInData;
    bytes32 snarkHash;
    bytes compressedData;
  }

  /**
   * @dev parentStateRootHash is the expected last state root hash finalized.
   * @dev dataHashes is the optional previously submitted compressed data item hashes.
   * @dev dataParentHash is the last finalized compressed data item hash.
   * @dev finalBlockNumber is the last block that is being finalized.
   * @dev lastFinalizedTimestamp is the expected last finalized block's timestamp.
   * @dev finalTimestamp is the timestamp of the last block being finalized.
   * @dev l1RollingHash is the calculated rolling hash on L2 that is expected to match L1 at l1RollingHashMessageNumber.
   * This value will be used along with the stored last finalized L2 calculated rolling hash in the public input.
   * @dev l1RollingHashMessageNumber is the calculated message number on L2 that is expected to match the existing L1 rolling hash.
   * This value will be used along with the stored last finalized L2 calculated message number in the public input.
   * @dev l2MerkleRoots is an array of L2 message merkle roots of depth l2MerkleTreesDepth between last finalized block and finalBlockNumber.
   * @dev l2MerkleTreesDepth is the depth of all l2MerkleRoots.
   * @dev l2MessagingBlocksOffsets indicates by offset from currentL2BlockNumber which L2 blocks contain MessageSent events.
   */
  struct FinalizationData {
    bytes32 parentStateRootHash;
    bytes32[] dataHashes;
    bytes32 dataParentHash;
    uint256 finalBlockNumber;
    uint256 lastFinalizedTimestamp;
    uint256 finalTimestamp;
    bytes32 l1RollingHash;
    uint256 l1RollingHashMessageNumber;
    bytes32[] l2MerkleRoots;
    uint256 l2MerkleTreesDepth;
    bytes l2MessagingBlocksOffsets;
  }

  /**
   * @dev Emitted when a verifier is set for a particular proof type.
   */
  event VerifierAddressChanged(
    address indexed verifierAddress,
    uint256 indexed proofType,
    address indexed verifierSetBy,
    address oldVerifierAddress
  );

  /**
   * @dev Emitted when compressed data is being submitted and verified succesfully on L1.
   */
  event DataSubmitted(bytes32 indexed dataHash, uint256 indexed startBlock, uint256 indexed endBlock);

  /**
   * @dev Emitted when L2 blocks have been finalized on L1.
   */
  event DataFinalized(
    uint256 indexed lastBlockFinalized,
    bytes32 indexed startingRootHash,
    bytes32 indexed finalRootHash,
    bool withProof
  );

  /**
   * @dev Thrown when the starting block in the data item is out of sequence with the last block number.
   */
  error DataStartingBlockDoesNotMatch(uint256 expected, uint256 actual);

  /**
   * @dev Thrown when the ending block in the data item is out of sequence with the finalization data.
   */
  error DataEndingBlockDoesNotMatch(uint256 expected, uint256 actual);

  /**
   * @dev Thrown when the expected data item's shnarf is empty.
   */
  error DataParentHasEmptyShnarf();

  /**
   * @dev Thrown when the current data was already submitted.
   */
  error DataAlreadySubmitted(bytes32 currentDataHash);

  /**
   * @dev Thrown when parent stateRootHash does not match or is empty.
   */
  error StateRootHashInvalid(bytes32 expected, bytes32 actual);

  /**
   * @dev Thrown when submissionData is empty.
   */
  error EmptySubmissionData();

  /**
   * @dev Thrown when finalizationData.dataHashes is empty.
   */
  error FinalizationDataMissing();

  /**
   * @dev Thrown when finalizationData.l1RollingHash does not exist on L1 (Feedback loop).
   */
  error L1RollingHashDoesNotExistOnL1(uint256 messageNumber, bytes32 rollingHash);

  /**
   * @dev Thrown when finalizationData.lastFinalizedTimestamp does not match currentTimestamp.
   */
  error TimestampsNotInSequence(uint256 expected, uint256 value);

  /**
   * @dev Thrown when the last submissionData finalBlockInData does not match finalizationData.finalBlockNumber.
   */
  error FinalBlockNumberInvalid(uint256 expected, uint256 value);

  /**
   * @dev Thrown when finalizationData.dataParentHash does not match parent of _finalizationData.dataHashes[0].
   */
  error ParentHashesDoesNotMatch(bytes32 firstHash, bytes32 secondHash);

  /**
   * @dev Thrown when parent finalStateRootHash does not match _finalizationData.parentStateRootHash.
   */
  error FinalStateRootHashDoesNotMatch(bytes32 firstHash, bytes32 secondHash);

  /**
   * @dev Thrown when data hashes are not in sequence.
   */
  error DataHashesNotInSequence(bytes32 expected, bytes32 value);

  /**
   * @dev Thrown when the first block is greater than final block in submission data.
   */
  error FirstBlockGreaterThanFinalBlock(uint256 firstBlockNumber, uint256 finalBlockNumber);

  /**
   * @dev Thrown when the first block in data is less than or equal to the last finalized block during data submission.
   */
  error FirstBlockLessThanOrEqualToLastFinalizedBlock(uint256 firstBlockNumber, uint256 lastFinalizedBlock);

  /**
   * @dev Thrown when the final block number in finalization data is less than or equal to the last finalized block during finalization.
   */
  error FinalBlockNumberLessThanOrEqualToLastFinalizedBlock(uint256 finalBlockNumber, uint256 lastFinalizedBlock);

  /**
   * @dev Thrown when the final block state equals the zero hash during finalization.
   */
  error FinalBlockStateEqualsZeroHash();

  /**
   * @dev Thrown when final l2 block timestamp higher than current block.timestamp during finalization.
   */
  error FinalizationInTheFuture(uint256 l2BlockTimestamp, uint256 currentBlockTimestamp);

  /**
   * @dev Thrown when a rolling hash is provided without a corresponding message number.
   */
  error MissingMessageNumberForRollingHash(bytes32 rollingHash);

  /**
   * @dev Thrown when a message number is provided without a corresponding rolling hash.
   */
  error MissingRollingHashForMessageNumber(uint256 messageNumber);

  /**
   * @dev Thrown when the first byte is not zero.
   * @dev This is used explicitly with the four bytes in assembly 0x729eebce.
   */
  error FirstByteIsNotZero();

  /**
   * @dev Thrown when bytes length is not a multiple of 32.
   */
  error BytesLengthNotMultipleOf32();

  /**
   * @notice Adds or updated the verifier contract address for a proof type.
   * @dev VERIFIER_SETTER_ROLE is required to execute.
   * @param _newVerifierAddress The address for the verifier contract.
   * @param _proofType The proof type being set/updated.
   */
  function setVerifierAddress(address _newVerifierAddress, uint256 _proofType) external;

  /**
   * @notice Submit compressed data.
   * @dev OPERATOR_ROLE is required to execute.
   * @param _submissionData The full compressed data collection - parentStateRootHash, dataParentHash,
   * finalStateRootHash, firstBlockInData, finalBlockInData, snarkHash, compressedData.
   */
  function submitData(SubmissionData calldata _submissionData) external;

  /**
   * @notice Finalize compressed blocks without proof.
   * @dev DEFAULT_ADMIN_ROLE is required to execute.
   * @param _finalizationData The full finalization data.
   */
  function finalizeCompressedBlocksWithoutProof(FinalizationData calldata _finalizationData) external;

  /**
   * @notice Finalize compressed blocks with proof.
   * @dev OPERATOR_ROLE is required to execute.
   * @param _aggregatedProof The aggregated proof.
   * @param _proofType The proof type.
   * @param _finalizationData The full finalization data.
   */
  function finalizeCompressedBlocksWithProof(
    bytes calldata _aggregatedProof,
    uint256 _proofType,
    FinalizationData calldata _finalizationData
  ) external;
}
