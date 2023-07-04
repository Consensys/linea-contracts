// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.19;

import "../messageService/lib/Codec.sol";
import "../interfaces/IL2MessageManager.sol";
import "../interfaces/IMessageService.sol";

contract TestCodecV2 {
  function extractHashesTest(bytes calldata _data) external pure returns (bytes32[] memory) {
    return CodecV2._extractXDomainAddHashes(_data);
  }
}
