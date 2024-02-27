// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.22;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { L1MessageServiceV1 } from "./messageService/l1/v1/L1MessageServiceV1.sol";
import { IZkEvmV2 } from "./interfaces/l1/IZkEvmV2.sol";
import { TransactionDecoder } from "./messageService/lib/TransactionDecoder.sol";
import { CodecV2 } from "./messageService/lib/Codec.sol";
import { IPlonkVerifier } from "./interfaces/l1/IPlonkVerifier.sol";

/**
 * @title Contract to manage cross-chain messaging on L1 and rollup proving.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */
abstract contract ZkEvmV2 is Initializable, AccessControlUpgradeable, L1MessageServiceV1, IZkEvmV2 {
  using TransactionDecoder for *;
  using CodecV2 for *;

  uint256 internal constant MODULO_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
  bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

  uint256 public currentTimestamp;
  uint256 public currentL2BlockNumber;

  mapping(uint256 blockNumber => bytes32 stateRootHash) public stateRootHashes;
  mapping(uint256 proofType => address verifierAddress) public verifiers;

  uint256[50] private __gap;

  /**
   * @notice Finalizes blocks without using a proof.
   * @dev DEFAULT_ADMIN_ROLE is required to execute.
   * @dev _blocksData[0].fromAddresses is a temporary workaround to pass bytes calldata.
   * @param _blocksData The full BlockData collection - block, transaction and log data.
   */
  function finalizeBlocksWithoutProof(
    BlockData[] calldata _blocksData
  ) external whenTypeNotPaused(GENERAL_PAUSE_TYPE) onlyRole(DEFAULT_ADMIN_ROLE) {
    _finalizeBlocks(_blocksData, _blocksData[0].fromAddresses, 0, bytes32(0), false);
  }

  /**
   * @notice Finalizes blocks using a proof.
   * @dev OPERATOR_ROLE is required to execute.
   * @dev If the verifier based on proof type is not found, it reverts.
   * @param _blocksData The full BlockData collection - block, transaction and log data.
   * @param _proof The proof to be verified with the proof type verifier contract.
   * @param _proofType The proof type to determine which verifier contract to use.
   * @param _parentStateRootHash The starting roothash for the last known block.
   */
  function finalizeBlocks(
    BlockData[] calldata _blocksData,
    bytes calldata _proof,
    uint256 _proofType,
    bytes32 _parentStateRootHash
  ) external whenTypeAndGeneralNotPaused(PROVING_SYSTEM_PAUSE_TYPE) onlyRole(OPERATOR_ROLE) {
    if (stateRootHashes[currentL2BlockNumber] != _parentStateRootHash) {
      revert StartingRootHashDoesNotMatch();
    }

    _finalizeBlocks(_blocksData, _proof, _proofType, _parentStateRootHash, true);
  }

  /**
   * @notice Finalizes blocks with or without using a proof depending on _withProof.
   * @dev OPERATOR_ROLE is required to execute.
   * @dev If the verifier based on proof type is not found, it reverts.
   * @param _blocksData The full BlockData collection - block, transaction and log data.
   * @param _proof The proof to be verified with the proof type verifier contract.
   * @param _proofType The proof type to determine which verifier contract to use.
   * @param _parentStateRootHash The starting roothash for the last known block.
   */
  function _finalizeBlocks(
    BlockData[] calldata _blocksData,
    bytes calldata _proof,
    uint256 _proofType,
    bytes32 _parentStateRootHash,
    bool _withProof
  ) private {
    if (_blocksData.length == 0) {
      revert EmptyBlockDataArray();
    }

    uint256 currentBlockNumberTemp = currentL2BlockNumber;

    uint256 firstBlockNumber;
    unchecked {
      firstBlockNumber = currentBlockNumberTemp + 1;
    }

    uint256[] memory timestamps = new uint256[](_blocksData.length);
    bytes32[] memory blockHashes = new bytes32[](_blocksData.length);
    bytes32[] memory rootHashes;

    unchecked {
      rootHashes = new bytes32[](_blocksData.length + 1);
    }

    rootHashes[0] = _parentStateRootHash;

    bytes32 hashOfTxHashes;
    bytes32 hashOfMessageHashes;

    for (uint256 i; i < _blocksData.length; ++i) {
      BlockData calldata blockInfo = _blocksData[i];

      if (blockInfo.l2BlockTimestamp >= block.timestamp) {
        revert BlockTimestampError(blockInfo.l2BlockTimestamp, block.timestamp);
      }

      hashOfTxHashes = _processBlockTransactions(blockInfo.transactions, blockInfo.batchReceptionIndices);
      hashOfMessageHashes = _processMessageHashes(blockInfo.l2ToL1MsgHashes);
      unchecked {
        ++currentBlockNumberTemp;
      }
      blockHashes[i] = keccak256(
        abi.encodePacked(
          hashOfTxHashes,
          hashOfMessageHashes,
          keccak256(abi.encodePacked(blockInfo.batchReceptionIndices)),
          keccak256(blockInfo.fromAddresses)
        )
      );

      timestamps[i] = blockInfo.l2BlockTimestamp;
      unchecked {
        rootHashes[i + 1] = blockInfo.blockRootHash;
      }
      emit BlockFinalized(currentBlockNumberTemp, blockInfo.blockRootHash, _withProof);
    }

    unchecked {
      uint256 arrayIndex = _blocksData.length - 1;
      stateRootHashes[currentBlockNumberTemp] = _blocksData[arrayIndex].blockRootHash;
      currentTimestamp = _blocksData[arrayIndex].l2BlockTimestamp;
      currentL2BlockNumber = currentBlockNumberTemp;
    }

    if (_withProof) {
      uint256 publicInput = uint256(
        keccak256(
          abi.encode(
            keccak256(abi.encodePacked(blockHashes)),
            firstBlockNumber,
            keccak256(abi.encodePacked(timestamps)),
            keccak256(abi.encodePacked(rootHashes))
          )
        )
      );

      assembly {
        publicInput := mod(publicInput, MODULO_R)
      }

      _verifyProof(publicInput, _proofType, _proof, _parentStateRootHash);
    }
  }

  /**
   * @notice Hashes all transactions individually and then hashes the packed hash array.
   * @dev Updates the outbox status on L1 as received.
   * @param _transactions The transactions in a particular block.
   * @param _batchReceptionIndices The indexes where the transaction type is the L1->L2 anchoring message hashes transaction.
   */
  function _processBlockTransactions(
    bytes[] calldata _transactions,
    uint16[] calldata _batchReceptionIndices
  ) internal returns (bytes32 hashOfTxHashes) {
    bytes32[] memory transactionHashes = new bytes32[](_transactions.length);

    if (_transactions.length == 0) {
      revert EmptyBlock();
    }

    for (uint256 i; i < _batchReceptionIndices.length; ++i) {
      _updateL1L2MessageStatusToReceived(
        TransactionDecoder.decodeTransaction(_transactions[_batchReceptionIndices[i]])._extractXDomainAddHashes()
      );
    }

    for (uint256 i; i < _transactions.length; ++i) {
      transactionHashes[i] = keccak256(_transactions[i]);
    }
    hashOfTxHashes = keccak256(abi.encodePacked(transactionHashes));
  }

  /**
   * @notice Anchors message hashes and hashes the packed hash array.
   * @dev Also adds L2->L1 sent message hashes for later claiming.
   * @param _messageHashes The hashes in the message sent event logs.
   */
  function _processMessageHashes(bytes32[] calldata _messageHashes) internal returns (bytes32 hashOfLogHashes) {
    for (uint256 i; i < _messageHashes.length; ++i) {
      _addL2L1MessageHash(_messageHashes[i]);
    }
    hashOfLogHashes = keccak256(abi.encodePacked(_messageHashes));
  }

  /**
   * @notice Verifies the proof with locally computed public inputs.
   * @dev If the verifier based on proof type is not found, it reverts with InvalidProofType.
   * @param _publicInputHash The full BlockData collection - block, transaction and log data.
   * @param _proofType The proof type to determine which verifier contract to use.
   * @param _proof The proof to be verified with the proof type verifier contract.
   * @param _parentStateRootHash The beginning roothash to start with.
   */
  function _verifyProof(
    uint256 _publicInputHash,
    uint256 _proofType,
    bytes calldata _proof,
    bytes32 _parentStateRootHash
  ) internal {
    uint256[] memory input = new uint256[](1);
    input[0] = _publicInputHash;

    address verifierToUse = verifiers[_proofType];

    if (verifierToUse == address(0)) {
      revert InvalidProofType();
    }

    bool success = IPlonkVerifier(verifierToUse).Verify(_proof, input);
    if (!success) {
      revert InvalidProof();
    }

    emit BlocksVerificationDone(currentL2BlockNumber, _parentStateRootHash, stateRootHashes[currentL2BlockNumber]);
  }
}
