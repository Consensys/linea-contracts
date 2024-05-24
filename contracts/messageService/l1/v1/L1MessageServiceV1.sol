// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { PauseManager } from "../../lib/PauseManager.sol";
import { RateLimiter } from "../../lib/RateLimiter.sol";
import { L1MessageManagerV1 } from "./L1MessageManagerV1.sol";
import { TransientStorageReentrancyGuardUpgradeable } from "../TransientStorageReentrancyGuardUpgradeable.sol";
import { IMessageService } from "../../../interfaces/IMessageService.sol";
import { TransientStorageHelpers } from "../../lib/TransientStorageHelpers.sol";

/**
 * @title Contract to manage cross-chain messaging on L1.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */
abstract contract L1MessageServiceV1 is
  Initializable,
  RateLimiter,
  L1MessageManagerV1,
  TransientStorageReentrancyGuardUpgradeable,
  PauseManager,
  IMessageService
{
  // @dev This is initialised to save user cost with existing slot.
  uint256 public nextMessageNumber;

  /// @dev DEPRECATED in favor of new transient storage with `MESSAGE_SENDER_TRANSIENT_KEY` key.
  address internal _messageSender;

  /// @dev Total contract storage is 52 slots including the gap below.
  /// @dev Keep 50 free storage slots for future implementation updates to avoid storage collision.
  uint256[50] private __gap;

  /// @dev adding these should not affect storage as they are constants and are stored in bytecode.
  uint256 internal constant REFUND_OVERHEAD_IN_GAS = 48252;

  bytes32 internal constant MESSAGE_SENDER_TRANSIENT_KEY =
    bytes32(uint256(keccak256("eip1967.message.sender.transient.key")) - 1);

  address internal constant DEFAULT_MESSAGE_SENDER_TRANSIENT_VALUE = address(0);

  /**
   * @notice The unspent fee is refunded if applicable.
   * @param _feeInWei The fee paid for delivery in Wei.
   * @param _to The recipient of the message and gas refund.
   * @param _calldata The calldata of the message.
   */
  modifier distributeFees(
    uint256 _feeInWei,
    address _to,
    bytes calldata _calldata,
    address _feeRecipient
  ) {
    //pre-execution
    uint256 startingGas = gasleft();
    _;
    //post-execution

    // we have a fee
    if (_feeInWei > 0) {
      // default postman fee
      uint256 deliveryFee = _feeInWei;

      // do we have empty calldata?
      if (_calldata.length == 0) {
        bool isDestinationEOA;

        assembly {
          isDestinationEOA := iszero(extcodesize(_to))
        }

        // are we calling an EOA
        if (isDestinationEOA) {
          // initial + cost to call and refund minus gasleft
          deliveryFee = (startingGas + REFUND_OVERHEAD_IN_GAS - gasleft()) * tx.gasprice;

          if (_feeInWei > deliveryFee) {
            payable(_to).send(_feeInWei - deliveryFee);
          } else {
            deliveryFee = _feeInWei;
          }
        }
      }

      address feeReceiver = _feeRecipient == address(0) ? msg.sender : _feeRecipient;

      bool callSuccess = payable(feeReceiver).send(deliveryFee);
      if (!callSuccess) {
        revert FeePaymentFailed(feeReceiver);
      }
    }
  }

  /**
   * @notice Claims and delivers a cross-chain message.
   * @dev _feeRecipient can be set to address(0) to receive as msg.sender.
   * @dev _messageSender is set temporarily when claiming and reset post. Used in sender().
   * @dev _messageSender is reset to DEFAULT_SENDER_ADDRESS to be more gas efficient.
   * @param _from The address of the original sender.
   * @param _to The address the message is intended for.
   * @param _fee The fee being paid for the message delivery.
   * @param _value The value to be transferred to the destination address.
   * @param _feeRecipient The recipient for the fee.
   * @param _calldata The calldata to pass to the recipient.
   * @param _nonce The unique auto generated nonce used when sending the message.
   */
  function claimMessage(
    address _from,
    address _to,
    uint256 _fee,
    uint256 _value,
    address payable _feeRecipient,
    bytes calldata _calldata,
    uint256 _nonce
  ) external nonReentrant distributeFees(_fee, _to, _calldata, _feeRecipient) {
    _requireTypeAndGeneralNotPaused(L2_L1_PAUSE_TYPE);

    /// @dev This is placed earlier to fix the stack issue by using these two earlier on.
    TransientStorageHelpers.tstoreAddress(MESSAGE_SENDER_TRANSIENT_KEY, _from);

    bytes32 messageHash = keccak256(abi.encode(_from, _to, _fee, _value, _nonce, _calldata));

    // @dev Status check and revert is in the message manager.
    _updateL2L1MessageStatusToClaimed(messageHash);

    _addUsedAmount(_fee + _value);

    (bool callSuccess, bytes memory returnData) = _to.call{ value: _value }(_calldata);
    if (!callSuccess) {
      if (returnData.length > 0) {
        assembly {
          let data_size := mload(returnData)
          revert(add(32, returnData), data_size)
        }
      } else {
        revert MessageSendingFailed(_to);
      }
    }

    TransientStorageHelpers.tstoreAddress(MESSAGE_SENDER_TRANSIENT_KEY, DEFAULT_MESSAGE_SENDER_TRANSIENT_VALUE);

    emit MessageClaimed(messageHash);
  }
}
