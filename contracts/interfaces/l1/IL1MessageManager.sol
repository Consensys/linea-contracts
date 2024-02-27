// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.22;

/**
 * @title L1 Message manager interface for current functions, events and errors.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */
interface IL1MessageManager {
  /**
   * @dev Emitted when a new message is sent and the rolling hash updated.
   */
  event RollingHashUpdated(uint256 indexed messageNumber, bytes32 indexed rollingHash, bytes32 indexed messageHash);

  /**
   * @dev Emitted when the l2 merkle root has been anchored on L1.
   */
  event L2MerkleRootAdded(bytes32 indexed l2MerkleRoot, uint256 indexed treeDepth);

  /**
   * @dev Emitted when the l2 block contains L2 messages during finalization
   */
  event L2MessagingBlockAnchored(uint256 indexed l2Block);

  /**
   * @dev Thrown when the message has already been claimed.
   */
  error MessageAlreadyClaimed(uint256 messageIndex);

  /**
   * @dev Thrown when the L2 merkle root has already been anchored on L1.
   */
  error L2MerkleRootAlreadyAnchored(bytes32 merkleRoot);

  /**
   * @dev Thrown when the L2 messaging blocks offsets bytes length is not a multiple of 2.
   */
  error BytesLengthNotMultipleOfTwo(uint256 bytesLength);

  /**
   * @notice Check if the L2->L1 message is claimed or not.
   * @param _messageNumber The message number on L2.
   */
  function isMessageClaimed(uint256 _messageNumber) external view returns (bool);
}
