import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { TestL2MessageService, TestReceivingContract } from "../typechain-types";
import { deployUpgradableFromFactory } from "./utils/deployment";
import {
  INBOX_STATUS_CLAIMED,
  INBOX_STATUS_RECEIVED,
  PAUSE_MANAGER_ROLE,
  RATE_LIMIT_SETTER_ROLE,
  MINIMUM_FEE,
  BLOCK_COINBASE,
  DEFAULT_ADMIN_ROLE,
  MINIMUM_FEE_SETTER_ROLE,
  L1_L2_PAUSE_TYPE,
  L2_L1_PAUSE_TYPE,
  GENERAL_PAUSE_TYPE,
  MESSAGE_FEE,
  MESSAGE_VALUE_1ETH,
  ONE_DAY_IN_SECONDS,
  INITIAL_WITHDRAW_LIMIT,
  L1_L2_MESSAGE_SETTER_ROLE,
  EMPTY_CALLDATA,
  LOW_NO_REFUND_MESSAGE_FEE,
} from "./utils/constants";
import { encodeSendMessage, generateKeccak256Hash } from "./utils/helpers";

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
      86400,
      INITIAL_WITHDRAW_LIMIT,
    ]) as Promise<TestL2MessageService>;
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
      await expect(
        deployUpgradableFromFactory("TestL2MessageService", [
          securityCouncil.address,
          l1l2MessageSetter.address,
          86400,
          0,
        ]),
      ).to.be.revertedWithCustomError(l2MessageService, "LimitIsZero");
    });

    it("Should fail to deploy missing period", async () => {
      await expect(
        deployUpgradableFromFactory("TestL2MessageService", [
          securityCouncil.address,
          l1l2MessageSetter.address,
          0,
          MESSAGE_VALUE_1ETH.add(MESSAGE_VALUE_1ETH),
        ]),
      ).to.be.revertedWithCustomError(l2MessageService, "PeriodIsZero");
    });

    it("Should fail with empty securityCouncil address", async () => {
      await expect(
        deployUpgradableFromFactory("TestL2MessageService", [
          ethers.constants.AddressZero,
          l1l2MessageSetter.address,
          ONE_DAY_IN_SECONDS,
          INITIAL_WITHDRAW_LIMIT,
        ]),
      ).to.be.revertedWithCustomError(l2MessageService, "ZeroAddressNotAllowed");
    });

    it("Should fail with empty l1l2MessageSetter address", async () => {
      await expect(
        deployUpgradableFromFactory("TestL2MessageService", [
          securityCouncil.address,
          ethers.constants.AddressZero,
          ONE_DAY_IN_SECONDS,
          INITIAL_WITHDRAW_LIMIT,
        ]),
      ).to.be.revertedWithCustomError(l2MessageService, "ZeroAddressNotAllowed");
    });

    it("Should fail on second initialisation", async () => {
      await expect(
        l2MessageService.initialize(
          securityCouncil.address,
          l1l2MessageSetter.address,
          ONE_DAY_IN_SECONDS,
          INITIAL_WITHDRAW_LIMIT,
        ),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("Send message", () => {
    describe("When the contract is paused", () => {
      it("Should fail to send if the contract is paused", async () => {
        await l2MessageService.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);

        await expect(
          l2MessageService
            .connect(securityCouncil)
            .sendMessage(notAuthorizedAccount.address, MESSAGE_FEE, EMPTY_CALLDATA, { value: INITIAL_WITHDRAW_LIMIT }),
        )
          .to.be.revertedWithCustomError(l2MessageService, "IsPaused")
          .withArgs(GENERAL_PAUSE_TYPE);
      });
    });

    describe("When the L2->L1 messaging service is paused", () => {
      it("Should fail to send if the L2->L1 messaging service is paused", async () => {
        await l2MessageService.connect(securityCouncil).pauseByType(L2_L1_PAUSE_TYPE);

        await expect(
          l2MessageService
            .connect(securityCouncil)
            .sendMessage(notAuthorizedAccount.address, MESSAGE_FEE, EMPTY_CALLDATA, { value: INITIAL_WITHDRAW_LIMIT }),
        )
          .to.be.revertedWithCustomError(l2MessageService, "IsPaused")
          .withArgs(L2_L1_PAUSE_TYPE);
      });
    });

    describe("When the contract is not paused", () => {
      it("Should fail when the fee is higher than the amount sent", async () => {
        await expect(
          l2MessageService.connect(admin).sendMessage(notAuthorizedAccount.address, MESSAGE_FEE, EMPTY_CALLDATA, {
            value: MESSAGE_FEE.sub(ethers.utils.parseEther("0.01")),
          }),
        ).to.be.revertedWithCustomError(l2MessageService, "ValueSentTooLow");
      });

      it("Should fail when the coinbase fee transfer fails", async () => {
        await l2MessageService.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        await ethers.provider.send("hardhat_setCoinbase", [l2MessageService.address]);

        await expect(
          l2MessageService
            .connect(admin)
            .sendMessage(notAuthorizedAccount.address, MESSAGE_FEE.add(MINIMUM_FEE), EMPTY_CALLDATA, {
              value: MINIMUM_FEE.add(MINIMUM_FEE),
            }),
        )
          .to.be.revertedWithCustomError(l2MessageService, "FeePaymentFailed")
          .withArgs(l2MessageService.address);

        await ethers.provider.send("hardhat_setCoinbase", [BLOCK_COINBASE]);
      });

      it("Should fail when the minimumFee is higher than the amount sent", async () => {
        await l2MessageService.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        await expect(
          l2MessageService.connect(admin).sendMessage(notAuthorizedAccount.address, MESSAGE_FEE, EMPTY_CALLDATA, {
            value: MESSAGE_FEE.add(ethers.utils.parseEther("0.01")),
          }),
        ).to.be.revertedWithCustomError(l2MessageService, "FeeTooLow");
      });

      it("Should fail when the to address is address 0", async () => {
        await expect(
          l2MessageService.connect(admin).canSendMessage(ethers.constants.AddressZero, MESSAGE_FEE, "0x", {
            value: MESSAGE_FEE,
          }),
        ).to.be.revertedWithCustomError(l2MessageService, "ZeroAddressNotAllowed");
      });

      it("Should increase the balance of the coinbase with the minimumFee", async () => {
        await l2MessageService.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const initialCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);

        await l2MessageService
          .connect(admin)
          .sendMessage(notAuthorizedAccount.address, MESSAGE_FEE.add(MINIMUM_FEE), EMPTY_CALLDATA, {
            value: MINIMUM_FEE.add(MESSAGE_FEE),
          });

        expect(await ethers.provider.getBalance(BLOCK_COINBASE)).to.be.gt(initialCoinbaseBalance.add(MINIMUM_FEE));
      });

      it("Should succeed if 'MessageSent' event is emitted", async () => {
        await l2MessageService.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const expectedBytes = await encodeSendMessage(
          securityCouncil.address,
          notAuthorizedAccount.address,
          BigNumber.from(MESSAGE_FEE),
          MESSAGE_VALUE_1ETH.sub(MESSAGE_FEE).sub(MINIMUM_FEE),
          BigNumber.from(1),
          EMPTY_CALLDATA,
        );
        const messageHash = ethers.utils.keccak256(expectedBytes);

        await expect(
          l2MessageService
            .connect(securityCouncil)
            .sendMessage(notAuthorizedAccount.address, MESSAGE_FEE.add(MINIMUM_FEE), EMPTY_CALLDATA, {
              value: MESSAGE_VALUE_1ETH,
            }),
        )
          .to.emit(l2MessageService, "MessageSent")
          .withArgs(
            securityCouncil.address,
            notAuthorizedAccount.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH.sub(MESSAGE_FEE).sub(MINIMUM_FEE),
            1,
            EMPTY_CALLDATA,
            messageHash,
          );
      });

      it("Should send an ether only message with fees emitting the MessageSent event", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          BigNumber.from(1),
          "0x",
        );
        const messageHash = ethers.utils.keccak256(expectedBytes);

        await expect(
          l2MessageService.connect(admin).sendMessage(notAuthorizedAccount.address, MESSAGE_FEE, "0x", {
            value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
          }),
        )
          .to.emit(l2MessageService, "MessageSent")
          .withArgs(admin.address, notAuthorizedAccount.address, MESSAGE_FEE, MESSAGE_VALUE_1ETH, 1, "0x", messageHash);
      });

      it("Should send max limit ether only message with no fee emitting the MessageSent event", async () => {
        const expectedBytes = await encodeSendMessage(
          securityCouncil.address,
          notAuthorizedAccount.address,
          BigNumber.from(0),
          INITIAL_WITHDRAW_LIMIT,
          BigNumber.from(1),
          "0x",
        );
        const messageHash = ethers.utils.keccak256(expectedBytes);

        await expect(
          l2MessageService
            .connect(securityCouncil)
            .sendMessage(notAuthorizedAccount.address, 0, "0x", { value: INITIAL_WITHDRAW_LIMIT }),
        )
          .to.emit(l2MessageService, "MessageSent")
          .withArgs(
            securityCouncil.address,
            notAuthorizedAccount.address,
            0,
            INITIAL_WITHDRAW_LIMIT,
            1,
            "0x",
            messageHash,
          );
      });

      it("Should revert with send over max limit amount only", async () => {
        await expect(
          l2MessageService
            .connect(admin)
            .sendMessage(notAuthorizedAccount.address, 0, "0x", { value: INITIAL_WITHDRAW_LIMIT.add(1) }),
        ).to.revertedWithCustomError(l2MessageService, "RateLimitExceeded");
      });

      it("Should revert with send over max limit amount and fees", async () => {
        await expect(
          l2MessageService
            .connect(admin)
            .sendMessage(notAuthorizedAccount.address, 1, "0x", { value: INITIAL_WITHDRAW_LIMIT.add(1) }),
        ).to.revertedWithCustomError(l2MessageService, "RateLimitExceeded");
      });

      it("Should fail when the rate limit would be exceeded - multi transactions", async () => {
        await l2MessageService
          .connect(admin)
          .sendMessage(notAuthorizedAccount.address, MESSAGE_FEE, "0x", { value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH) });

        const breachingAmount = INITIAL_WITHDRAW_LIMIT.sub(MESSAGE_FEE).sub(MESSAGE_VALUE_1ETH).add(1);

        await expect(
          l2MessageService
            .connect(admin)
            .sendMessage(notAuthorizedAccount.address, 0, "0x", { value: breachingAmount }),
        ).to.revertedWithCustomError(l2MessageService, "RateLimitExceeded");
      });
    });
  });

  describe("Claim message", () => {
    describe("When the contract is paused", async () => {
      it("Should revert if the contract is paused", async () => {
        await l2MessageService.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);

        await expect(
          l2MessageService
            .connect(securityCouncil)
            .claimMessage(
              securityCouncil.address,
              notAuthorizedAccount.address,
              MESSAGE_FEE,
              MESSAGE_VALUE_1ETH,
              notAuthorizedAccount.address,
              EMPTY_CALLDATA,
              1,
            ),
        )
          .to.be.revertedWithCustomError(l2MessageService, "IsPaused")
          .withArgs(GENERAL_PAUSE_TYPE);
      });
    });

    describe("When L1->L2 messaging service is paused", async () => {
      it("Should revert if the L1->L2 messaging service is paused", async () => {
        await l2MessageService.connect(securityCouncil).pauseByType(L1_L2_PAUSE_TYPE);

        await expect(
          l2MessageService
            .connect(securityCouncil)
            .claimMessage(
              securityCouncil.address,
              notAuthorizedAccount.address,
              MESSAGE_FEE,
              MESSAGE_VALUE_1ETH,
              notAuthorizedAccount.address,
              EMPTY_CALLDATA,
              1,
            ),
        )
          .to.be.revertedWithCustomError(l2MessageService, "IsPaused")
          .withArgs(L1_L2_PAUSE_TYPE);
      });
    });

    describe("When the contract is not paused", () => {
      it("Should succeed if 'MessageClaimed' event is emitted", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          BigNumber.from(1),
          "0x",
        );

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.utils.keccak256(expectedBytes)];
        await l2MessageService.connect(l1l2MessageSetter).addL1L2MessageHashes(expectedBytesArray);

        await expect(
          l2MessageService.claimMessage(
            admin.address,
            notAuthorizedAccount.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            postmanAddress.address,
            "0x",
            1,
          ),
        )
          .to.emit(l2MessageService, "MessageClaimed")
          .withArgs(ethers.utils.keccak256(expectedBytes));
      });

      it("Should fail when the message hash does not exist", async () => {
        await expect(
          l2MessageService.claimMessage(
            l2MessageService.address,
            notAuthorizedAccount.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            ethers.constants.AddressZero,
            EMPTY_CALLDATA,
            1,
          ),
        ).to.be.revertedWithCustomError(l2MessageService, "MessageDoesNotExistOrHasAlreadyBeenClaimed");
      });

      it("Should execute the claim message and send fees to recipient, left over fee to destination", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          BigNumber.from(1),
          EMPTY_CALLDATA,
        );

        const destinationBalance = await notAuthorizedAccount.getBalance();
        const postmanBalance = await postmanAddress.getBalance();

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.utils.keccak256(expectedBytes)];
        await l2MessageService.connect(l1l2MessageSetter).addL1L2MessageHashes(expectedBytesArray);

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
        expect(await notAuthorizedAccount.getBalance()).to.be.greaterThan(destinationBalance.add(MESSAGE_VALUE_1ETH));
        expect(await postmanAddress.getBalance()).to.be.greaterThan(postmanBalance);
      });

      it("Should execute the claim message and send fees to recipient contract and no leftovers", async () => {
        const factory = await ethers.getContractFactory("TestReceivingContract");
        const testContract = (await factory.deploy()) as TestReceivingContract;

        const expectedBytes = await encodeSendMessage(
          admin.address,
          testContract.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          BigNumber.from(1),
          EMPTY_CALLDATA,
        );

        const postmanBalance = await postmanAddress.getBalance();

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.utils.keccak256(expectedBytes)];
        await l2MessageService.connect(l1l2MessageSetter).addL1L2MessageHashes(expectedBytesArray);

        await l2MessageService.claimMessage(
          admin.address,
          testContract.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          EMPTY_CALLDATA,
          1,
        );
        // greater due to the gas refund
        expect(await ethers.provider.getBalance(testContract.address)).to.be.equal(MESSAGE_VALUE_1ETH);
        expect(await postmanAddress.getBalance()).to.be.equal(postmanBalance.add(MESSAGE_FEE));
      });

      it("Should execute the claim message and send the fees to set recipient, and NOT refund fee to EOA", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          LOW_NO_REFUND_MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          BigNumber.from(1),
          EMPTY_CALLDATA,
        );

        const destinationBalance = await notAuthorizedAccount.getBalance();
        const postmanBalance = await postmanAddress.getBalance();

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.utils.keccak256(expectedBytes)];
        await l2MessageService.connect(l1l2MessageSetter).addL1L2MessageHashes(expectedBytesArray);

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
        expect(await notAuthorizedAccount.getBalance()).to.be.equal(destinationBalance.add(MESSAGE_VALUE_1ETH));
        expect(await postmanAddress.getBalance()).to.be.equal(postmanBalance.add(LOW_NO_REFUND_MESSAGE_FEE));
      });

      it("Should execute the claim message and send fees to EOA with calldata and no refund sent", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          BigNumber.from(1),
          "0x123456789a",
        );

        const destinationBalance = await notAuthorizedAccount.getBalance();
        const postmanBalance = await postmanAddress.getBalance();

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.utils.keccak256(expectedBytes)];
        await l2MessageService.connect(l1l2MessageSetter).addL1L2MessageHashes(expectedBytesArray);

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
        expect(await notAuthorizedAccount.getBalance()).to.be.equal(destinationBalance.add(MESSAGE_VALUE_1ETH));
        expect(await postmanAddress.getBalance()).to.be.equal(postmanBalance.add(MESSAGE_FEE));
      });

      it("Should execute the claim message and no fees to EOA with calldata and no refund sent", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          BigNumber.from(0),
          MESSAGE_VALUE_1ETH,
          BigNumber.from(1),
          "0x123456789a",
        );

        const destinationBalance = await notAuthorizedAccount.getBalance();
        const postmanBalance = await postmanAddress.getBalance();

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.utils.keccak256(expectedBytes)];
        await l2MessageService.connect(l1l2MessageSetter).addL1L2MessageHashes(expectedBytesArray);

        await l2MessageService.claimMessage(
          admin.address,
          notAuthorizedAccount.address,
          BigNumber.from(0),
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          "0x123456789a",
          1,
        );
        // greater due to the gas refund
        expect(await notAuthorizedAccount.getBalance()).to.be.equal(destinationBalance.add(MESSAGE_VALUE_1ETH));
        expect(await postmanAddress.getBalance()).to.be.equal(postmanBalance);
      });

      it("Should execute the claim message and no fees to EOA with no calldata and no refund sent", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          BigNumber.from(0),
          MESSAGE_VALUE_1ETH,
          BigNumber.from(1),
          EMPTY_CALLDATA,
        );

        const destinationBalance = await notAuthorizedAccount.getBalance();
        const postmanBalance = await postmanAddress.getBalance();

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.utils.keccak256(expectedBytes)];
        await l2MessageService.connect(l1l2MessageSetter).addL1L2MessageHashes(expectedBytesArray);

        await l2MessageService.claimMessage(
          admin.address,
          notAuthorizedAccount.address,
          BigNumber.from(0),
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          EMPTY_CALLDATA,
          1,
        );
        // greater due to the gas refund
        expect(await notAuthorizedAccount.getBalance()).to.be.equal(destinationBalance.add(MESSAGE_VALUE_1ETH));
        expect(await postmanAddress.getBalance()).to.be.equal(postmanBalance);
      });

      // todo - add tests for refund checks when gas is lower

      it("Should fail to send if the contract is paused", async () => {
        await l2MessageService.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);

        await expect(
          l2MessageService
            .connect(admin)
            .canSendMessage(notAuthorizedAccount.address, 0, "0x", { value: INITIAL_WITHDRAW_LIMIT }),
        )
          .to.be.revertedWithCustomError(l2MessageService, "IsPaused")
          .withArgs(GENERAL_PAUSE_TYPE);

        const usedAmount = await l2MessageService.currentPeriodAmountInWei();
        expect(usedAmount).to.be.equal(0);
      });

      it("Should fail when the message hash has been claimed", async () => {
        const expectedBytes = await encodeSendMessage(
          l2MessageService.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          BigNumber.from(1),
          "0x",
        );

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.utils.keccak256(expectedBytes)];
        await l2MessageService.connect(l1l2MessageSetter).addL1L2MessageHashes(expectedBytesArray);

        await l2MessageService.claimMessage(
          l2MessageService.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          "0x",
          1,
        );
        await expect(
          l2MessageService.claimMessage(
            l2MessageService.address,
            notAuthorizedAccount.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            postmanAddress.address,
            "0x",
            1,
          ),
        ).to.be.revertedWithCustomError(l2MessageService, "MessageDoesNotExistOrHasAlreadyBeenClaimed");
      });

      it("Should execute the claim message and send the fees to msg.sender", async () => {
        const expectedBytes = await encodeSendMessage(
          l2MessageService.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          BigNumber.from(1),
          "0x",
        );
        const destinationBalance = await notAuthorizedAccount.getBalance();

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.utils.keccak256(expectedBytes)];
        await l2MessageService.connect(l1l2MessageSetter).addL1L2MessageHashes(expectedBytesArray);

        const adminBalance = await admin.getBalance();
        await l2MessageService
          .connect(admin)
          .claimMessage(
            l2MessageService.address,
            notAuthorizedAccount.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            ethers.constants.AddressZero,
            "0x",
            1,
          );

        expect(await notAuthorizedAccount.getBalance()).to.be.greaterThan(destinationBalance.add(MESSAGE_VALUE_1ETH));
        expect(await admin.getBalance()).to.be.greaterThan(adminBalance);

        expect(await l2MessageService.inboxL1L2MessageStatus(ethers.utils.keccak256(expectedBytes))).to.be.equal(
          INBOX_STATUS_CLAIMED,
        );
      });

      // todo also add lower than 5000 gas check for the balances to be equal

      it("Should execute the claim message when there are no fees", async () => {
        const expectedBytes = await encodeSendMessage(
          l2MessageService.address,
          notAuthorizedAccount.address,
          BigNumber.from(0),
          MESSAGE_VALUE_1ETH,
          BigNumber.from(1),
          "0x",
        );
        const destinationBalance = await notAuthorizedAccount.getBalance();

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.utils.keccak256(expectedBytes)];
        await l2MessageService.connect(l1l2MessageSetter).addL1L2MessageHashes(expectedBytesArray);

        const adminBalance = await admin.getBalance();
        await l2MessageService
          .connect(admin)
          .claimMessage(
            l2MessageService.address,
            notAuthorizedAccount.address,
            0,
            MESSAGE_VALUE_1ETH,
            ethers.constants.AddressZero,
            "0x",
            1,
          );

        expect(await notAuthorizedAccount.getBalance()).to.be.equal(destinationBalance.add(MESSAGE_VALUE_1ETH));
        expect(await admin.getBalance()).to.be.lessThan(adminBalance);

        expect(await l2MessageService.inboxL1L2MessageStatus(ethers.utils.keccak256(expectedBytes))).to.be.equal(
          INBOX_STATUS_CLAIMED,
        );
      });

      it("Should provide the correct origin sender", async () => {
        const sendCalldata = generateKeccak256Hash("setSender()").substring(0, 10);

        const expectedBytes = await encodeSendMessage(
          l2MessageService.address,
          l2MessageService.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          BigNumber.from(1),
          sendCalldata,
        );

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.utils.keccak256(expectedBytes)];
        await l2MessageService.connect(l1l2MessageSetter).addL1L2MessageHashes(expectedBytesArray);

        const storedSenderBeforeSending = await l2MessageService.originalSender();
        expect(storedSenderBeforeSending).to.be.equal(ethers.constants.AddressZero);

        await expect(
          l2MessageService
            .connect(admin)
            .claimMessage(
              l2MessageService.address,
              l2MessageService.address,
              MESSAGE_FEE,
              MESSAGE_VALUE_1ETH,
              ethers.constants.AddressZero,
              sendCalldata,
              1,
            ),
        ).to.not.be.reverted;

        const newSender = await l2MessageService.originalSender();
        expect(newSender).to.be.equal(l2MessageService.address);
      });

      it("Should fail on reentry when sending to recipient", async () => {
        const callSignature = generateKeccak256Hash("doReentry()").substring(0, 10);

        const expectedBytes = await encodeSendMessage(
          l2MessageService.address,
          l2MessageService.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          BigNumber.from(1),
          callSignature,
        );

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.utils.keccak256(expectedBytes)];
        await l2MessageService.connect(l1l2MessageSetter).addL1L2MessageHashes(expectedBytesArray);

        await expect(
          l2MessageService
            .connect(admin)
            .claimMessage(
              l2MessageService.address,
              l2MessageService.address,
              MESSAGE_FEE,
              MESSAGE_VALUE_1ETH,
              ethers.constants.AddressZero,
              callSignature,
              1,
            ),
        ).to.be.revertedWithCustomError(l2MessageService, "MessageDoesNotExistOrHasAlreadyBeenClaimed");
      });

      it("Should fail when the destination errors", async () => {
        const expectedBytes = await encodeSendMessage(
          l2MessageService.address,
          l2MessageService.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          BigNumber.from(1),
          "0x",
        );

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.utils.keccak256(expectedBytes)];
        await l2MessageService.connect(l1l2MessageSetter).addL1L2MessageHashes(expectedBytesArray);

        await expect(
          l2MessageService
            .connect(admin)
            .claimMessage(
              l2MessageService.address,
              l2MessageService.address,
              MESSAGE_FEE,
              MESSAGE_VALUE_1ETH,
              ethers.constants.AddressZero,
              "0x",
              1,
            ),
        )
          .to.be.revertedWithCustomError(l2MessageService, "MessageSendingFailed")
          .withArgs(l2MessageService.address);

        expect(await l2MessageService.inboxL1L2MessageStatus(ethers.utils.keccak256(expectedBytes))).to.be.equal(
          INBOX_STATUS_RECEIVED,
        );
      });

      it("Should fail when the fee recipient fails errors", async () => {
        const expectedBytes = await encodeSendMessage(
          l2MessageService.address,
          admin.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          BigNumber.from(1),
          "0x",
        );

        await l2MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.utils.keccak256(expectedBytes)];
        await l2MessageService.connect(l1l2MessageSetter).addL1L2MessageHashes(expectedBytesArray);

        await expect(
          l2MessageService
            .connect(admin)
            .claimMessage(
              l2MessageService.address,
              admin.address,
              MESSAGE_FEE,
              MESSAGE_VALUE_1ETH,
              l2MessageService.address,
              "0x",
              1,
            ),
        )
          .to.be.revertedWithCustomError(l2MessageService, "FeePaymentFailed")
          .withArgs(l2MessageService.address);

        expect(await l2MessageService.inboxL1L2MessageStatus(ethers.utils.keccak256(expectedBytes))).to.be.equal(
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
      expect(await l2MessageService.pauseTypeStatuses(GENERAL_PAUSE_TYPE)).to.be.false;

      await expect(l2MessageService.connect(admin).pauseByType(GENERAL_PAUSE_TYPE)).to.be.revertedWith(
        "AccessControl: account " + admin.address.toLowerCase() + " is missing role " + PAUSE_MANAGER_ROLE,
      );

      expect(await l2MessageService.pauseTypeStatuses(GENERAL_PAUSE_TYPE)).to.be.false;
    });

    it("Should pause as pause manager", async () => {
      expect(await l2MessageService.pauseTypeStatuses(GENERAL_PAUSE_TYPE)).to.be.false;

      await l2MessageService.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);

      expect(await l2MessageService.pauseTypeStatuses(GENERAL_PAUSE_TYPE)).to.be.true;
    });
  });

  describe("Resetting limits", () => {
    it("Should reset limits as limitSetter", async () => {
      let usedAmount = await l2MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(0);

      await l2MessageService
        .connect(admin)
        .sendMessage(notAuthorizedAccount.address, 0, "0x", { value: INITIAL_WITHDRAW_LIMIT });

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
        .sendMessage(notAuthorizedAccount.address, 0, "0x", { value: INITIAL_WITHDRAW_LIMIT });

      usedAmount = await l2MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(INITIAL_WITHDRAW_LIMIT);

      await expect(l2MessageService.connect(admin).resetAmountUsedInPeriod()).to.be.revertedWith(
        "AccessControl: account " + admin.address.toLowerCase() + " is missing role " + RATE_LIMIT_SETTER_ROLE,
      );

      usedAmount = await l2MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(INITIAL_WITHDRAW_LIMIT);
    });
  });
});
