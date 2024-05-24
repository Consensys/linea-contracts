// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.24;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { L1MessageServiceV1 } from "./v1/L1MessageServiceV1.sol";
import { L1MessageManager } from "./L1MessageManager.sol";
import { IL1MessageService } from "../../interfaces/l1/IL1MessageService.sol";
import { IGenericErrors } from "../../interfaces/IGenericErrors.sol";
import { SparseMerkleTreeVerifier } from "../lib/SparseMerkleTreeVerifier.sol";
import { TransientStorageHelpers } from "../lib/TransientStorageHelpers.sol";

/**
 * @title Contract to manage cross-chain messaging on L1.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */
abstract contract L1MessageService is
  AccessControlUpgradeable,
  L1MessageServiceV1,
  L1MessageManager,
  IL1MessageService,
  IGenericErrors
{
  using SparseMerkleTreeVerifier for *;
  using TransientStorageHelpers for *;

  /// @dev This is currently not in use, but is reserved for future upgrades.
  uint256 public systemMigrationBlock;

  /// @dev Total contract storage is 51 slots including the gap below.
  /// @dev Keep 50 free storage slots for future implementation updates to avoid storage collision.
  uint256[50] private __gap_L1MessageService;

  /**
   * @notice Initialises underlying message service dependencies.
   * @dev _messageSender is initialised to a non-zero value for gas efficiency on claiming.
   * @param _limitManagerAddress The address owning the rate limiting management role.
   * @param _pauseManagerAddress The address owning the pause management role.
   * @param _rateLimitPeriod The period to rate limit against.
   * @param _rateLimitAmount The limit allowed for withdrawing the period.
   */
  function __MessageService_init(
    address _limitManagerAddress,
    address _pauseManagerAddress,
    uint256 _rateLimitPeriod,
    uint256 _rateLimitAmount
  ) internal onlyInitializing {
    if (_limitManagerAddress == address(0)) {
      revert ZeroAddressNotAllowed();
    }

    if (_pauseManagerAddress == address(0)) {
      revert ZeroAddressNotAllowed();
    }

    __ERC165_init();
    __Context_init();
    __AccessControl_init();
    __RateLimiter_init(_rateLimitPeriod, _rateLimitAmount);

    _grantRole(RATE_LIMIT_SETTER_ROLE, _limitManagerAddress);
    _grantRole(PAUSE_MANAGER_ROLE, _pauseManagerAddress);

    nextMessageNumber = 1;
  }

  /**
   * @notice Adds a message for sending cross-chain and emits MessageSent.
   * @dev The message number is preset (nextMessageNumber) and only incremented at the end if successful for the next caller.
   * @dev This function should be called with a msg.value = _value + _fee. The fee will be paid on the destination chain.
   * @param _to The address the message is intended for.
   * @param _fee The fee being paid for the message delivery.
   * @param _calldata The calldata to pass to the recipient.
   */
  function sendMessage(
    address _to,
    uint256 _fee,
    bytes calldata _calldata
  ) external payable whenTypeAndGeneralNotPaused(L1_L2_PAUSE_TYPE) {
    if (_to == address(0)) {
      revert ZeroAddressNotAllowed();
    }

    if (_fee > msg.value) {
      revert ValueSentTooLow();
    }

    uint256 messageNumber = nextMessageNumber++;
    uint256 valueSent = msg.value - _fee;

    bytes32 messageHash = keccak256(abi.encode(msg.sender, _to, _fee, valueSent, messageNumber, _calldata));

    _addRollingHash(messageNumber, messageHash);

    emit MessageSent(msg.sender, _to, _fee, valueSent, messageNumber, _calldata, messageHash);
  }

  /**
   * @notice Claims and delivers a cross-chain message using merkle proof.
   * @dev if merkle depth is empty, it will revert with L2MerkleRootDoesNotExist.
   * @dev if merkle depth is different than proof size, it will revert with ProofLengthDifferentThanMerkleDepth.
   * @param _params Collection of claim data with proof and supporting data.
   */
  function claimMessageWithProof(
    ClaimMessageWithProofParams calldata _params
  ) external nonReentrant distributeFees(_params.fee, _params.to, _params.data, _params.feeRecipient) {
    _requireTypeAndGeneralNotPaused(L2_L1_PAUSE_TYPE);

    uint256 merkleDepth = l2MerkleRootsDepths[_params.merkleRoot];

    if (merkleDepth == 0) {
      revert L2MerkleRootDoesNotExist();
    }

    if (merkleDepth != _params.proof.length) {
      revert ProofLengthDifferentThanMerkleDepth(merkleDepth, _params.proof.length);
    }

    _setL2L1MessageToClaimed(_params.messageNumber);

    _addUsedAmount(_params.fee + _params.value);

    bytes32 messageLeafHash = keccak256(
      abi.encode(_params.from, _params.to, _params.fee, _params.value, _params.messageNumber, _params.data)
    );

    if (
      !SparseMerkleTreeVerifier._verifyMerkleProof(
        messageLeafHash,
        _params.proof,
        _params.leafIndex,
        _params.merkleRoot
      )
    ) {
      revert InvalidMerkleProof();
    }

    TransientStorageHelpers.tstoreAddress(MESSAGE_SENDER_TRANSIENT_KEY, _params.from);

    (bool callSuccess, bytes memory returnData) = _params.to.call{ value: _params.value }(_params.data);
    if (!callSuccess) {
      if (returnData.length > 0) {
        assembly {
          let data_size := mload(returnData)
          revert(add(32, returnData), data_size)
        }
      } else {
        revert MessageSendingFailed(_params.to);
      }
    }

    TransientStorageHelpers.tstoreAddress(MESSAGE_SENDER_TRANSIENT_KEY, DEFAULT_MESSAGE_SENDER_TRANSIENT_VALUE);

    emit MessageClaimed(messageLeafHash);
  }

  /**
   * @notice Claims and delivers a cross-chain message.
   * @dev The message sender address is set temporarily in the transient storage when claiming.
   * @return addr The message sender address that is stored temporarily in the transient storage when claiming.
   */
  function sender() external view returns (address addr) {
    return TransientStorageHelpers.tloadAddress(MESSAGE_SENDER_TRANSIENT_KEY);
  }
}
