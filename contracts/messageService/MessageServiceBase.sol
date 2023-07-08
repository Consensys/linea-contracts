// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

import "../interfaces/IMessageService.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title Base contract to manage cross-chain messaging.
 * @author ConsenSys Software Inc.
 */
abstract contract MessageServiceBase is Initializable {
  IMessageService public messageService;
  address public remoteSender;

  uint256[10] private __base_gap;

  /**
   * @dev Thrown when the caller address is not the message service address
   */
  error CallerIsNotMessageService();

  /**
   * @dev Thrown when remote sender address is not authorized.
   */
  error SenderNotAuthorized();

  /**
   * @dev Thrown when an address is the default zero address.
   */
  error ZeroAddressNotAllowed();

  /**
   * @dev Modifier to make sure the caller is the known message service.
   *
   * Requirements:
   *
   * - The msg.sender must be the message service.
   */
  modifier onlyMessagingService() {
    if (msg.sender != address(messageService)) {
      revert CallerIsNotMessageService();
    }
    _;
  }

  /**
   * @dev Modifier to make sure the original sender is allowed.
   *
   * Requirements:
   *
   * - The original message sender via the message service must be a known sender.
   */
  modifier onlyAuthorizedRemoteSender() {
    if (messageService.sender() != remoteSender) {
      revert SenderNotAuthorized();
    }
    _;
  }

  /**
   * @notice Initializes the message service and remote sender address
   * @dev Must be initialized in the initialize function of the main contract or constructor
   * @param _messageService The message service address, cannot be empty.
   * @param _remoteSender The authorized remote sender address, cannot be empty.
   **/
  function __MessageServiceBase_init(address _messageService, address _remoteSender) internal onlyInitializing {
    if (_messageService == address(0)) {
      revert ZeroAddressNotAllowed();
    }

    if (_remoteSender == address(0)) {
      revert ZeroAddressNotAllowed();
    }

    messageService = IMessageService(_messageService);
    remoteSender = _remoteSender;
  }
}
