import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { TestL2MessageService, TestReceivingContract } from "../typechain-types";
import {
  ADDRESS_ZERO,
  BLOCK_COINBASE,
  DEFAULT_ADMIN_ROLE,
  EMPTY_CALLDATA,
  GENERAL_PAUSE_TYPE,
  INBOX_STATUS_CLAIMED,
  INBOX_STATUS_RECEIVED,
  INITIALIZED_ALREADY_MESSAGE,
  INITIAL_WITHDRAW_LIMIT,
  L1_L2_MESSAGE_SETTER_ROLE,
  L1_L2_PAUSE_TYPE,
  L2_L1_PAUSE_TYPE,
  LOW_NO_REFUND_MESSAGE_FEE,
  MESSAGE_FEE,
  MESSAGE_VALUE_1ETH,
  MINIMUM_FEE,
  MINIMUM_FEE_SETTER_ROLE,
  ONE_DAY_IN_SECONDS,
  PAUSE_MANAGER_ROLE,
  RATE_LIMIT_SETTER_ROLE,
} from "./utils/constants";
import { deployUpgradableFromFactory } from "./utils/deployment";
import {
  buildAccessErrorMessage,
  calculateRollingHash,
  calculateRollingHashFromCollection,
  encodeSendMessage,
  expectEvent,
  expectRevertWithCustomError,
  expectRevertWithReason,
  generateKeccak256Hash,
} from "./utils/helpers";

