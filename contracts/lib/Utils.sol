// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.8.19 <=0.8.24;

library Utils {
  /**
   * @notice Performs a gas optimized keccak hash.
   * @param _left Left value.
   * @param _right Right value.
   */
  function _efficientKeccak(bytes32 _left, bytes32 _right) internal pure returns (bytes32 value) {
    /// @solidity memory-safe-assembly
    assembly {
      mstore(0x00, _left)
      mstore(0x20, _right)
      value := keccak256(0x00, 0x40)
    }
  }
}
