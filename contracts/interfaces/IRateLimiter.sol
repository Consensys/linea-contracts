// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.19 <=0.8.24;

/**
 * @title Interface declaring rate limiting messaging functions, events and errors.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */
interface IRateLimiter {
  /**
   * @notice Emitted when the Rate Limit is initialized.
   * @param periodInSeconds The time period in seconds the rate limiter has been initialized to.
   * @param limitInWei The limit in Wei the rate limiter has been initialized to.
   * @param currentPeriodEnd The time the current rate limit period will end.
   */
  event RateLimitInitialized(uint256 periodInSeconds, uint256 limitInWei, uint256 currentPeriodEnd);

  /**
   * @notice Emitted when the amount in the period is reset to zero.
   * @param resettingAddress The indexed address of who reset the used amount back to zero.
   */
  event AmountUsedInPeriodReset(address indexed resettingAddress);

  /**
   * @notice Emitted when the limit is changed.
   * @param amountChangeBy The indexed address of who changed the rate limit.
   * @param amount The rate limited amount in Wei that was set.
   * @param amountUsedLoweredToLimit Indicates if the amount used was lowered to the limit to avoid confusion.
   * @param usedAmountResetToZero Indicates if the amount used was set to zero because of the current period expiring.
   * @dev If the current used amount is higher than the new limit, the used amount is lowered to the limit.
   * @dev amountUsedLoweredToLimit and usedAmountResetToZero cannot be true at the same time.
   */
  event LimitAmountChanged(
    address indexed amountChangeBy,
    uint256 amount,
    bool amountUsedLoweredToLimit,
    bool usedAmountResetToZero
  );

  /**
   * @dev Thrown when an amount breaches the limit in the period.
   */
  error RateLimitExceeded();

  /**
   * @dev Thrown when the period is initialised to zero.
   */
  error PeriodIsZero();

  /**
   * @dev Thrown when the limit is initialised to zero.
   */
  error LimitIsZero();

  /**
   * @notice Resets the rate limit amount to the amount specified.
   * @param _amount sets the new limit amount.
   */
  function resetRateLimitAmount(uint256 _amount) external;

  /**
   * @notice Resets the amount used in the period to zero.
   */
  function resetAmountUsedInPeriod() external;
}
