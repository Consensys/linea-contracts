// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.24;

import { IL1MessageManagerV1 } from "../../../interfaces/l1/IL1MessageManagerV1.sol";

/**
 * @title Contract to manage cross-chain message hashes storage and status on L1.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */
abstract contract L1MessageManagerV1 is IL1MessageManagerV1 {
  uint8 public constant INBOX_STATUS_UNKNOWN = 0;
  uint8 public constant INBOX_STATUS_RECEIVED = 1;

  uint8 public constant OUTBOX_STATUS_UNKNOWN = 0;
  uint8 public constant OUTBOX_STATUS_SENT = 1;
  uint8 public constant OUTBOX_STATUS_RECEIVED = 2;

  /// @dev Mapping to store L1->L2 message hashes status.
  /// @dev messageHash => messageStatus (0: unknown, 1: sent, 2: received).
  mapping(bytes32 messageHash => uint256 messageStatus) public outboxL1L2MessageStatus;

  /// @dev Mapping to store L2->L1 message hashes status.
  /// @dev messageHash => messageStatus (0: unknown, 1: received).
  mapping(bytes32 messageHash => uint256 messageStatus) public inboxL2L1MessageStatus;

  /// @dev Keep free storage slots for future implementation updates to avoid storage collision.
  // *******************************************************************************************
  // NB: THIS GAP HAS BEEN PUSHED OUT IN FAVOUR OF THE GAP INSIDE THE REENTRANCY CODE
  //uint256[50] private __gap;
  // NB: DO NOT USE THIS GAP
  // *******************************************************************************************

  /// @dev Total contract storage is 2 slots.

  /**
   * @notice Update the status of L2->L1 message when a user claims a message on L1.
   * @dev The L2->L1 message is removed from storage.
   * @dev Due to the nature of the rollup, we should not get a second entry of this.
   * @param  _messageHash Hash of the message.
   */
  function _updateL2L1MessageStatusToClaimed(bytes32 _messageHash) internal {
    if (inboxL2L1MessageStatus[_messageHash] != INBOX_STATUS_RECEIVED) {
      revert MessageDoesNotExistOrHasAlreadyBeenClaimed(_messageHash);
    }

    delete inboxL2L1MessageStatus[_messageHash];
  }
}
