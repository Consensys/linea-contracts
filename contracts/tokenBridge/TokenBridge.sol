// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.19;

import { ITokenBridge } from "./interfaces/ITokenBridge.sol";
import { IMessageService } from "../interfaces/IMessageService.sol";

import { IERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20PermitUpgradeable.sol";
import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { BeaconProxy } from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import { BridgedToken } from "./BridgedToken.sol";
import { MessageServiceBase } from "../messageService/MessageServiceBase.sol";

/**
 * @title Linea Canonical Token Bridge
 * @notice Contract to manage cross-chain ERC20 bridging.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */
contract TokenBridge is
  ITokenBridge,
  PausableUpgradeable,
  Ownable2StepUpgradeable,
  MessageServiceBase,
  ReentrancyGuardUpgradeable
{
  using SafeERC20Upgradeable for IERC20Upgradeable;

  // solhint-disable-next-line var-name-mixedcase
  bytes4 internal constant _PERMIT_SELECTOR = IERC20PermitUpgradeable.permit.selector;

  /// @notice used for the token metadata
  bytes private constant METADATA_NAME = abi.encodeCall(IERC20MetadataUpgradeable.name, ());
  bytes private constant METADATA_SYMBOL = abi.encodeCall(IERC20MetadataUpgradeable.symbol, ());
  bytes private constant METADATA_DECIMALS = abi.encodeCall(IERC20MetadataUpgradeable.decimals, ());

  address public tokenBeacon;
  /// @notice mapping (chainId => nativeTokenAddress => brigedTokenAddress)
  mapping(uint256 => mapping(address => address)) public nativeToBridgedToken;
  /// @notice mapping (brigedTokenAddress => nativeTokenAddress)
  mapping(address => address) public bridgedToNativeToken;

  /// @notice The current layer chainId from where the bridging is triggered
  uint256 public sourceChainId;
  /// @notice The targeted layer chainId where the bridging is received
  uint256 public targetChainId;

  // Special addresses used in the mappings to mark specific states for tokens.
  /// @notice EMPTY means a token is not present in the mapping.
  address internal constant EMPTY = address(0x0);
  /// @notice RESERVED means a token is reserved and cannot be bridged.
  address internal constant RESERVED_STATUS = address(0x111);
  /// @notice NATIVE means a token is native to the current local chain.
  address internal constant NATIVE_STATUS = address(0x222);
  /// @notice DEPLOYED means the bridged token contract has been deployed on the remote chain.
  address internal constant DEPLOYED_STATUS = address(0x333);

  /// @dev Keep free storage slots for future implementation updates to avoid storage collision.
  uint256[50] private __gap;

  /// @dev Ensures the token has not been bridged before.
  modifier isNewToken(address _token) {
    if (nativeToBridgedToken[sourceChainId][_token] != EMPTY || bridgedToNativeToken[_token] != EMPTY)
      revert AlreadyBridgedToken(_token);
    _;
  }

  /**
   * @dev Ensures the address is not address(0).
   * @param _addr Address to check.
   */
  modifier nonZeroAddress(address _addr) {
    if (_addr == EMPTY) revert ZeroAddressNotAllowed();
    _;
  }
  /**
   * @dev Ensures the amount is not 0.
   * @param _amount amount to check.
   */
  modifier nonZeroAmount(uint256 _amount) {
    if (_amount == 0) revert ZeroAmountNotAllowed(_amount);
    _;
  }

  /// @dev Disable constructor for safety
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @dev Contract will be used as proxy implementation.
   * @param _messageService The address of the MessageService contract.
   * @param _tokenBeacon The address of the tokenBeacon.
   * @param _sourceChainId The source chain id of the current layer
   * @param _targetChainId The target chaind id of the targeted layer
   * @param _reservedTokens The list of reserved tokens to be set
   */
  function initialize(
    address _securityCouncil,
    address _messageService,
    address _tokenBeacon,
    uint256 _sourceChainId,
    uint256 _targetChainId,
    address[] calldata _reservedTokens
  ) external nonZeroAddress(_securityCouncil) nonZeroAddress(_messageService) nonZeroAddress(_tokenBeacon) initializer {
    __Pausable_init();
    __Ownable2Step_init();
    __MessageServiceBase_init(_messageService);
    __ReentrancyGuard_init();
    tokenBeacon = _tokenBeacon;
    sourceChainId = _sourceChainId;
    targetChainId = _targetChainId;

    unchecked {
      for (uint256 i; i < _reservedTokens.length; ) {
        if (_reservedTokens[i] == EMPTY) revert ZeroAddressNotAllowed();
        setReserved(_reservedTokens[i]);
        ++i;
      }
    }
    _transferOwnership(_securityCouncil);
  }

  /**
   * @notice This function is the single entry point to bridge tokens to the
   *   other chain, both for native and already bridged tokens. You can use it
   *   to bridge any ERC20. If the token is bridged for the first time an ERC20
   *   (BridgedToken.sol) will be automatically deployed on the target chain.
   * @dev User should first allow the bridge to transfer tokens on his behalf.
   *   Alternatively, you can use BridgeTokenWithPermit to do so in a single
   *   transaction. If you want the transfer to be automatically executed on the
   *   destination chain. You should send enough ETH to pay the postman fees.
   *   Note that Linea can reserve some tokens (which use a dedicated bridge).
   *   In this case, the token cannot be bridged. Linea can only reserve tokens
   *   that have not been bridged yet.
   *   Linea can pause the bridge for security reason. In this case new bridge
   *   transaction would revert.
   * @param _token The address of the token to be bridged.
   * @param _amount The amount of the token to be bridged.
   * @param _recipient The address that will receive the tokens on the other chain.
   */
  function bridgeToken(
    address _token,
    uint256 _amount,
    address _recipient
  ) public payable nonZeroAddress(_token) nonZeroAddress(_recipient) nonZeroAmount(_amount) whenNotPaused nonReentrant {
    address nativeMappingValue = nativeToBridgedToken[sourceChainId][_token];

    if (nativeMappingValue == RESERVED_STATUS) {
      // Token is reserved
      revert ReservedToken(_token);
    }

    address bridgedMappingValue = bridgedToNativeToken[_token];
    address nativeToken;
    uint256 chainId;
    bytes memory tokenMetadata;

    if (bridgedMappingValue != EMPTY) {
      // Token is bridged
      BridgedToken(_token).burn(msg.sender, _amount);
      nativeToken = bridgedMappingValue;
      chainId = targetChainId;
    } else {
      // Token is native

      // For tokens with special fee logic, ensure that only the amount received
      // by the bridge will be minted on the target chain.
      uint256 balanceBefore = IERC20Upgradeable(_token).balanceOf(address(this));
      IERC20Upgradeable(_token).safeTransferFrom(msg.sender, address(this), _amount);
      _amount = IERC20Upgradeable(_token).balanceOf(address(this)) - balanceBefore;

      nativeToken = _token;

      if (nativeMappingValue == EMPTY) {
        // New token
        nativeToBridgedToken[sourceChainId][_token] = NATIVE_STATUS;
        emit NewToken(_token);
      }

      // Send Metadata only when the token has not been deployed on the other chain yet
      if (nativeMappingValue != DEPLOYED_STATUS) {
        tokenMetadata = abi.encode(_safeName(_token), _safeSymbol(_token), _safeDecimals(_token));
      }
      chainId = sourceChainId;
    }

    messageService.sendMessage{ value: msg.value }(
      remoteSender,
      msg.value, // fees
      abi.encodeCall(ITokenBridge.completeBridging, (nativeToken, _amount, _recipient, chainId, tokenMetadata))
    );
    emit BridgingInitiated(msg.sender, _recipient, _token, _amount);
  }

  /**
   * @notice Similar to `bridgeToken` function but allows to pass additional
   *   permit data to do the ERC20 approval in a single transaction.
   * @notice _permit can fail silently, don't rely on this function passing as a form
   *   of authentication
   * @param _token The address of the token to be bridged.
   * @param _amount The amount of the token to be bridged.
   * @param _recipient The address that will receive the tokens on the other chain.
   * @param _permitData The permit data for the token, if applicable.
   */
  function bridgeTokenWithPermit(
    address _token,
    uint256 _amount,
    address _recipient,
    bytes calldata _permitData
  ) external payable nonZeroAddress(_token) nonZeroAmount(_amount) whenNotPaused {
    if (_permitData.length != 0) {
      _permit(_token, _permitData);
    }
    bridgeToken(_token, _amount, _recipient);
  }

  /**
   * @dev It can only be called from the Message Service. To finalize the bridging
   *   process, a user or postman needs to use the `claimMessage` function of the
   *   Message Service to trigger the transaction.
   * @param _nativeToken The address of the token on its native chain.
   * @param _amount The amount of the token to be received.
   * @param _recipient The address that will receive the tokens.
   * @param _chainId The token's origin layer chaindId
   * @param _tokenMetadata Additional data used to deploy the bridged token if it
   *   doesn't exist already.
   */
  function completeBridging(
    address _nativeToken,
    uint256 _amount,
    address _recipient,
    uint256 _chainId,
    bytes calldata _tokenMetadata
  ) external nonReentrant onlyMessagingService onlyAuthorizedRemoteSender whenNotPaused {
    address nativeMappingValue = nativeToBridgedToken[_chainId][_nativeToken];
    address bridgedToken;

    if (nativeMappingValue == NATIVE_STATUS || nativeMappingValue == DEPLOYED_STATUS) {
      // Token is native on the local chain
      IERC20Upgradeable(_nativeToken).safeTransfer(_recipient, _amount);
    } else {
      bridgedToken = nativeMappingValue;
      if (nativeMappingValue == EMPTY) {
        // New token
        bridgedToken = deployBridgedToken(_nativeToken, _tokenMetadata, sourceChainId);
        bridgedToNativeToken[bridgedToken] = _nativeToken;
        nativeToBridgedToken[targetChainId][_nativeToken] = bridgedToken;
      }
      BridgedToken(bridgedToken).mint(_recipient, _amount);
    }
    emit BridgingFinalized(_nativeToken, bridgedToken, _amount, _recipient);
  }

  /**
   * @dev Change the address of the Message Service.
   * @param _messageService The address of the new Message Service.
   */
  function setMessageService(address _messageService) public nonZeroAddress(_messageService) onlyOwner {
    address oldMessageService = address(messageService);
    messageService = IMessageService(_messageService);
    emit MessageServiceUpdated(_messageService, oldMessageService, msg.sender);
  }

  /**
   * @dev Change the status to DEPLOYED to the tokens passed in parameter
   *    Will call the method setDeployed on the other chain using the message Service
   * @param _tokens Array of bridged tokens that have been deployed.
   */
  function confirmDeployment(address[] memory _tokens) external payable {
    // Check that the tokens have actually been deployed
    for (uint256 i; i < _tokens.length; i++) {
      address nativeToken = bridgedToNativeToken[_tokens[i]];
      if (nativeToken == EMPTY) {
        revert TokenNotDeployed(_tokens[i]);
      }
      _tokens[i] = nativeToken;
    }

    messageService.sendMessage{ value: msg.value }(
      remoteSender,
      msg.value, // fees
      abi.encodeCall(ITokenBridge.setDeployed, (_tokens))
    );

    emit DeploymentConfirmed(_tokens, msg.sender);
  }

  /**
   * @dev Change the status of tokens to DEPLOYED. New bridge transaction will not
   *   contain token metadata, which save gas.
   *   Can only be called from the Message Service. A user or postman needs to use
   *   the `claimMessage` function of the Message Service to trigger the transaction.
   * @param _nativeTokens Array of native tokens for which the DEPLOYED status must be set.
   */
  function setDeployed(address[] calldata _nativeTokens) external onlyMessagingService onlyAuthorizedRemoteSender {
    address nativeToken;
    unchecked {
      for (uint256 i; i < _nativeTokens.length; ) {
        nativeToken = _nativeTokens[i];
        nativeToBridgedToken[sourceChainId][_nativeTokens[i]] = DEPLOYED_STATUS;
        emit TokenDeployed(_nativeTokens[i]);
        ++i;
      }
    }
  }

  /**
   * @dev Sets the address of the remote token bridge. Can only be called once.
   * @param _remoteTokenBridge The address of the remote token bridge to be set.
   */
  function setRemoteTokenBridge(address _remoteTokenBridge) external onlyOwner {
    if (remoteSender != EMPTY) revert RemoteTokenBridgeAlreadySet(remoteSender);
    _setRemoteSender(_remoteTokenBridge);
    emit RemoteTokenBridgeSet(_remoteTokenBridge, msg.sender);
  }

  /**
   * @dev Deploy a new EC20 contract for bridged token using a beacon proxy pattern.
   *   To adapt to future requirements, Linea can update the implementation of
   *   all (existing and future) contracts by updating the beacon. This update is
   *   subject to a delay by a time lock.
   *   Contracts are deployed using CREATE2 so deployment address is deterministic.
   * @param _nativeToken The address of the native token on the source chain.
   * @param _tokenMetadata The encoded metadata for the token.
   * @param _chainId The chain id on which the token will be deployed, used to calculate the salt
   * @return The address of the newly deployed BridgedToken contract.
   */
  function deployBridgedToken(
    address _nativeToken,
    bytes calldata _tokenMetadata,
    uint256 _chainId
  ) internal returns (address) {
    bytes32 _salt = keccak256(abi.encode(_chainId, _nativeToken));
    BeaconProxy bridgedToken = new BeaconProxy{ salt: _salt }(tokenBeacon, "");
    address bridgedTokenAddress = address(bridgedToken);

    (string memory name, string memory symbol, uint8 decimals) = abi.decode(_tokenMetadata, (string, string, uint8));
    BridgedToken(bridgedTokenAddress).initialize(name, symbol, decimals);
    emit NewTokenDeployed(bridgedTokenAddress, _nativeToken);
    return bridgedTokenAddress;
  }

  /**
   * @dev Linea can reserve tokens. In this case, the token cannot be bridged.
   *   Linea can only reserve tokens that have not been bridged before.
   * @notice Make sure that _token is native to the current chain
   *   where you are calling this function from
   * @param _token The address of the token to be set as reserved.
   */
  function setReserved(address _token) public nonZeroAddress(_token) onlyOwner isNewToken(_token) {
    nativeToBridgedToken[sourceChainId][_token] = RESERVED_STATUS;
    emit TokenReserved(_token);
  }

  /**
   * @dev Removes a token from the reserved list.
   * @param _token The address of the token to be removed from the reserved list.
   */
  function removeReserved(address _token) external nonZeroAddress(_token) onlyOwner {
    if (nativeToBridgedToken[sourceChainId][_token] != RESERVED_STATUS) revert NotReserved(_token);
    nativeToBridgedToken[sourceChainId][_token] = EMPTY;
  }

  /**
   * @dev Linea can set a custom ERC20 contract for specific ERC20.
   *   For security purpose, Linea can only call this function if the token has
   *   not been bridged yet.
   * @param _nativeToken The address of the token on the source chain.
   * @param _targetContract The address of the custom contract.
   */
  function setCustomContract(
    address _nativeToken,
    address _targetContract
  ) external nonZeroAddress(_nativeToken) nonZeroAddress(_targetContract) onlyOwner isNewToken(_nativeToken) {
    if (bridgedToNativeToken[_targetContract] != EMPTY) {
      revert AlreadyBrigedToNativeTokenSet(_targetContract);
    }
    if (_targetContract == NATIVE_STATUS || _targetContract == DEPLOYED_STATUS || _targetContract == RESERVED_STATUS) {
      revert StatusAddressNotAllowed(_targetContract);
    }
    nativeToBridgedToken[targetChainId][_nativeToken] = _targetContract;
    bridgedToNativeToken[_targetContract] = _nativeToken;
    emit CustomContractSet(_nativeToken, _targetContract, msg.sender);
  }

  /**
   * @dev Pause the contract, can only be called by the owner.
   */
  function pause() external onlyOwner {
    _pause();
  }

  /**
   * @dev Unpause the contract, can only be called by the owner.
   */
  function unpause() external onlyOwner {
    _unpause();
  }

  // Helpers to safely get the metadata from a token, inspired by
  // https://github.com/traderjoe-xyz/joe-core/blob/main/contracts/MasterChefJoeV3.sol#L55-L95

  /**
   * @dev Provides a safe ERC20.name version which returns 'NO_NAME' as fallback string.
   * @param _token The address of the ERC-20 token contract
   */
  function _safeName(address _token) internal view returns (string memory) {
    (bool success, bytes memory data) = _token.staticcall(METADATA_NAME);
    return success ? _returnDataToString(data) : "NO_NAME";
  }

  /**
   * @dev Provides a safe ERC20.symbol version which returns 'NO_SYMBOL' as fallback string
   * @param _token The address of the ERC-20 token contract
   */
  function _safeSymbol(address _token) internal view returns (string memory) {
    (bool success, bytes memory data) = _token.staticcall(METADATA_SYMBOL);
    return success ? _returnDataToString(data) : "NO_SYMBOL";
  }

  /**
   * @notice Provides a safe ERC20.decimals version which returns '18' as fallback value.
   *   Note Tokens with (decimals > 255) are not supported
   * @param _token The address of the ERC-20 token contract
   */
  function _safeDecimals(address _token) internal view returns (uint8) {
    (bool success, bytes memory data) = _token.staticcall(METADATA_DECIMALS);
    return success && data.length == 32 ? abi.decode(data, (uint8)) : 18;
  }

  /**
   * @dev Converts returned data to string. Returns 'NOT_VALID_ENCODING' as fallback value.
   * @param _data returned data
   */
  function _returnDataToString(bytes memory _data) internal pure returns (string memory) {
    if (_data.length >= 64) {
      return abi.decode(_data, (string));
    } else if (_data.length != 32) {
      return "NOT_VALID_ENCODING";
    }

    // Since the strings on bytes32 are encoded left-right, check the first zero in the data
    uint256 nonZeroBytes;
    unchecked {
      while (nonZeroBytes < 32 && _data[nonZeroBytes] != 0) {
        nonZeroBytes++;
      }
    }

    // If the first one is 0, we do not handle the encoding
    if (nonZeroBytes == 0) {
      return "NOT_VALID_ENCODING";
    }
    // Create a byte array with nonZeroBytes length
    bytes memory bytesArray = new bytes(nonZeroBytes);
    unchecked {
      for (uint256 i; i < nonZeroBytes; ) {
        bytesArray[i] = _data[i];
        ++i;
      }
    }
    return string(bytesArray);
  }

  /**
   * @notice Call the token permit method of extended ERC20
   * @notice Only support tokens implementing ERC-2612
   * @param _token ERC20 token address
   * @param _permitData Raw data of the call `permit` of the token
   */
  function _permit(address _token, bytes calldata _permitData) internal {
    if (bytes4(_permitData[:4]) != _PERMIT_SELECTOR)
      revert InvalidPermitData(bytes4(_permitData[:4]), _PERMIT_SELECTOR);
    // Decode the permit data
    // The parameters are:
    // 1. owner: The address of the wallet holding the tokens
    // 2. spender: The address of the entity permitted to spend the tokens
    // 3. value: The maximum amount of tokens the spender is allowed to spend
    // 4. deadline: The time until which the permit is valid
    // 5. v: Part of the signature (along with r and s), these three values form the signature of the permit
    // 6. r: Part of the signature
    // 7. s: Part of the signature
    (address owner, address spender, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) = abi.decode(
      _permitData[4:],
      (address, address, uint256, uint256, uint8, bytes32, bytes32)
    );
    if (owner != msg.sender) revert PermitNotFromSender(owner);
    if (spender != address(this)) revert PermitNotAllowingBridge(spender);
    IERC20PermitUpgradeable(_token).permit(msg.sender, address(this), amount, deadline, v, r, s);
  }
}