describe("L2MessageService", () => {
  let l2MessageService: TestL2MessageService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let admin: SignerWithAddress;
  let securityCouncil: SignerWithAddress;
  let l1l2MessageSetter: SignerWithAddress;
  let notAuthorizedAccount: SignerWithAddress;
  let postmanAddress: SignerWithAddress;

  async function deployL2MessageServiceFixture() {
    return deployUpgradableFromFactory("TestL2MessageService", [
      securityCouncil.address,
      l1l2MessageSetter.address,
      ONE_DAY_IN_SECONDS,
      INITIAL_WITHDRAW_LIMIT,
    ]) as unknown as Promise<TestL2MessageService>;
  }

  beforeEach(async () => {
    [admin, securityCouncil, l1l2MessageSetter, notAuthorizedAccount, postmanAddress] = await ethers.getSigners();
    l2MessageService = await loadFixture(deployL2MessageServiceFixture);
  });

  describe("Initialization checks", () => {
    it("Security council should have DEFAULT_ADMIN_ROLE", async () => {
      expect(await l2MessageService.hasRole(DEFAULT_ADMIN_ROLE, securityCouncil.address)).to.be.true;
    });

    it("Security council should have MINIMUM_FEE_SETTER_ROLE", async () => {
      expect(await l2MessageService.hasRole(MINIMUM_FEE_SETTER_ROLE, securityCouncil.address)).to.be.true;
    });

    it("Security council should have RATE_LIMIT_SETTER_ROLE role", async () => {
      expect(await l2MessageService.hasRole(RATE_LIMIT_SETTER_ROLE, securityCouncil.address)).to.be.true;
    });

    it("Security council should have PAUSE_MANAGER_ROLE", async () => {
      expect(await l2MessageService.hasRole(PAUSE_MANAGER_ROLE, securityCouncil.address)).to.be.true;
    });

    it("L1->L2 message setter should have L1_L2_MESSAGE_SETTER_ROLE role", async () => {
      expect(await l2MessageService.hasRole(L1_L2_MESSAGE_SETTER_ROLE, l1l2MessageSetter.address)).to.be.true;
    });

    it("Should initialise nextMessageNumber", async () => {
      expect(await l2MessageService.nextMessageNumber()).to.be.equal(1);
    });

    it("Should set rate limit and period", async () => {
      expect(await l2MessageService.periodInSeconds()).to.be.equal(ONE_DAY_IN_SECONDS);
      expect(await l2MessageService.limitInWei()).to.be.equal(INITIAL_WITHDRAW_LIMIT);
    });

    it("Should fail to deploy missing limit amount", async () => {
      const deployCall = deployUpgradableFromFactory("TestL2MessageService", [
        securityCouncil.address,
        l1l2MessageSetter.address,
        ONE_DAY_IN_SECONDS,
        0,
      ]);

      await expectRevertWithCustomError(l2MessageService, deployCall, "LimitIsZero");
    });

    it("Should fail to deploy missing period", async () => {
      const deployCall = deployUpgradableFromFactory("TestL2MessageService", [
        securityCouncil.address,
        l1l2MessageSetter.address,
        0,
        MESSAGE_VALUE_1ETH + MESSAGE_VALUE_1ETH,
      ]);

      await expectRevertWithCustomError(l2MessageService, deployCall, "PeriodIsZero");
    });

    it("Should fail with empty securityCouncil address", async () => {
      const deployCall = deployUpgradableFromFactory("TestL2MessageService", [
        ADDRESS_ZERO,
        l1l2MessageSetter.address,
        ONE_DAY_IN_SECONDS,
        INITIAL_WITHDRAW_LIMIT,
      ]);

      await expectRevertWithCustomError(l2MessageService, deployCall, "ZeroAddressNotAllowed");
    });

    it("Should fail with empty l1l2MessageSetter address", async () => {
      const deployCall = deployUpgradableFromFactory("TestL2MessageService", [
        securityCouncil.address,
        ADDRESS_ZERO,
        ONE_DAY_IN_SECONDS,
        INITIAL_WITHDRAW_LIMIT,
      ]);

      await expectRevertWithCustomError(l2MessageService, deployCall, "ZeroAddressNotAllowed");
    });

    it("Should fail on second initialisation", async () => {
      const deployCall = l2MessageService.initialize(
        securityCouncil.address,
        l1l2MessageSetter.address,
        ONE_DAY_IN_SECONDS,
        INITIAL_WITHDRAW_LIMIT,
      );

      await expectRevertWithReason(deployCall, INITIALIZED_ALREADY_MESSAGE);
    });

    it("Can upgrade existing contract", async () => {
      const contract = await deployUpgradableFromFactory("L2MessageServiceLineaMainnet", [
        securityCouncil.address,
        l1l2MessageSetter.address,
        ONE_DAY_IN_SECONDS,
        INITIAL_WITHDRAW_LIMIT,
      ]);

      const l2MessageServiceFactory = await ethers.getContractFactory("L2MessageService");
      await upgrades.validateUpgrade(contract, l2MessageServiceFactory);

      const newContract = await upgrades.upgradeProxy(contract, l2MessageServiceFactory);

      const upgradedContract = await newContract.waitForDeployment();
      await upgrades.validateImplementation(l2MessageServiceFactory);

      expect(await upgradedContract.lastAnchoredL1MessageNumber()).to.equal(0);
    });
  });

  describe("Send message", () => {
    describe("When the contract is paused", () => {
      it("Should fail to send if the contract is paused", async () => {
        await l2MessageService.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);

        const sendMessageCall = l2MessageService
          .connect(securityCouncil)
          .sendMessage(notAuthorizedAccount.address, MESSAGE_FEE, EMPTY_CALLDATA, { value: INITIAL_WITHDRAW_LIMIT });

        await expectRevertWithCustomError(l2MessageService, sendMessageCall, "IsPaused", [GENERAL_PAUSE_TYPE]);
      });
    });

    describe("When the L2->L1 messaging service is paused", () => {
      it("Should fail to send if the L2->L1 messaging service is paused", async () => {
        await l2MessageService.connect(securityCouncil).pauseByType(L2_L1_PAUSE_TYPE);

        const sendMessageCall = l2MessageService
          .connect(securityCouncil)
          .sendMessage(notAuthorizedAccount.address, MESSAGE_FEE, EMPTY_CALLDATA, { value: INITIAL_WITHDRAW_LIMIT });

        await expectRevertWithCustomError(l2MessageService, sendMessageCall, "IsPaused", [L2_L1_PAUSE_TYPE]);
      });
    });

    describe("When the contract is not paused", () => {
      it("Should fail when the fee is higher than the amount sent", async () => {
        const sendMessageCall = l2MessageService
          .connect(admin)
          .sendMessage(notAuthorizedAccount.address, MESSAGE_FEE, EMPTY_CALLDATA, {
            value: MESSAGE_FEE - ethers.parseEther("0.01"),
          });

        await expectRevertWithCustomError(l2MessageService, sendMessageCall, "ValueSentTooLow");
      });

      it("Should fail when the coinbase fee transfer fails", async () => {
        await l2MessageService.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        await ethers.provider.send("hardhat_setCoinbase", [await l2MessageService.getAddress()]);

        const sendMessageCall = l2MessageService
          .connect(admin)
          .sendMessage(notAuthorizedAccount.address, MESSAGE_FEE + MINIMUM_FEE, EMPTY_CALLDATA, {
            value: MINIMUM_FEE + MINIMUM_FEE,
          });

        await expectRevertWithCustomError(l2MessageService, sendMessageCall, "FeePaymentFailed", [
          await l2MessageService.getAddress(),
        ]);

        await ethers.provider.send("hardhat_setCoinbase", [BLOCK_COINBASE]);
      });

      it("Should fail when the minimumFee is higher than the amount sent", async () => {
        await l2MessageService.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const sendMessageCall = l2MessageService
          .connect(admin)
          .sendMessage(notAuthorizedAccount.address, MESSAGE_FEE, EMPTY_CALLDATA, {
            value: MESSAGE_FEE + ethers.parseEther("0.01"),
          });

        await expectRevertWithCustomError(l2MessageService, sendMessageCall, "FeeTooLow");
      });

      it("Should fail when the to address is address 0", async () => {
        const sendMessageCall = l2MessageService
          .connect(admin)
          .canSendMessage(ADDRESS_ZERO, MESSAGE_FEE, EMPTY_CALLDATA, {
            value: MESSAGE_FEE,
          });

        await expectRevertWithCustomError(l2MessageService, sendMessageCall, "ZeroAddressNotAllowed");
      });

      it("Should increase the balance of the coinbase with the minimumFee", async () => {
        await l2MessageService.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const initialCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);

        await l2MessageService
          .connect(admin)
          .sendMessage(notAuthorizedAccount.address, MESSAGE_FEE + MINIMUM_FEE, EMPTY_CALLDATA, {
            value: MINIMUM_FEE + MESSAGE_FEE,
          });

        expect(await ethers.provider.getBalance(BLOCK_COINBASE)).to.be.gt(initialCoinbaseBalance + MINIMUM_FEE);
      });

      it("Should succeed if 'MinimumFeeChanged' event is emitted", async () => {
        await expectEvent(
          l2MessageService,
          l2MessageService.connect(securityCouncil).setMinimumFee(MINIMUM_FEE),
          "MinimumFeeChanged",
          [0, MINIMUM_FEE, securityCouncil.address],
        );

        // Testing non-zero transition
        await expectEvent(
          l2MessageService,
          l2MessageService.connect(securityCouncil).setMinimumFee(MINIMUM_FEE + 1n),
          "MinimumFeeChanged",
          [MINIMUM_FEE, MINIMUM_FEE + 1n, securityCouncil.address],
        );
      });

      it("Should succeed if 'MessageSent' event is emitted", async () => {
        await l2MessageService.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const expectedBytes = await encodeSendMessage(
          securityCouncil.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH - MESSAGE_FEE - MINIMUM_FEE,
          1n,
          EMPTY_CALLDATA,
        );
        const messageHash = ethers.keccak256(expectedBytes);

        const sendMessageCall = l2MessageService
          .connect(securityCouncil)
          .sendMessage(notAuthorizedAccount.address, MESSAGE_FEE + MINIMUM_FEE, EMPTY_CALLDATA, {
            value: MESSAGE_VALUE_1ETH,
          });
        const eventArgs = [
          securityCouncil.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH - MESSAGE_FEE - MINIMUM_FEE,
          1,
          EMPTY_CALLDATA,
          messageHash,
        ];

        await expectEvent(l2MessageService, sendMessageCall, "MessageSent", eventArgs);
      });

      it("Should send an ether only message with fees emitting the MessageSent event", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );
        const messageHash = ethers.keccak256(expectedBytes);

        const eventArgs = [
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1,
          EMPTY_CALLDATA,
          messageHash,
        ];
        const sendMessageCall = l2MessageService
          .connect(admin)
          .sendMessage(notAuthorizedAccount.address, MESSAGE_FEE, EMPTY_CALLDATA, {
            value: MESSAGE_FEE + MESSAGE_VALUE_1ETH,
          });

        await expectEvent(l2MessageService, sendMessageCall, "MessageSent", eventArgs);
      });

      it("Should send max limit ether only message with no fee emitting the MessageSent event", async () => {
        const expectedBytes = await encodeSendMessage(
          securityCouncil.address,
          notAuthorizedAccount.address,
          0n,
          INITIAL_WITHDRAW_LIMIT,
          1n,
          EMPTY_CALLDATA,
        );
        const messageHash = ethers.keccak256(expectedBytes);

        const sendMessageCall = l2MessageService
          .connect(securityCouncil)
          .sendMessage(notAuthorizedAccount.address, 0, EMPTY_CALLDATA, { value: INITIAL_WITHDRAW_LIMIT });
        const eventArgs = [
          securityCouncil.address,
          notAuthorizedAccount.address,
          0,
          INITIAL_WITHDRAW_LIMIT,
          1,
          EMPTY_CALLDATA,
          messageHash,
        ];

        await expectEvent(l2MessageService, sendMessageCall, "MessageSent", eventArgs);
      });

      it("Should revert with send over max limit amount only", async () => {
        const sendMessageCall = l2MessageService
          .connect(admin)
          .sendMessage(notAuthorizedAccount.address, 0, EMPTY_CALLDATA, { value: INITIAL_WITHDRAW_LIMIT + 1n });

        await expectRevertWithCustomError(l2MessageService, sendMessageCall, "RateLimitExceeded");
      });

      it("Should revert with send over max limit amount and fees", async () => {
        const sendMessageCall = l2MessageService
          .connect(admin)
          .sendMessage(notAuthorizedAccount.address, 1, EMPTY_CALLDATA, { value: INITIAL_WITHDRAW_LIMIT + 1n });

        await expectRevertWithCustomError(l2MessageService, sendMessageCall, "RateLimitExceeded");
      });

      it("Should fail when the rate limit would be exceeded - multi transactions", async () => {
        await l2MessageService.connect(admin).sendMessage(notAuthorizedAccount.address, MESSAGE_FEE, EMPTY_CALLDATA, {
          value: MESSAGE_FEE + MESSAGE_VALUE_1ETH,
        });

        const breachingAmount = INITIAL_WITHDRAW_LIMIT - MESSAGE_FEE - MESSAGE_VALUE_1ETH + 1n;

        const sendMessageCall = l2MessageService
          .connect(admin)
          .sendMessage(notAuthorizedAccount.address, 0, EMPTY_CALLDATA, { value: breachingAmount });

        await expectRevertWithCustomError(l2MessageService, sendMessageCall, "RateLimitExceeded");
      });

      it("Should not accrue rate limit while sending transaction with coinbaseFee only", async () => {
        const initialCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);
        await l2MessageService.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const initialRateLimitUsed = await l2MessageService.currentPeriodAmountInWei();

        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          0n,
          0n,
          1n,
          EMPTY_CALLDATA,
        );
        const messageHash = ethers.keccak256(expectedBytes);

        const sendMessageCall = l2MessageService
          .connect(admin)
          .sendMessage(notAuthorizedAccount.address, MINIMUM_FEE, EMPTY_CALLDATA, { value: MINIMUM_FEE });

        await expectEvent(l2MessageService, sendMessageCall, "MessageSent", [
          admin.address,
          notAuthorizedAccount.address,
          0n,
          0n,
          1,
          EMPTY_CALLDATA,
          messageHash,
        ]);

        const postCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);
        await expect(postCoinbaseBalance).to.be.gt(initialCoinbaseBalance);

        const postRateLimitUsed = await l2MessageService.currentPeriodAmountInWei();
        await expect(postRateLimitUsed).to.be.equal(initialRateLimitUsed);
      });

      it("Should accrue rate limit while sending transaction with 0 value and real fee, postmanFee = fee - coinbaseFee", async () => {
        const initialCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);
        const initialRateLimitUsed = await l2MessageService.currentPeriodAmountInWei();

        await l2MessageService.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_VALUE_1ETH - MINIMUM_FEE,
          0n,
          1n,
          EMPTY_CALLDATA,
        );
        const messageHash = ethers.keccak256(expectedBytes);

        const sendMessageCall = l2MessageService
          .connect(admin)
          .sendMessage(notAuthorizedAccount.address, MESSAGE_VALUE_1ETH, EMPTY_CALLDATA, { value: MESSAGE_VALUE_1ETH });

        await expectEvent(l2MessageService, sendMessageCall, "MessageSent", [
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_VALUE_1ETH - MINIMUM_FEE,
          0,
          1,
          EMPTY_CALLDATA,
          messageHash,
        ]);

        const postCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);

        const postRateLimitUsed = await l2MessageService.currentPeriodAmountInWei();

        await expect(postCoinbaseBalance).to.be.gt(initialCoinbaseBalance);
        expect(await postRateLimitUsed).to.be.gt(initialRateLimitUsed);
      });

      it("Should accrue rate limit while sending transaction with value with real fee, postmanFee = fee - coinbaseFee", async () => {
        const initialCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);
        const initialRateLimitUsed = await l2MessageService.currentPeriodAmountInWei();

        await l2MessageService.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MINIMUM_FEE + MESSAGE_FEE - MINIMUM_FEE,
          MESSAGE_VALUE_1ETH - (MINIMUM_FEE + MESSAGE_FEE),
          1n,
          EMPTY_CALLDATA,
        );
        const messageHash = ethers.keccak256(expectedBytes);

        const sendMessageCall = l2MessageService
          .connect(admin)
          .sendMessage(notAuthorizedAccount.address, MINIMUM_FEE + MESSAGE_FEE, EMPTY_CALLDATA, {
            value: MESSAGE_VALUE_1ETH,
          });
        const eventArgs = [
          admin.address,
          notAuthorizedAccount.address,
          MINIMUM_FEE + MESSAGE_FEE - MINIMUM_FEE,
          MESSAGE_VALUE_1ETH - (MINIMUM_FEE + MESSAGE_FEE),
          1,
          EMPTY_CALLDATA,
          messageHash,
        ];

        await expectEvent(l2MessageService, sendMessageCall, "MessageSent", eventArgs);

        const postCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);

        const postRateLimitUsed = await l2MessageService.currentPeriodAmountInWei();

        expect(postCoinbaseBalance).to.be.gt(initialCoinbaseBalance);
        expect(postRateLimitUsed).to.be.gt(initialRateLimitUsed);
      });

      it("Should accrue rate limit while sending transaction with value with coinbaseFee, postmanFee = 0", async () => {
        const initialCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);
        const initialRateLimitUsed = await l2MessageService.currentPeriodAmountInWei();

        await l2MessageService.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          0n,
          MESSAGE_VALUE_1ETH - MINIMUM_FEE,
          1n,
          EMPTY_CALLDATA,
        );
        const messageHash = ethers.keccak256(expectedBytes);

        const sendMessageCall = l2MessageService
          .connect(admin)
          .sendMessage(notAuthorizedAccount.address, MINIMUM_FEE, EMPTY_CALLDATA, { value: MESSAGE_VALUE_1ETH });
        const eventArgs = [
          admin.address,
          notAuthorizedAccount.address,
          0n,
          MESSAGE_VALUE_1ETH - MINIMUM_FEE,
          1,
          EMPTY_CALLDATA,
          messageHash,
        ];

        await expectEvent(l2MessageService, sendMessageCall, "MessageSent", eventArgs);

        const postCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);

        const postRateLimitUsed = await l2MessageService.currentPeriodAmountInWei();

        expect(postCoinbaseBalance).to.be.gt(initialCoinbaseBalance);
        expect(postRateLimitUsed).to.be.gt(initialRateLimitUsed);
      });
    });
  });

  describe("Claim message", () => {
    describe("When the contract is paused", async () => {
      it("Should revert if the contract is paused", async () => {
        await l2MessageService.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);

        const claimMessageCall = l2MessageService
          .connect(securityCouncil)
          .claimMessage(
            securityCouncil.address,
            notAuthorizedAccount.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            notAuthorizedAccount.address,
            EMPTY_CALLDATA,
            1,
          );

        await expectRevertWithCustomError(l2MessageService, claimMessageCall, "IsPaused", [GENERAL_PAUSE_TYPE]);
      });
    });

    describe("When L1->L2 messaging service is paused", async () => {
      it("Should revert if the L1->L2 messaging service is paused", async () => {
        await l2MessageService.connect(securityCouncil).pauseByType(L1_L2_PAUSE_TYPE);

        const claimMessageCall = l2MessageService
          .connect(securityCouncil)
          .claimMessage(
            securityCouncil.address,
            notAuthorizedAccount.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            notAuthorizedAccount.address,
            EMPTY_CALLDATA,
            1,
          );

        await expectRevertWithCustomError(l2MessageService, claimMessageCall, "IsPaused", [L1_L2_PAUSE_TYPE]);
      });
    });

    describe("When the contract is not paused", () => {
      it("Should succeed if 'MessageClaimed' event is emitted", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 2, expectedRollingHash);

        const sendMessageCall = l2MessageService.claimMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          EMPTY_CALLDATA,
          1,
        );

        await expectEvent(l2MessageService, sendMessageCall, "MessageClaimed", [ethers.keccak256(expectedBytes)]);
      });

      it("Should fail when the message hash does not exist", async () => {
        const expectedBytes = await encodeSendMessage(
          await l2MessageService.getAddress(),
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        const messageHash = ethers.keccak256(expectedBytes);

        const claimMessageCall = l2MessageService.claimMessage(
          await l2MessageService.getAddress(),
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          ADDRESS_ZERO,
          EMPTY_CALLDATA,
          1,
        );

        await expectRevertWithCustomError(
          l2MessageService,
          claimMessageCall,
          "MessageDoesNotExistOrHasAlreadyBeenClaimed",
          [messageHash],
        );
      });

      it("Should execute the claim message and send fees to recipient, left over fee to destination", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        const destinationBalance = await ethers.provider.getBalance(notAuthorizedAccount.address);
        const postmanBalance = await ethers.provider.getBalance(postmanAddress.address);

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 2, expectedRollingHash);

        await l2MessageService.claimMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          EMPTY_CALLDATA,
          1,
        );
        // greater due to the gas refund
        expect(await ethers.provider.getBalance(notAuthorizedAccount.address)).to.be.greaterThan(
          destinationBalance + MESSAGE_VALUE_1ETH,
        );
        expect(await ethers.provider.getBalance(postmanAddress.address)).to.be.greaterThan(postmanBalance);
      });

      it("Should execute the claim message and send fees to recipient contract and no leftovers", async () => {
        const factory = await ethers.getContractFactory("TestReceivingContract");
        const testContract = (await factory.deploy()) as TestReceivingContract;

        const expectedBytes = await encodeSendMessage(
          admin.address,
          await testContract.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        const postmanBalance = await ethers.provider.getBalance(postmanAddress.address);

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 2, expectedRollingHash);

        await l2MessageService.claimMessage(
          admin.address,
          await testContract.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          EMPTY_CALLDATA,
          1,
        );
        // greater due to the gas refund
        expect(await ethers.provider.getBalance(await testContract.getAddress())).to.be.equal(MESSAGE_VALUE_1ETH);
        expect(await ethers.provider.getBalance(postmanAddress.address)).to.be.equal(postmanBalance + MESSAGE_FEE);
      });

      it("Should execute the claim message and send the fees to set recipient, and NOT refund fee to EOA", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          LOW_NO_REFUND_MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        const destinationBalance = await ethers.provider.getBalance(notAuthorizedAccount.address);
        const postmanBalance = await ethers.provider.getBalance(postmanAddress.address);

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 2, expectedRollingHash);

        await l2MessageService.claimMessage(
          admin.address,
          notAuthorizedAccount.address,
          LOW_NO_REFUND_MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          EMPTY_CALLDATA,
          1,
          { gasPrice: 1000000000 },
        );

        // greater due to the gas refund
        expect(await ethers.provider.getBalance(notAuthorizedAccount.address)).to.be.equal(
          destinationBalance + MESSAGE_VALUE_1ETH,
        );
        expect(await ethers.provider.getBalance(postmanAddress.address)).to.be.equal(
          postmanBalance + LOW_NO_REFUND_MESSAGE_FEE,
        );
      });

      it("Should execute the claim message and send fees to EOA with calldata and no refund sent", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          "0x123456789a",
        );

        const destinationBalance = await ethers.provider.getBalance(notAuthorizedAccount.address);
        const postmanBalance = await ethers.provider.getBalance(postmanAddress.address);

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 2, expectedRollingHash);

        await l2MessageService.claimMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          "0x123456789a",
          1,
        );
        // greater due to the gas refund
        expect(await ethers.provider.getBalance(notAuthorizedAccount.address)).to.be.equal(
          destinationBalance + MESSAGE_VALUE_1ETH,
        );
        expect(await ethers.provider.getBalance(postmanAddress.address)).to.be.equal(postmanBalance + MESSAGE_FEE);
      });

      it("Should execute the claim message and no fees to EOA with calldata and no refund sent", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          0n,
          MESSAGE_VALUE_1ETH,
          1n,
          "0x123456789a",
        );

        const destinationBalance = await ethers.provider.getBalance(notAuthorizedAccount.address);
        const postmanBalance = await ethers.provider.getBalance(postmanAddress.address);

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 2, expectedRollingHash);

        await l2MessageService.claimMessage(
          admin.address,
          notAuthorizedAccount.address,
          0n,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          "0x123456789a",
          1,
        );
        // greater due to the gas refund
        expect(await ethers.provider.getBalance(notAuthorizedAccount.address)).to.be.equal(
          destinationBalance + MESSAGE_VALUE_1ETH,
        );
        expect(await ethers.provider.getBalance(postmanAddress.address)).to.be.equal(postmanBalance);
      });

      it("Should execute the claim message and no fees to EOA with no calldata and no refund sent", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          0n,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        const destinationBalance = await ethers.provider.getBalance(notAuthorizedAccount.address);
        const postmanBalance = await ethers.provider.getBalance(postmanAddress.address);

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 2, expectedRollingHash);

        await l2MessageService.claimMessage(
          admin.address,
          notAuthorizedAccount.address,
          0n,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          EMPTY_CALLDATA,
          1,
        );
        // greater due to the gas refund
        expect(await ethers.provider.getBalance(notAuthorizedAccount.address)).to.be.equal(
          destinationBalance + MESSAGE_VALUE_1ETH,
        );
        expect(await ethers.provider.getBalance(postmanAddress.address)).to.be.equal(postmanBalance);
      });

      // todo - add tests for refund checks when gas is lower

      it("Should fail to send if the contract is paused", async () => {
        await l2MessageService.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);

        const sendMessageCall = l2MessageService
          .connect(admin)
          .canSendMessage(notAuthorizedAccount.address, 0, EMPTY_CALLDATA, { value: INITIAL_WITHDRAW_LIMIT });

        await expectRevertWithCustomError(l2MessageService, sendMessageCall, "IsPaused", [GENERAL_PAUSE_TYPE]);

        const usedAmount = await l2MessageService.currentPeriodAmountInWei();
        expect(usedAmount).to.be.equal(0);
      });

      it("Should fail when the message hash has been claimed", async () => {
        const expectedBytes = await encodeSendMessage(
          await l2MessageService.getAddress(),
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 2, expectedRollingHash);

        await l2MessageService.claimMessage(
          await l2MessageService.getAddress(),
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          EMPTY_CALLDATA,
          1,
        );
        await expect(
          l2MessageService.claimMessage(
            await l2MessageService.getAddress(),
            notAuthorizedAccount.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            postmanAddress.address,
            EMPTY_CALLDATA,
            1,
          ),
        ).to.be.revertedWithCustomError(l2MessageService, "MessageDoesNotExistOrHasAlreadyBeenClaimed");
      });

      it("Should execute the claim message and send the fees to msg.sender", async () => {
        const expectedBytes = await encodeSendMessage(
          await l2MessageService.getAddress(),
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        const expectedSecondBytes = await encodeSendMessage(
          await l2MessageService.getAddress(),
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          2n,
          EMPTY_CALLDATA,
        );

        const destinationBalance = await ethers.provider.getBalance(notAuthorizedAccount.address);

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes), ethers.keccak256(expectedSecondBytes)];
        const expectedRollingHash = calculateRollingHashFromCollection(ethers.ZeroHash, expectedBytesArray);

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 3, expectedRollingHash);

        await l2MessageService
          .connect(admin)
          .claimMessage(
            await l2MessageService.getAddress(),
            notAuthorizedAccount.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            ADDRESS_ZERO,
            EMPTY_CALLDATA,
            1,
          );

        const adminBalance = await ethers.provider.getBalance(admin.address);

        await l2MessageService
          .connect(admin)
          .claimMessage(
            await l2MessageService.getAddress(),
            notAuthorizedAccount.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            ADDRESS_ZERO,
            EMPTY_CALLDATA,
            2,
          );

        expect(await ethers.provider.getBalance(notAuthorizedAccount.address)).to.be.greaterThan(
          destinationBalance + MESSAGE_VALUE_1ETH + MESSAGE_VALUE_1ETH,
        );
        expect(await ethers.provider.getBalance(admin.address)).to.be.lessThan(adminBalance + MESSAGE_FEE);

        expect(await l2MessageService.inboxL1L2MessageStatus(ethers.keccak256(expectedBytes))).to.be.equal(
          INBOX_STATUS_CLAIMED,
        );
      });

      // todo also add lower than 5000 gas check for the balances to be equal

      it("Should execute the claim message when there are no fees", async () => {
        const expectedBytes = await encodeSendMessage(
          await l2MessageService.getAddress(),
          notAuthorizedAccount.address,
          0n,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );
        const destinationBalance = await ethers.provider.getBalance(notAuthorizedAccount.address);

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 2, expectedRollingHash);

        const adminBalance = await ethers.provider.getBalance(admin.address);
        await l2MessageService
          .connect(admin)
          .claimMessage(
            await l2MessageService.getAddress(),
            notAuthorizedAccount.address,
            0,
            MESSAGE_VALUE_1ETH,
            ADDRESS_ZERO,
            EMPTY_CALLDATA,
            1,
          );

        expect(await ethers.provider.getBalance(notAuthorizedAccount.address)).to.be.equal(
          destinationBalance + MESSAGE_VALUE_1ETH,
        );
        expect(await ethers.provider.getBalance(admin.address)).to.be.lessThan(adminBalance);

        expect(await l2MessageService.inboxL1L2MessageStatus(ethers.keccak256(expectedBytes))).to.be.equal(
          INBOX_STATUS_CLAIMED,
        );
      });

      it("Should provide the correct origin sender", async () => {
        const sendCalldata = generateKeccak256Hash("setSender()").substring(0, 10);

        const expectedBytes = await encodeSendMessage(
          await l2MessageService.getAddress(),
          await l2MessageService.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          sendCalldata,
        );

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 2, expectedRollingHash);

        const storedSenderBeforeSending = await l2MessageService.originalSender();
        expect(storedSenderBeforeSending).to.be.equal(ADDRESS_ZERO);

        await expect(
          l2MessageService
            .connect(admin)
            .claimMessage(
              await l2MessageService.getAddress(),
              await l2MessageService.getAddress(),
              MESSAGE_FEE,
              MESSAGE_VALUE_1ETH,
              ADDRESS_ZERO,
              sendCalldata,
              1,
            ),
        ).to.not.be.reverted;

        const newSender = await l2MessageService.originalSender();
        expect(newSender).to.be.equal(await l2MessageService.getAddress());
      });

      it("Should fail on reentry when sending to recipient", async () => {
        const callSignature = generateKeccak256Hash("doReentry()").substring(0, 10);

        const expectedBytes = await encodeSendMessage(
          await l2MessageService.getAddress(),
          await l2MessageService.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          callSignature,
        );

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 2, expectedRollingHash);

        const claimMessageCall = l2MessageService
          .connect(admin)
          .claimMessage(
            await l2MessageService.getAddress(),
            await l2MessageService.getAddress(),
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            ADDRESS_ZERO,
            callSignature,
            1,
          );

        await expectRevertWithReason(claimMessageCall, "ReentrancyGuard: reentrant call");
      });

      it("Should fail when the destination errors through receive", async () => {
        const expectedBytes = await encodeSendMessage(
          await l2MessageService.getAddress(),
          await l2MessageService.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 2, expectedRollingHash);

        await expect(
          l2MessageService
            .connect(admin)
            .claimMessage(
              await l2MessageService.getAddress(),
              await l2MessageService.getAddress(),
              MESSAGE_FEE,
              MESSAGE_VALUE_1ETH,
              ADDRESS_ZERO,
              EMPTY_CALLDATA,
              1,
            ),
        ).to.be.reverted;

        expect(await l2MessageService.inboxL1L2MessageStatus(ethers.keccak256(expectedBytes))).to.be.equal(
          INBOX_STATUS_RECEIVED,
        );
      });

      it("Should fail when the destination errors through fallback", async () => {
        const expectedBytes = await encodeSendMessage(
          await l2MessageService.getAddress(),
          await l2MessageService.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          "0x1234",
        );

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 2, expectedRollingHash);

        await expect(
          l2MessageService
            .connect(admin)
            .claimMessage(
              await l2MessageService.getAddress(),
              await l2MessageService.getAddress(),
              MESSAGE_FEE,
              MESSAGE_VALUE_1ETH,
              ADDRESS_ZERO,
              "0x1234",
              1,
            ),
        ).to.be.reverted;

        expect(await l2MessageService.inboxL1L2MessageStatus(ethers.keccak256(expectedBytes))).to.be.equal(
          INBOX_STATUS_RECEIVED,
        );
      });

      it("Should fail when the destination errors on empty receive (makeItReceive function)", async () => {
        const expectedBytes = await encodeSendMessage(
          await l2MessageService.getAddress(),
          await l2MessageService.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          "0xfc13b6f3",
        );

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 2, expectedRollingHash);

        const claimMessageCall = l2MessageService
          .connect(admin)
          .claimMessage(
            await l2MessageService.getAddress(),
            await l2MessageService.getAddress(),
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            ADDRESS_ZERO,
            "0xfc13b6f3",
            1,
          );

        await expectRevertWithCustomError(l2MessageService, claimMessageCall, "MessageSendingFailed", [
          await l2MessageService.getAddress(),
        ]);

        expect(await l2MessageService.inboxL1L2MessageStatus(ethers.keccak256(expectedBytes))).to.be.equal(
          INBOX_STATUS_RECEIVED,
        );
      });

      it("Should fail when the fee recipient fails errors", async () => {
        const expectedBytes = await encodeSendMessage(
          await l2MessageService.getAddress(),
          admin.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await l2MessageService.setLastAnchoredL1MessageNumber(1);
        await l2MessageService
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(expectedBytesArray, 2, 2, expectedRollingHash);

        const claimMessageCall = l2MessageService
          .connect(admin)
          .claimMessage(
            await l2MessageService.getAddress(),
            admin.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            await l2MessageService.getAddress(),
            EMPTY_CALLDATA,
            1,
          );

        await expectRevertWithCustomError(l2MessageService, claimMessageCall, "FeePaymentFailed", [
          await l2MessageService.getAddress(),
        ]);

        expect(await l2MessageService.inboxL1L2MessageStatus(ethers.keccak256(expectedBytes))).to.be.equal(
          INBOX_STATUS_RECEIVED,
        );
      });
    });
  });

  describe("Set minimum fee", () => {
    it("Should fail when caller is not allowed", async () => {
      await expect(l2MessageService.connect(notAuthorizedAccount).setMinimumFee(MINIMUM_FEE)).to.be.revertedWith(
        "AccessControl: account " +
          notAuthorizedAccount.address.toLowerCase() +
          " is missing role " +
          MINIMUM_FEE_SETTER_ROLE,
      );
    });

    it("Should set the minimum fee", async () => {
      await l2MessageService.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

      expect(await l2MessageService.minimumFeeInWei()).to.be.equal(MINIMUM_FEE);
    });
  });

  describe("Pausing contracts", () => {
    it("Should fail pausing as non-pauser", async () => {
      expect(await l2MessageService.isPaused(GENERAL_PAUSE_TYPE)).to.be.false;

      await expectRevertWithReason(
        l2MessageService.connect(admin).pauseByType(GENERAL_PAUSE_TYPE),
        buildAccessErrorMessage(admin, PAUSE_MANAGER_ROLE),
      );

      expect(await l2MessageService.isPaused(GENERAL_PAUSE_TYPE)).to.be.false;
    });

    it("Should pause as pause manager", async () => {
      expect(await l2MessageService.isPaused(GENERAL_PAUSE_TYPE)).to.be.false;

      await l2MessageService.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);

      expect(await l2MessageService.isPaused(GENERAL_PAUSE_TYPE)).to.be.true;
    });
  });

  describe("Resetting limits", () => {
    it("Should reset limits as limitSetter", async () => {
      let usedAmount = await l2MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(0);

      await l2MessageService
        .connect(admin)
        .sendMessage(notAuthorizedAccount.address, 0, EMPTY_CALLDATA, { value: INITIAL_WITHDRAW_LIMIT });

      usedAmount = await l2MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(INITIAL_WITHDRAW_LIMIT);

      await l2MessageService.connect(securityCouncil).resetAmountUsedInPeriod();
      usedAmount = await l2MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(0);
    });

    it("Should fail reset limits as non-pauser", async () => {
      let usedAmount = await l2MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(0);

      await l2MessageService
        .connect(admin)
        .sendMessage(notAuthorizedAccount.address, 0, EMPTY_CALLDATA, { value: INITIAL_WITHDRAW_LIMIT });

      usedAmount = await l2MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(INITIAL_WITHDRAW_LIMIT);

      await expectRevertWithReason(
        l2MessageService.connect(admin).resetAmountUsedInPeriod(),
        buildAccessErrorMessage(admin, RATE_LIMIT_SETTER_ROLE),
      );

      usedAmount = await l2MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(INITIAL_WITHDRAW_LIMIT);
    });
  });
});
