// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.22;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { L1MessageService } from "./messageService/l1/L1MessageService.sol";
import { ZkEvmV2 } from "./ZkEvmV2.sol";
import { ILineaRollup } from "./interfaces/l1/ILineaRollup.sol";

/**
 * @title Contract to manage cross-chain messaging on L1 and rollup proving.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */
contract LineaRollup is AccessControlUpgradeable, ZkEvmV2, L1MessageService, ILineaRollup {
  bytes32 public constant VERIFIER_SETTER_ROLE = keccak256("VERIFIER_SETTER_ROLE");
  bytes32 internal constant EMPTY_HASH = 0x0;
  uint256 internal constant Y_MODULUS = 52435875175126190479447740508185965837690552500527637822603658699938581184513;

  mapping(bytes32 dataHash => bytes32 finalStateRootHash) public dataFinalStateRootHashes;
  mapping(bytes32 dataHash => bytes32 parentHash) public dataParents;
  mapping(bytes32 dataHash => bytes32 shnarfHash) public dataShnarfHashes;
  mapping(bytes32 dataHash => uint256 startingBlock) public dataStartingBlock;
  mapping(bytes32 dataHash => uint256 endingBlock) public dataEndingBlock;

  uint256 public currentL2StoredL1MessageNumber;
  bytes32 public currentL2StoredL1RollingHash;

  uint256[50] private __gap_ZkEvm;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @notice Initializes LineaRollup and underlying service dependencies.
   * @dev DEFAULT_ADMIN_ROLE is set for the security council.
   * @dev OPERATOR_ROLE is set for operators.
   * @param _initialStateRootHash The initial hash at migration used for proof verification.
   * @param _initialL2BlockNumber The initial block number at migration.
   * @param _defaultVerifier The default verifier for rollup proofs.
   * @param _securityCouncil The address for the security council performing admin operations.
   * @param _operators The allowed rollup operators at initialization.
   * @param _rateLimitPeriodInSeconds The period in which withdrawal amounts and fees will be accumulated.
   * @param _rateLimitAmountInWei The limit allowed for withdrawing in the period.
   * @param _systemMigrationBlock The service migration block.
   */
  function initialize(
    bytes32 _initialStateRootHash,
    uint256 _initialL2BlockNumber,
    address _defaultVerifier,
    address _securityCouncil,
    address[] calldata _operators,
    uint256 _rateLimitPeriodInSeconds,
    uint256 _rateLimitAmountInWei,
    uint256 _systemMigrationBlock
  ) external initializer {
    if (_defaultVerifier == address(0)) {
      revert ZeroAddressNotAllowed();
    }

    for (uint256 i; i < _operators.length; ++i) {
      if (_operators[i] == address(0)) {
        revert ZeroAddressNotAllowed();
      }
      _grantRole(OPERATOR_ROLE, _operators[i]);
    }

    _grantRole(DEFAULT_ADMIN_ROLE, _securityCouncil);
    _grantRole(VERIFIER_SETTER_ROLE, _securityCouncil);

    __ReentrancyGuard_init();

    __MessageService_init(
      _securityCouncil,
      _securityCouncil,
      _rateLimitPeriodInSeconds,
      _rateLimitAmountInWei,
      _systemMigrationBlock
    );

    verifiers[0] = _defaultVerifier;
    currentL2BlockNumber = _initialL2BlockNumber;
    stateRootHashes[_initialL2BlockNumber] = _initialStateRootHash;
  }

  /**
   * @notice Reinitializes the LineaRollup and sets the compressed data migration block.
   * @param _systemMigrationBlock The block number we are synchronizing from.
   * @dev This must be called in the same upgrade transaction to avoid issues.
   * @dev __SystemMigrationBlock_init validates the block value.
   */
  function initializeSystemMigrationBlock(uint256 _systemMigrationBlock) external reinitializer(2) {
    __SystemMigrationBlock_init(_systemMigrationBlock);
  }

  /**
   * @notice Adds or updates the verifier contract address for a proof type.
   * @dev VERIFIER_SETTER_ROLE is required to execute.
   * @param _newVerifierAddress The address for the verifier contract.
   * @param _proofType The proof type being set/updated.
   */
  function setVerifierAddress(address _newVerifierAddress, uint256 _proofType) external onlyRole(VERIFIER_SETTER_ROLE) {
    if (_newVerifierAddress == address(0)) {
      revert ZeroAddressNotAllowed();
    }

    emit VerifierAddressChanged(_newVerifierAddress, _proofType, msg.sender, verifiers[_proofType]);

    verifiers[_proofType] = _newVerifierAddress;
  }

  /**
   * @notice Submit compressed data.
   * @dev OPERATOR_ROLE is required to execute.
   * @param _submissionData The full compressed data collection - parentStateRootHash, dataParentHash,
   * finalStateRootHash, firstBlockInData, finalBlockInData, snarkHash, compressedData.
   */
  function submitData(
    SubmissionData calldata _submissionData
  ) external whenTypeAndGeneralNotPaused(PROVING_SYSTEM_PAUSE_TYPE) onlyRole(OPERATOR_ROLE) {
    _submitData(_submissionData);
  }

  /**
   * @notice Internal function to submit compressed data.
   * @param _submissionData The full compressed data collection - parentStateRootHash, dataParentHash,
   * finalStateRootHash, firstBlockInData, finalBlockInData, snarkHash, compressedData.
   */
  function _submitData(SubmissionData calldata _submissionData) internal returns (bytes32 shnarf) {
    if (_submissionData.compressedData.length == 0) {
      revert EmptySubmissionData();
    }

    if (_submissionData.finalStateRootHash == EMPTY_HASH) {
      revert FinalBlockStateEqualsZeroHash();
    }

    shnarf = dataShnarfHashes[_submissionData.dataParentHash];

    bytes32 parentFinalStateRootHash = dataFinalStateRootHashes[_submissionData.dataParentHash];
    uint256 lastFinalizedBlock = currentL2BlockNumber;

    uint256 parentEndingBlock = dataEndingBlock[_submissionData.dataParentHash];

    // once upgraded, this initial condition will be removed - the internals remain
    if (_submissionData.dataParentHash != EMPTY_HASH) {
      if (parentFinalStateRootHash == EMPTY_HASH) {
        revert StateRootHashInvalid(parentFinalStateRootHash, _submissionData.parentStateRootHash);
      }

      uint256 expectedStartingBlock = parentEndingBlock + 1;
      if (expectedStartingBlock != _submissionData.firstBlockInData) {
        revert DataStartingBlockDoesNotMatch(expectedStartingBlock, _submissionData.firstBlockInData);
      }

      if (shnarf == EMPTY_HASH) {
        revert DataParentHasEmptyShnarf();
      }
    }

    if (_submissionData.firstBlockInData <= lastFinalizedBlock) {
      revert FirstBlockLessThanOrEqualToLastFinalizedBlock(_submissionData.firstBlockInData, lastFinalizedBlock);
    }

    if (_submissionData.firstBlockInData > _submissionData.finalBlockInData) {
      revert FirstBlockGreaterThanFinalBlock(_submissionData.firstBlockInData, _submissionData.finalBlockInData);
    }

    if (_submissionData.parentStateRootHash != parentFinalStateRootHash) {
      revert StateRootHashInvalid(parentFinalStateRootHash, _submissionData.parentStateRootHash);
    }

    bytes32 currentDataHash = keccak256(_submissionData.compressedData);

    if (dataFinalStateRootHashes[currentDataHash] != EMPTY_HASH) {
      revert DataAlreadySubmitted(currentDataHash);
    }

    dataParents[currentDataHash] = _submissionData.dataParentHash;
    dataFinalStateRootHashes[currentDataHash] = _submissionData.finalStateRootHash;
    dataStartingBlock[currentDataHash] = _submissionData.firstBlockInData;
    dataEndingBlock[currentDataHash] = _submissionData.finalBlockInData;

    bytes32 compressedDataComputedX = keccak256(abi.encode(_submissionData.snarkHash, currentDataHash));

    shnarf = keccak256(
      abi.encode(
        shnarf,
        _submissionData.snarkHash,
        _submissionData.finalStateRootHash,
        compressedDataComputedX,
        _calculateY(_submissionData.compressedData, compressedDataComputedX)
      )
    );

    dataShnarfHashes[currentDataHash] = shnarf;

    emit DataSubmitted(currentDataHash, _submissionData.firstBlockInData, _submissionData.finalBlockInData);
  }

  /**
   * @notice Finalize compressed blocks with proof.
   * @dev OPERATOR_ROLE is required to execute.
   * @param _aggregatedProof The aggregated proof.
   * @param _proofType The proof type.
   * @param _finalizationData The full finalization data.
   */
  function finalizeCompressedBlocksWithProof(
    bytes calldata _aggregatedProof,
    uint256 _proofType,
    FinalizationData calldata _finalizationData
  ) external whenTypeAndGeneralNotPaused(PROVING_SYSTEM_PAUSE_TYPE) onlyRole(OPERATOR_ROLE) {
    if (_aggregatedProof.length == 0) {
      revert ProofIsEmpty();
    }

    uint256 lastFinalizedBlockNumber = currentL2BlockNumber;

    if (stateRootHashes[lastFinalizedBlockNumber] != _finalizationData.parentStateRootHash) {
      revert StartingRootHashDoesNotMatch();
    }

    uint256 lastFinalizedL2StoredL1MessageNumber = currentL2StoredL1MessageNumber;
    bytes32 lastFinalizedL2StoredL1RollingHash = currentL2StoredL1RollingHash;

    _finalizeCompressedBlocks(_finalizationData, lastFinalizedBlockNumber, true);

    bytes32 shnarf;

    unchecked {
      shnarf = dataShnarfHashes[_finalizationData.dataHashes[_finalizationData.dataHashes.length - 1]];
      if (shnarf == EMPTY_HASH) {
        revert DataParentHasEmptyShnarf();
      }
    }

    uint256 publicInput = uint256(
      keccak256(
        bytes.concat(
          abi.encode(
            shnarf,
            _finalizationData.parentStateRootHash,
            _finalizationData.lastFinalizedTimestamp,
            _finalizationData.finalTimestamp,
            lastFinalizedBlockNumber,
            _finalizationData.finalBlockNumber
          ),
          abi.encode(
            lastFinalizedL2StoredL1RollingHash,
            _finalizationData.l1RollingHash,
            lastFinalizedL2StoredL1MessageNumber,
            _finalizationData.l1RollingHashMessageNumber,
            _finalizationData.l2MerkleTreesDepth,
            keccak256(abi.encodePacked(_finalizationData.l2MerkleRoots))
          )
        )
      )
    );

    assembly {
      publicInput := mod(publicInput, MODULO_R)
    }

    _verifyProof(publicInput, _proofType, _aggregatedProof, _finalizationData.parentStateRootHash);
  }

  /**
   * @notice Finalize compressed blocks without proof.
   * @dev DEFAULT_ADMIN_ROLE is required to execute.
   * @param _finalizationData The simplified finalization data without proof.
   */
  function finalizeCompressedBlocksWithoutProof(
    FinalizationData calldata _finalizationData
  ) external whenTypeNotPaused(GENERAL_PAUSE_TYPE) onlyRole(DEFAULT_ADMIN_ROLE) {
    uint256 lastFinalizedBlock = currentL2BlockNumber;

    _finalizeCompressedBlocks(_finalizationData, lastFinalizedBlock, false);
  }

  /**
   * @notice Internal function to finalize compressed blocks.
   * @param _finalizationData The full finalization data.
   * @param _lastFinalizedBlock The last finalized block.
   * @param _withProof If we are finalizing with a proof.
   */
  function _finalizeCompressedBlocks(
    FinalizationData calldata _finalizationData,
    uint256 _lastFinalizedBlock,
    bool _withProof
  ) internal {
    uint256 finalizationDataDataHashesLength = _finalizationData.dataHashes.length;

    if (finalizationDataDataHashesLength == 0) {
      revert FinalizationDataMissing();
    }

    if (_finalizationData.finalBlockNumber <= _lastFinalizedBlock) {
      revert FinalBlockNumberLessThanOrEqualToLastFinalizedBlock(
        _finalizationData.finalBlockNumber,
        _lastFinalizedBlock
      );
    }

    _validateL2ComputedRollingHash(_finalizationData.l1RollingHashMessageNumber, _finalizationData.l1RollingHash);

    if (currentTimestamp != _finalizationData.lastFinalizedTimestamp) {
      revert TimestampsNotInSequence(currentTimestamp, _finalizationData.lastFinalizedTimestamp);
    }

    if (_finalizationData.finalTimestamp >= block.timestamp) {
      revert FinalizationInTheFuture(_finalizationData.finalTimestamp, block.timestamp);
    }

    bytes32 startingDataParentHash = dataParents[_finalizationData.dataHashes[0]];

    if (startingDataParentHash != _finalizationData.dataParentHash) {
      revert ParentHashesDoesNotMatch(startingDataParentHash, _finalizationData.dataParentHash);
    }

    bytes32 startingParentFinalStateRootHash = dataFinalStateRootHashes[startingDataParentHash];

    // once upgraded, this initial condition will be removed - the internals remain
    if (startingDataParentHash != EMPTY_HASH) {
      if (startingParentFinalStateRootHash != _finalizationData.parentStateRootHash) {
        revert FinalStateRootHashDoesNotMatch(startingParentFinalStateRootHash, _finalizationData.parentStateRootHash);
      }
    }

    bytes32 finalBlockState = dataFinalStateRootHashes[
      _finalizationData.dataHashes[finalizationDataDataHashesLength - 1]
    ];

    if (finalBlockState == EMPTY_HASH) {
      revert FinalBlockStateEqualsZeroHash();
    }

    _addL2MerkleRoots(_finalizationData.l2MerkleRoots, _finalizationData.l2MerkleTreesDepth);
    _anchorL2MessagingBlocks(_finalizationData.l2MessagingBlocksOffsets, _lastFinalizedBlock);

    for (uint256 i = 1; i < finalizationDataDataHashesLength; ++i) {
      unchecked {
        if (dataParents[_finalizationData.dataHashes[i]] != _finalizationData.dataHashes[i - 1]) {
          revert DataHashesNotInSequence(
            _finalizationData.dataHashes[i - 1],
            dataParents[_finalizationData.dataHashes[i]]
          );
        }
      }
    }

    uint256 suppliedStartingBlock = dataStartingBlock[_finalizationData.dataHashes[0]];
    uint256 suppliedFinalBlock = dataEndingBlock[_finalizationData.dataHashes[finalizationDataDataHashesLength - 1]];

    // check final item supplied matches
    if (suppliedFinalBlock != _finalizationData.finalBlockNumber) {
      revert DataEndingBlockDoesNotMatch(suppliedFinalBlock, _finalizationData.finalBlockNumber);
    }

    // check suppliedStartingBlock is 1 more than the last finalized block
    if (suppliedStartingBlock != _lastFinalizedBlock + 1) {
      revert DataStartingBlockDoesNotMatch(_lastFinalizedBlock + 1, suppliedStartingBlock);
    }

    stateRootHashes[_finalizationData.finalBlockNumber] = finalBlockState;
    currentTimestamp = _finalizationData.finalTimestamp;
    currentL2BlockNumber = _finalizationData.finalBlockNumber;
    currentL2StoredL1MessageNumber = _finalizationData.l1RollingHashMessageNumber;
    currentL2StoredL1RollingHash = _finalizationData.l1RollingHash;

    emit DataFinalized(
      _finalizationData.finalBlockNumber,
      _finalizationData.parentStateRootHash,
      finalBlockState,
      _withProof
    );
  }

  /**
   * @notice Private function to validate l1 rolling hash.
   * @param _rollingHashMessageNumber Message number associated with the rolling hash as computed on L2.
   * @param _rollingHash L1 rolling hash as computed on L2.
   */
  function _validateL2ComputedRollingHash(uint256 _rollingHashMessageNumber, bytes32 _rollingHash) internal view {
    if (_rollingHashMessageNumber == 0) {
      if (_rollingHash != EMPTY_HASH) {
        revert MissingMessageNumberForRollingHash(_rollingHash);
      }
    } else {
      if (_rollingHash == EMPTY_HASH) {
        revert MissingRollingHashForMessageNumber(_rollingHashMessageNumber);
      }
      if (rollingHashes[_rollingHashMessageNumber] != _rollingHash) {
        revert L1RollingHashDoesNotExistOnL1(_rollingHashMessageNumber, _rollingHash);
      }
    }
  }

  /**
   * @notice Internal function to calculate Y for public input generation.
   * @param _data Compressed data from submission data.
   * @param _compressedDataComputedX Computed X for public input generation.
   * @dev Each chunk of 32 bytes must start with a 0 byte.
   * @dev The compressedDataComputedX value is modulo-ed down during the computation and scalar field checking is not needed.
   * @dev There is a hard constraint in the circuit to enforce the polynomial degree limit (4096), which will also be enforced with EIP-4844.
   * @return compressedDataComputedY The Y calculated value using the Horner method.
   */
  function _calculateY(
    bytes calldata _data,
    bytes32 _compressedDataComputedX
  ) internal pure returns (bytes32 compressedDataComputedY) {
    if (_data.length % 0x20 != 0) {
      revert BytesLengthNotMultipleOf32();
    }

    bytes4 errorSelector = ILineaRollup.FirstByteIsNotZero.selector;
    assembly {
      for {
        let i := _data.length
      } gt(i, 0) {

      } {
        i := sub(i, 0x20)
        let chunk := calldataload(add(_data.offset, i))
        if iszero(iszero(and(chunk, 0xFF00000000000000000000000000000000000000000000000000000000000000))) {
          let ptr := mload(0x40)
          mstore(ptr, errorSelector)
          revert(ptr, 0x4)
        }
        compressedDataComputedY := addmod(
          mulmod(compressedDataComputedY, _compressedDataComputedX, Y_MODULUS),
          chunk,
          Y_MODULUS
        )
      }
    }
  }
}
