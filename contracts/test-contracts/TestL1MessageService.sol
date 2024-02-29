// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.22;

import { L1MessageService } from "../messageService/l1/L1MessageService.sol";

contract TestL1MessageService is L1MessageService {
  address public originalSender;
  bool private reentryDone;

  function initialize(
    address _limitManagerAddress,
    address _pauserManagerAddress,
    uint256 _rateLimitPeriod,
    uint256 _rateLimitAmount,
    uint256 _systemMigrationBlock
  ) public initializer {
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    __MessageService_init(
      _limitManagerAddress,
      _pauserManagerAddress,
      _rateLimitPeriod,
      _rateLimitAmount,
      _systemMigrationBlock
    );
  }

  function tryInitialize(
    address _limitManagerAddress,
    address _pauserManagerAddress,
    uint256 _rateLimitPeriod,
    uint256 _rateLimitAmount,
    uint256 _systemMigrationBlock
  ) external {
    __MessageService_init(
      _limitManagerAddress,
      _pauserManagerAddress,
      _rateLimitPeriod,
      _rateLimitAmount,
      _systemMigrationBlock
    );
  }

  // @dev - the this. sendMessage is because the function is an "external" call and not wrapped
  function canSendMessage(address _to, uint256 _fee, bytes calldata _calldata) external payable {
    this.sendMessage{ value: msg.value }(_to, _fee, _calldata);
  }

  function addL2L1MessageHash(bytes32 _messageHash) external {
    _addL2L1MessageHash(_messageHash);
  }

  function setSender() external payable {
    (bool success, bytes memory data) = msg.sender.call(abi.encodeWithSignature("sender()"));
    if (success) {
      originalSender = abi.decode(data, (address));
    }
  }

  function sendNewMessage() external payable {
    this.sendMessage{ value: 1 wei }(address(this), 1, "0x");
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
          abi.encodeWithSignature("doReentry()", 1)
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

  function nonInitializedTest(uint256 _systemMigrationBlock) external {
    __SystemMigrationBlock_init(_systemMigrationBlock);
  }

  function setSystemMigrationBlock(uint256 _systemMigrationBlock) external reinitializer(2) {
    __SystemMigrationBlock_init(_systemMigrationBlock);
  }

  function resetSystemMigrationBlock(uint256 _systemMigrationBlock) external reinitializer(3) {
    __SystemMigrationBlock_init(_systemMigrationBlock);
  }

  function addFunds() external payable {}
}
