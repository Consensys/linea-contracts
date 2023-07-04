// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.19;

import "../interfaces/IPlonkVerifier.sol";

/// @dev Test verifier contract that returns true.
contract IntegrationTestTrueVerifier is IPlonkVerifier {
  function Verify(bytes memory proof, uint256[] memory public_inputs) external view returns (bool) {
    return true;
  }
}
