// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.22;

import { L1MessageManager } from "../messageService/l1/L1MessageManager.sol";

contract TestL1MessageManager is L1MessageManager {
  ///@dev V1
  function addL2L1MessageHash(bytes32 _messageHash) external {
    _addL2L1MessageHash(_messageHash);
  }

  function updateL2L1MessageStatusToClaimed(bytes32 _messageHash) external {
    _updateL2L1MessageStatusToClaimed(_messageHash);
  }

  function addL1L2MessageHash(bytes32 _messageHash) external {
    _addL1L2MessageHash(_messageHash);
  }

  function updateL1L2MessageStatusToReceived(bytes32[] calldata _messageHashes) external {
    _updateL1L2MessageStatusToReceived(_messageHashes);
  }

  ///@dev V2
  function setL2L1MessageToClaimed(uint256 _messageNumber) external {
    _setL2L1MessageToClaimed(_messageNumber);
  }

  function addL2MerkleRoots(bytes32[] calldata _newRoot, uint256 _treeDepth) external {
    _addL2MerkleRoots(_newRoot, _treeDepth);
  }

  function anchorL2MessagingBlocks(bytes calldata _l2MessagingBlocksOffsets, uint256 _currentL2BlockNumber) external {
    _anchorL2MessagingBlocks(_l2MessagingBlocksOffsets, _currentL2BlockNumber);
  }
}
