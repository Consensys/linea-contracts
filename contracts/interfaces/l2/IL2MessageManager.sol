// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.19;

/**
 * @title Interface declaring cross-chain messaging on L2 functions, events and errors.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */
interface IL2MessageManager {
  /**
   * @dev Emitted after all messages are anchored on L2 and the latest message index rolling hash stored.
   * @dev NB: This event is used to provide data to the rollup. The last messageNumber and rollingHash,
   * emitted in a rollup will be used in the public input for validating the L1->L2 messaging state transition.
   */
  event RollingHashUpdated(uint256 indexed messageNumber, bytes32 indexed rollingHash);

  /**
   * @dev Reverts when message number synchronization is mismatched.
   */
  error L1MessageNumberSynchronizationWrong(uint256 expected, uint256 found);

  /**
   * @dev Reverts when rolling hash synchronization is mismatched.
   */
  error L1RollingHashSynchronizationWrong(bytes32 expected, bytes32 found);

  /**
   * @dev Reverts when final rolling hash is zero hash.
   */
  error FinalRollingHashIsZero();

  /**
   * @dev Reverts when old anchoring method is used post migration.
   */
  error ServiceHasMigratedToRollingHashes();

  /**
   * @dev Emitted when the service switches over to a new version.
   */
  event ServiceVersionMigrated(uint256 indexed version);

  /**
   * @notice Anchor L1-> L2 message hashes.
   * @param _messageHashes New message hashes to anchor on L2.
   */
  function addL1L2MessageHashes(bytes32[] calldata _messageHashes) external;

  /**
   * @notice Anchor L1-> L2 message hashes with expected message number and rolling hash.
   * @dev Reverts if computed rolling hash and ending message number don't match.
   * @param _messageHashes New message hashes to anchor on L2.
   * @param _startingMessageNumber The expected L1 message number to start when anchoring.
   * @param _finalMessageNumber The expected L1 message number to end on when anchoring.
   * @param _finalRollingHash The expected L1 rolling hash to end on when anchoring.
   */
  function anchorL1L2MessageHashes(
    bytes32[] calldata _messageHashes,
    uint256 _startingMessageNumber,
    uint256 _finalMessageNumber,
    bytes32 _finalRollingHash
  ) external;
}
