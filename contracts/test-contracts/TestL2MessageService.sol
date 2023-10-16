// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.19;

import { L2MessageService } from "../messageService/l2/L2MessageService.sol";

contract TestL2MessageService is L2MessageService {
  address public originalSender;
  bool private reentryDone;

  function canSendMessage(address _to, uint256 _fee, bytes calldata _calldata) external payable {
    this.sendMessage{ value: msg.value }(_to, _fee, _calldata);
  }

  function setSender() external payable {
    (bool success, bytes memory data) = msg.sender.call(abi.encodeWithSignature("sender()"));
    if (success) {
      originalSender = abi.decode(data, (address));
    }
  }

  function callMessageServiceBase(address _messageServiceBase) external payable {
    (bool success, ) = _messageServiceBase.call(abi.encodeWithSignature("withOnlyMessagingService()"));
    if (!success) {
      revert("Not authorized");
    }
  }

  function doReentry() external payable {
    address originalAddress;

    (bool success, bytes memory data) = msg.sender.call(abi.encodeWithSignature("sender()"));
    if (success) {
      originalAddress = abi.decode(data, (address));
    }

    if (!reentryDone) {
      (bool succeeded, bytes memory dataInner) = msg.sender.call(
        abi.encodeWithSignature(
          "claimMessage(address,address,uint256,uint256,address,bytes,uint256)",
          originalAddress,
          originalAddress,
          0.05 ether,
          1 ether,
          address(0),
          abi.encodeWithSignature("doReentry()")
        )
      );

      if (succeeded) {
        reentryDone = true;
      } else {
        if (dataInner.length > 0) {
          assembly {
            let data_size := mload(dataInner)
            revert(add(32, dataInner), data_size)
          }
        } else {
          revert("Function call reverted");
        }
      }
    }
  }

  function addFunds() external payable {}

  fallback() external payable {
    revert();
  }

  receive() external payable override {
    revert();
  }
}
