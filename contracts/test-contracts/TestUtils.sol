// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.24;

import { Utils } from "../lib/Utils.sol";

contract TestUtils {
  function efficientKeccak(bytes32 _left, bytes32 _right) external pure returns (bytes32 value) {
    return Utils._efficientKeccak(_left, _right);
  }
}
