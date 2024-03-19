// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.24;

import { BitMaps } from "@openzeppelin/contracts/utils/structs/BitMaps.sol";
import { L1MessageManagerV1 } from "./v1/L1MessageManagerV1.sol";
import { IL1MessageManager } from "../../interfaces/l1/IL1MessageManager.sol";
import { Utils } from "../../lib/Utils.sol";

/**
 * @title Contract to manage cross-chain message rolling hash computation and storage on L1.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */
abstract contract L1MessageManager is L1MessageManagerV1, IL1MessageManager {
  using BitMaps for BitMaps.BitMap;
  using Utils for *;

  mapping(uint256 messageNumber => bytes32 rollingHash) public rollingHashes;
  BitMaps.BitMap internal _messageClaimedBitMap;
  mapping(bytes32 merkleRoot => uint256 treeDepth) public l2MerkleRootsDepths;

  /// @dev Total contract storage is 53 slots including the gap below.
  /// @dev Keep 50 free storage slots for future implementation updates to avoid storage collision.
  uint256[50] private __gap_L1MessageManager;

  /**
   * @notice Take an existing message hash, calculates the rolling hash and stores at the message number.
   * @param _messageNumber The current message number being sent.
   * @param _messageHash The hash of the message being sent.
   */
  function _addRollingHash(uint256 _messageNumber, bytes32 _messageHash) internal {
    unchecked {
      bytes32 newRollingHash = Utils._efficientKeccak(rollingHashes[_messageNumber - 1], _messageHash);

      rollingHashes[_messageNumber] = newRollingHash;
      emit RollingHashUpdated(_messageNumber, newRollingHash, _messageHash);
    }
  }

  /**
   * @notice Set the L2->L1 message as claimed when a user claims a message on L1.
   * @param  _messageNumber The message number on L2.
   */
  function _setL2L1MessageToClaimed(uint256 _messageNumber) internal {
    if (_messageClaimedBitMap.get(_messageNumber)) {
      revert MessageAlreadyClaimed(_messageNumber);
    }
    _messageClaimedBitMap.set(_messageNumber);
  }

  /**
   * @notice Add the L2 merkle roots to the storage.
   * @dev This function is called during block finalization.
   * @param _newRoots New L2 merkle roots.
   */
  function _addL2MerkleRoots(bytes32[] calldata _newRoots, uint256 _treeDepth) internal {
    for (uint256 i; i < _newRoots.length; ++i) {
      if (l2MerkleRootsDepths[_newRoots[i]] != 0) {
        revert L2MerkleRootAlreadyAnchored(_newRoots[i]);
      }

      l2MerkleRootsDepths[_newRoots[i]] = _treeDepth;

      emit L2MerkleRootAdded(_newRoots[i], _treeDepth);
    }
  }

  /**
   * @notice Emit an event for each L2 block containing L2->L1 messages.
   * @dev This function is called during block finalization.
   * @param _l2MessagingBlocksOffsets Is a sequence of uint16 values, where each value plus the last finalized L2 block number.
   * indicates which L2 blocks have L2->L1 messages.
   * @param _currentL2BlockNumber Last L2 block number finalized on L1.
   */
  function _anchorL2MessagingBlocks(bytes calldata _l2MessagingBlocksOffsets, uint256 _currentL2BlockNumber) internal {
    if (_l2MessagingBlocksOffsets.length % 2 != 0) {
      revert BytesLengthNotMultipleOfTwo(_l2MessagingBlocksOffsets.length);
    }

    uint256 l2BlockOffset;
    unchecked {
      for (uint256 i; i < _l2MessagingBlocksOffsets.length; ) {
        assembly {
          l2BlockOffset := shr(240, calldataload(add(_l2MessagingBlocksOffsets.offset, i)))
        }
        emit L2MessagingBlockAnchored(_currentL2BlockNumber + l2BlockOffset);
        i += 2;
      }
    }
  }

  /**
   * @notice Check if the L2->L1 message is claimed or not.
   * @param _messageNumber The message number on L2.
   */
  function isMessageClaimed(uint256 _messageNumber) external view returns (bool) {
    return _messageClaimedBitMap.get(_messageNumber);
  }
}
