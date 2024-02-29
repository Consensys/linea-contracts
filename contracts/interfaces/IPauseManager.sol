// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.19 <=0.8.22;

/**
 * @title Interface declaring pre-existing pausing functions, events and errors.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */
interface IPauseManager {
  /**
   * @dev Thrown when a specific pause type is paused.
   */
  error IsPaused(uint256 pauseType);

  /**
   * @dev Thrown when a specific pause type is not paused and expected to be.
   */
  error IsNotPaused(uint256 pauseType);

  /**
   * @dev Emitted when a pause type is paused.
   */
  event Paused(address messageSender, uint256 indexed pauseType);

  /**
   * @dev Emitted when a pause type is unpaused.
   */
  event UnPaused(address messageSender, uint256 indexed pauseType);
}
