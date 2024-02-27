// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.22;

import { CodecV2 } from "../messageService/lib/Codec.sol";

contract TestCodecV2 {
  function extractHashesTest(bytes calldata _data) external pure returns (bytes32[] memory) {
    return CodecV2._extractXDomainAddHashes(_data);
  }
}
