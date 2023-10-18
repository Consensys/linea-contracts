// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.19;

interface IZkEvmV2 {
  /**
   * @dev blockRootHash is the calculated root hash of the block.
   * @dev l2BlockTimestamp corresponds to the time the block was produced.
   * @dev transactions is the transaction collection on the block RLP encoded.
   * @dev l2ToL1MsgHashes collection contains all the hashes for L2 to L1 anchoring.
   * @dev fromAddresses is a concatonation of all the from addresses for the transactions.
   * @dev batchReceptionIndices defines which transactions in the collection are L2 to L1 messages.
   */
  struct BlockData {
    bytes32 blockRootHash;
    uint32 l2BlockTimestamp;
    bytes[] transactions;
    bytes32[] l2ToL1MsgHashes;
    bytes fromAddresses;
    uint16[] batchReceptionIndices;
  }

  /**
   * @dev Emitted when a L2 block has been finalized on L1
   */
  event BlockFinalized(uint256 indexed blockNumber, bytes32 indexed stateRootHash, bool indexed finalizedWithProof);
  /**
   * @dev Emitted when a L2 blocks have been finalized on L1
   */
  event BlocksVerificationDone(uint256 indexed lastBlockFinalized, bytes32 startingRootHash, bytes32 finalRootHash);

  /**
   * @dev Emitted when a verifier is set for a particular proof type
   */
  event VerifierAddressChanged(
    address indexed verifierAddress,
    uint256 indexed proofType,
    address indexed verifierSetBy,
    address oldVerifierAddress
  );

  /**
   * @dev Thrown when l2 block timestamp is not correct
   */
  error BlockTimestampError(uint256 l2BlockTimestamp, uint256 currentBlockTimestamp);

  /**
   * @dev Thrown when the starting rootHash does not match the existing state
   */
  error StartingRootHashDoesNotMatch();

  /**
   * @dev Thrown when blockData is empty
   */
  error EmptyBlockDataArray();

  /**
   * @dev Thrown when block contains zero transactions
   */
  error EmptyBlock();

  /**
   * @dev Thrown when zk proof is empty bytes
   */
  error ProofIsEmpty();

  /**
   * @dev Thrown when zk proof type is invalid
   */
  error InvalidProofType();

  /**
   * @dev Thrown when zk proof is invalid
   */
  error InvalidProof();

  /**
   * @notice Adds or updated the verifier contract address for a proof type
   * @dev DEFAULT_ADMIN_ROLE is required to execute
   * @param _newVerifierAddress The address for the verifier contract
   * @param _proofType The proof type being set/updated
   */
  function setVerifierAddress(address _newVerifierAddress, uint256 _proofType) external;

  /**
   * @notice Finalizes blocks without using a proof
   * @dev DEFAULT_ADMIN_ROLE is required to execute
   * @param _calldata The full BlockData collection - block, transaction and log data
   */
  function finalizeBlocksWithoutProof(BlockData[] calldata _calldata) external;

  /**
   * @notice Finalizes blocks using a proof.
   * @dev OPERATOR_ROLE is required to execute.
   * @dev If the verifier based on proof type is not found, it reverts.
   * @param _blocksData The full BlockData collection - block, transaction and log data.
   * @param _proof The proof to be verified with the proof type verifier contract.
   * @param _proofType The proof type to determine which verifier contract to use.
   * @param _parentStateRootHash The starting roothash for the last known block.
   */
  function finalizeBlocks(
    BlockData[] calldata _blocksData,
    bytes calldata _proof,
    uint256 _proofType,
    bytes32 _parentStateRootHash
  ) external;
}
