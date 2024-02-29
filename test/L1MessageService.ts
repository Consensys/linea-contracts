import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { loadFixture, setNonce } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
  TestL1MessageService,
  TestReceivingContract,
  TestL1MessageServiceMerkleProof,
  TestL1RevertContract,
} from "../typechain-types";
import {
  DEFAULT_ADMIN_ROLE,
  EMPTY_CALLDATA,
  GENERAL_PAUSE_TYPE,
  INBOX_STATUS_RECEIVED,
  INBOX_STATUS_UNKNOWN,
  INITIAL_WITHDRAW_LIMIT,
  L1_L2_PAUSE_TYPE,
  L2_L1_PAUSE_TYPE,
  LOW_NO_REFUND_MESSAGE_FEE,
  MESSAGE_FEE,
  MESSAGE_VALUE_1ETH,
  ONE_DAY_IN_SECONDS,
  PAUSE_MANAGER_ROLE,
  RATE_LIMIT_SETTER_ROLE,
  VERY_HIGH_MIGRATION_BLOCK,
} from "./utils/constants";
import { deployUpgradableFromFactory } from "./utils/deployment";
import { calculateRollingHash, encodeSendMessage, generateKeccak256Hash } from "./utils/helpers";

describe("L1MessageService", () => {
  let l1MessageService: TestL1MessageService;
  let l1MessageServiceMerkleProof: TestL1MessageServiceMerkleProof;
  let l1TestRevert: TestL1RevertContract;
  let admin: SignerWithAddress;
  let pauser: SignerWithAddress;
  let limitSetter: SignerWithAddress;
  let notAuthorizedAccount: SignerWithAddress;
  let postmanAddress: SignerWithAddress;

  async function deployTestL1MessageServiceFixture(): Promise<TestL1MessageService> {
    return deployUpgradableFromFactory("TestL1MessageService", [
      limitSetter.address,
      pauser.address,
      ONE_DAY_IN_SECONDS,
      INITIAL_WITHDRAW_LIMIT,
      VERY_HIGH_MIGRATION_BLOCK,
    ]) as Promise<TestL1MessageService>;
  }

  async function deployL1MessageServiceMerkleFixture(): Promise<TestL1MessageServiceMerkleProof> {
    return deployUpgradableFromFactory("TestL1MessageServiceMerkleProof", [
      limitSetter.address,
      pauser.address,
      ONE_DAY_IN_SECONDS,
      INITIAL_WITHDRAW_LIMIT,
      VERY_HIGH_MIGRATION_BLOCK,
    ]) as Promise<TestL1MessageServiceMerkleProof>;
  }

  async function deployL1TestRevertFixture(): Promise<TestL1RevertContract> {
    return deployUpgradableFromFactory("TestL1RevertContract", []) as Promise<TestL1RevertContract>;
  }
  before(async () => {
    [admin, pauser, limitSetter, notAuthorizedAccount, postmanAddress] = await ethers.getSigners();
    await setNonce(admin.address, 1);
  });

  beforeEach(async () => {
    l1MessageService = await loadFixture(deployTestL1MessageServiceFixture);
    l1MessageServiceMerkleProof = await loadFixture(deployL1MessageServiceMerkleFixture);
    l1TestRevert = await loadFixture(deployL1TestRevertFixture);

    await l1MessageService.addFunds({ value: INITIAL_WITHDRAW_LIMIT.mul(2) });
    await l1MessageServiceMerkleProof.addFunds({ value: INITIAL_WITHDRAW_LIMIT.mul(2) });
  });

  describe("Initialisation tests", () => {
    it("Deployer has default admin role", async () => {
      expect(await l1MessageService.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("limitSetter has RATE_LIMIT_SETTER_ROLE", async () => {
      expect(await l1MessageService.hasRole(RATE_LIMIT_SETTER_ROLE, limitSetter.address)).to.be.true;
    });

    it("pauser has PAUSE_MANAGER_ROLE", async () => {
      expect(await l1MessageService.hasRole(PAUSE_MANAGER_ROLE, pauser.address)).to.be.true;
    });

    it("Should set rate limit and period", async () => {
      expect(await l1MessageService.periodInSeconds()).to.be.equal(ONE_DAY_IN_SECONDS);
      expect(await l1MessageService.limitInWei()).to.be.equal(INITIAL_WITHDRAW_LIMIT);
    });

    it("It should fail when not initializing", async () => {
      await expect(
        l1MessageService.tryInitialize(
          limitSetter.address,
          pauser.address,
          ONE_DAY_IN_SECONDS,
          INITIAL_WITHDRAW_LIMIT,
          VERY_HIGH_MIGRATION_BLOCK,
        ),
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("Should initialise nextMessageNumber", async () => {
      expect(await l1MessageService.nextMessageNumber()).to.be.equal(1);
    });

    it("Should emit a SystemMigrationBlockInitialized event when initializing", async () => {
      const SystemMigrationBlockInitializedEvent = "0x405b3b16b9190c1e995514c13ab4e8e7d895d9103e91c3a8c8f12df6cd50aa2c";

      const factory = await ethers.getContractFactory("TestL1MessageService");
      const contract = await upgrades.deployProxy(factory, [
        limitSetter.address,
        pauser.address,
        ONE_DAY_IN_SECONDS,
        INITIAL_WITHDRAW_LIMIT,
        VERY_HIGH_MIGRATION_BLOCK,
      ]);
      await contract.deployed();

      const receipt = await ethers.provider.getTransactionReceipt(contract.deployTransaction.hash);

      const filteredLogs = receipt.logs.filter(
        (log) => log.address === contract.address && log.topics[0] === SystemMigrationBlockInitializedEvent,
      );
      expect(filteredLogs.length).to.equal(1);
      const parsedLogs = contract.interface.parseLog(filteredLogs[0]);

      expect(parsedLogs.args.systemMigrationBlock).to.equal(VERY_HIGH_MIGRATION_BLOCK);
    });

    it("Should fail to deploy missing amount", async () => {
      await expect(
        deployUpgradableFromFactory("TestL1MessageService", [
          limitSetter.address,
          pauser.address,
          ONE_DAY_IN_SECONDS,
          0,
          VERY_HIGH_MIGRATION_BLOCK,
        ]),
      ).to.revertedWithCustomError(l1MessageService, "LimitIsZero");
    });

    it("Should fail to deploy missing limit period", async () => {
      await expect(
        deployUpgradableFromFactory("TestL1MessageService", [
          limitSetter.address,
          pauser.address,
          0,
          INITIAL_WITHDRAW_LIMIT,
          VERY_HIGH_MIGRATION_BLOCK,
        ]),
      ).to.revertedWithCustomError(l1MessageService, "PeriodIsZero");
    });

    it("Should fail with empty limiter address", async () => {
      await expect(
        deployUpgradableFromFactory("TestL1MessageService", [
          ethers.constants.AddressZero,
          pauser.address,
          ONE_DAY_IN_SECONDS,
          INITIAL_WITHDRAW_LIMIT,
          VERY_HIGH_MIGRATION_BLOCK,
        ]),
      ).to.revertedWithCustomError(l1MessageService, "ZeroAddressNotAllowed");
    });

    it("Should fail with empty pauser address", async () => {
      await expect(
        deployUpgradableFromFactory("TestL1MessageService", [
          limitSetter.address,
          ethers.constants.AddressZero,
          ONE_DAY_IN_SECONDS,
          INITIAL_WITHDRAW_LIMIT,
          VERY_HIGH_MIGRATION_BLOCK,
        ]),
      ).to.revertedWithCustomError(l1MessageService, "ZeroAddressNotAllowed");
    });

    it("Can upgrade existing contract", async () => {
      const contract = await deployUpgradableFromFactory(
        "ZkEvmV2Mainnet",
        [ethers.constants.HashZero, 1, admin.address, admin.address, [admin.address], 100, 100],
        {
          initializer: "initialize(bytes32,uint256,address,address,address[],uint256,uint256)",
          unsafeAllow: ["constructor"],
        },
      );
      const LineaRollupFactory = await ethers.getContractFactory("LineaRollup");

      await upgrades.validateUpgrade(contract, LineaRollupFactory);

      const newContract = await upgrades.upgradeProxy(contract, LineaRollupFactory, {
        call: { fn: "initializeSystemMigrationBlock", args: [101] },
        kind: "transparent",
      });

      const upgradedContract = await newContract.deployed();

      await upgrades.validateImplementation(LineaRollupFactory);

      expect(await upgradedContract.systemMigrationBlock()).to.equal(BigNumber.from(101));
    });

    it("Can't upgrade existing contract with a zero value", async () => {
      const contract = await deployUpgradableFromFactory(
        "ZkEvmV2Mainnet",
        [ethers.constants.HashZero, 1, admin.address, admin.address, [admin.address], 100, 100],
        {
          initializer: "initialize(bytes32,uint256,address,address,address[],uint256,uint256)",
          unsafeAllow: ["constructor"],
        },
      );
      const LineaRollupFactory = await ethers.getContractFactory("LineaRollup");

      await upgrades.validateUpgrade(contract, LineaRollupFactory);

      await expect(
        upgrades.upgradeProxy(contract, LineaRollupFactory, {
          call: { fn: "initializeSystemMigrationBlock", args: [0] },
          kind: "transparent",
        }),
      ).to.be.revertedWithCustomError(LineaRollupFactory, "SystemMigrationBlockZero");
    });

    it("Can't upgrade existing contract if not initializing", async () => {
      const contract = await deployTestL1MessageServiceFixture();

      const deployedContract = await contract.deployed();
      await expect(deployedContract.nonInitializedTest(100)).to.be.revertedWith(
        "Initializable: contract is not initializing",
      );
    });

    it("Can't upgrade existing contract twice", async () => {
      const contract = await deployUpgradableFromFactory(
        "ZkEvmV2Mainnet",
        [ethers.constants.HashZero, 1, admin.address, admin.address, [admin.address], 100, 100],
        {
          initializer: "initialize(bytes32,uint256,address,address,address[],uint256,uint256)",
          unsafeAllow: ["constructor"],
        },
      );
      const LineaRollupFactory = await ethers.getContractFactory("LineaRollup");
      const newContract = await upgrades.upgradeProxy(contract, LineaRollupFactory, {
        call: { fn: "initializeSystemMigrationBlock", args: [101] },
        kind: "transparent",
      });
      await newContract.deployed();

      await expect(
        upgrades.upgradeProxy(contract, LineaRollupFactory, {
          call: { fn: "initializeSystemMigrationBlock", args: [101] },
          kind: "transparent",
        }),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("Send messages", () => {
    beforeEach(async () => {
      await l1MessageService.setSystemMigrationBlock(BigNumber.from(1000));
    });

    it("Should fail when the fee is higher than the amount sent", async () => {
      await expect(
        l1MessageService.connect(admin).canSendMessage(notAuthorizedAccount.address, MESSAGE_FEE, "0x", {
          value: MESSAGE_FEE.sub(1),
        }),
      ).to.be.revertedWithCustomError(l1MessageService, "ValueSentTooLow");
    });

    it("Should fail when the to address is address 0", async () => {
      await expect(
        l1MessageService.connect(admin).canSendMessage(ethers.constants.AddressZero, MESSAGE_FEE, "0x", {
          value: MESSAGE_FEE,
        }),
      ).to.be.revertedWithCustomError(l1MessageService, "ZeroAddressNotAllowed");
    });

    it("Should send an ether only message with fees emitting the MessageSent event", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x",
      );

      const messageHash = ethers.utils.keccak256(expectedBytes);

      await expect(
        l1MessageService.connect(admin).canSendMessage(notAuthorizedAccount.address, MESSAGE_FEE, "0x", {
          value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
        }),
      )
        .to.emit(l1MessageService, "MessageSent")
        .withArgs(
          l1MessageService.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1,
          "0x",
          messageHash,
        )
        .to.not.emit(l1MessageService, "RollingHashUpdated");
    });

    it("Should send max limit ether only message with no fee emitting the MessageSent event", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        BigNumber.from(0),
        INITIAL_WITHDRAW_LIMIT,
        BigNumber.from(1),
        "0x",
      );
      const messageHash = ethers.utils.keccak256(expectedBytes);

      await expect(
        l1MessageService
          .connect(admin)
          .canSendMessage(notAuthorizedAccount.address, 0, "0x", { value: INITIAL_WITHDRAW_LIMIT }),
      )
        .to.emit(l1MessageService, "MessageSent")
        .withArgs(
          l1MessageService.address,
          notAuthorizedAccount.address,
          0,
          INITIAL_WITHDRAW_LIMIT,
          1,
          "0x",
          messageHash,
        )
        .to.not.emit(l1MessageService, "RollingHashUpdated");
    });

    // this is testing to allow even if claim is blocked
    it("Should send a message even when L2 to L1 communication is paused", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x",
      );

      const messageHash = ethers.utils.keccak256(expectedBytes);

      await l1MessageService.connect(pauser).pauseByType(L2_L1_PAUSE_TYPE);

      await expect(
        l1MessageService.connect(admin).canSendMessage(notAuthorizedAccount.address, MESSAGE_FEE, "0x", {
          value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
        }),
      )
        .to.emit(l1MessageService, "MessageSent")
        .withArgs(
          l1MessageService.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1,
          "0x",
          messageHash,
        )
        .to.not.emit(l1MessageService, "RollingHashUpdated");
    });

    it("Should update the rolling hash when sending a message post migration", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x",
      );

      await l1MessageService.resetSystemMigrationBlock(BigNumber.from(1));

      const messageHash = ethers.utils.keccak256(expectedBytes);
      const rollingHash = calculateRollingHash(ethers.constants.HashZero, messageHash);

      await expect(
        l1MessageService.connect(admin).canSendMessage(notAuthorizedAccount.address, MESSAGE_FEE, "0x", {
          value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
        }),
      )
        .to.emit(l1MessageService, "MessageSent")
        .withArgs(
          l1MessageService.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1,
          "0x",
          messageHash,
        )
        .to.emit(l1MessageService, "RollingHashUpdated")
        .withArgs(1, rollingHash, messageHash);

      const rollingHashAtIndex = await l1MessageService.rollingHashes(1);

      expect(rollingHashAtIndex).to.equal(rollingHash);
      expect(rollingHashAtIndex).to.not.equal(ethers.constants.HashZero);
    });

    it("Should use the previous existing rolling hash when sending a message post migration", async () => {
      let expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x",
      );

      await l1MessageService.resetSystemMigrationBlock(BigNumber.from(1));
      let messageHash = ethers.utils.keccak256(expectedBytes);
      let rollingHash = calculateRollingHash(ethers.constants.HashZero, messageHash);

      await l1MessageService.connect(admin).canSendMessage(notAuthorizedAccount.address, MESSAGE_FEE, "0x", {
        value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
      });

      expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(2),
        "0x",
      );

      messageHash = ethers.utils.keccak256(expectedBytes);

      rollingHash = calculateRollingHash(rollingHash, messageHash);

      await expect(
        l1MessageService.connect(admin).canSendMessage(notAuthorizedAccount.address, MESSAGE_FEE, "0x", {
          value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
        }),
      )
        .to.emit(l1MessageService, "MessageSent")
        .withArgs(
          l1MessageService.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          2,
          "0x",
          messageHash,
        )
        .to.emit(l1MessageService, "RollingHashUpdated")
        .withArgs(2, rollingHash, messageHash);

      const rollingHashAtIndex = await l1MessageService.rollingHashes(2);
      expect(rollingHashAtIndex).to.equal(rollingHash);
      expect(rollingHashAtIndex).to.not.equal(ethers.constants.HashZero);
    });
  });

  describe("Claiming messages", () => {
    it("Should fail when the message hash does not exist", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x",
      );

      const messageHash = ethers.utils.keccak256(expectedBytes);

      await expect(
        l1MessageService.claimMessage(
          l1MessageService.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          ethers.constants.AddressZero,
          "0x",
          1,
        ),
      )
        .to.be.revertedWithCustomError(l1MessageService, "MessageDoesNotExistOrHasAlreadyBeenClaimed")
        .withArgs(messageHash);
    });

    it("Should execute the claim message and send fees to recipient, left over fee to destination", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x",
      );

      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));

      await l1MessageService.claimMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        postmanAddress.address,
        "0x",
        1,
      );
    });

    it("Should claim message and send the fees when L1 to L2 communication is paused", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x",
      );

      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));

      // this is for sending only and should not affect claim
      await l1MessageService.connect(pauser).pauseByType(L1_L2_PAUSE_TYPE);

      await l1MessageService.claimMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        postmanAddress.address,
        "0x",
        1,
      );
    });

    it("Should execute the claim message and emit the MessageClaimed event", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x",
      );

      const messageHash = ethers.utils.keccak256(expectedBytes);

      await l1MessageService.addL2L1MessageHash(messageHash);

      await expect(
        l1MessageService.claimMessage(
          l1MessageService.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          "0x",
          1,
        ),
      )
        .to.emit(l1MessageService, "MessageClaimed")
        .withArgs(messageHash);
    });

    it("Should fail when the message hash has been claimed", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x",
      );

      const messageHash = ethers.utils.keccak256(expectedBytes);

      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));

      await l1MessageService.claimMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        postmanAddress.address,
        "0x",
        1,
      );
      await expect(
        l1MessageService.claimMessage(
          l1MessageService.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          "0x",
          1,
        ),
      )
        .to.be.revertedWithCustomError(l1MessageService, "MessageDoesNotExistOrHasAlreadyBeenClaimed")
        .withArgs(messageHash);
    });

    it("Should execute the claim message and send the fees to msg.sender, left over fee to destination", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x",
      );

      const expectedSecondBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(2),
        "0x",
      );

      const destinationBalance = await notAuthorizedAccount.getBalance();

      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));
      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedSecondBytes));

      await l1MessageService
        .connect(admin)
        .claimMessage(
          l1MessageService.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          ethers.constants.AddressZero,
          "0x",
          1,
        );

      const adminBalance = await admin.getBalance();

      await l1MessageService
        .connect(admin)
        .claimMessage(
          l1MessageService.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          ethers.constants.AddressZero,
          "0x",
          2,
        );

      expect(await notAuthorizedAccount.getBalance()).to.be.greaterThan(
        destinationBalance.add(MESSAGE_VALUE_1ETH).add(MESSAGE_VALUE_1ETH),
      );
      expect(await admin.getBalance()).to.be.greaterThan(adminBalance);

      expect(await l1MessageService.inboxL2L1MessageStatus(ethers.utils.keccak256(expectedBytes))).to.be.equal(
        INBOX_STATUS_UNKNOWN,
      );
    });

    it("Should execute the claim message and send the fees to msg.sender and NOT refund the destination", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        LOW_NO_REFUND_MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x",
      );
      const destinationBalance = await notAuthorizedAccount.getBalance();

      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));

      await l1MessageService
        .connect(admin)
        .claimMessage(
          l1MessageService.address,
          notAuthorizedAccount.address,
          LOW_NO_REFUND_MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          ethers.constants.AddressZero,
          "0x",
          1,
          { gasPrice: 1000000000 },
        );

      expect(await notAuthorizedAccount.getBalance()).to.be.equal(destinationBalance.add(MESSAGE_VALUE_1ETH));

      expect(await l1MessageService.inboxL2L1MessageStatus(ethers.utils.keccak256(expectedBytes))).to.be.equal(
        INBOX_STATUS_UNKNOWN,
      );
    });

    it("Should execute the claim message and send fees to recipient contract and no refund sent", async () => {
      const factory = await ethers.getContractFactory("TestReceivingContract");
      const testContract = (await factory.deploy()) as TestReceivingContract;

      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        testContract.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x",
      );

      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));

      const adminBalance = await admin.getBalance();
      await l1MessageService
        .connect(admin)
        .claimMessage(
          l1MessageService.address,
          testContract.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          ethers.constants.AddressZero,
          "0x",
          1,
        );

      expect(await ethers.provider.getBalance(testContract.address)).to.be.equal(MESSAGE_VALUE_1ETH);
      expect(await admin.getBalance()).to.be.greaterThan(adminBalance);

      expect(await l1MessageService.inboxL2L1MessageStatus(ethers.utils.keccak256(expectedBytes))).to.be.equal(
        INBOX_STATUS_UNKNOWN,
      );
    });

    it("Should execute the claim message and send fees to EOA with calldata and no refund sent", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x123456789a",
      );

      const startingBalance = await notAuthorizedAccount.getBalance();

      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));

      const adminBalance = await admin.getBalance();
      await l1MessageService
        .connect(admin)
        .claimMessage(
          l1MessageService.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          ethers.constants.AddressZero,
          "0x123456789a",
          1,
        );

      expect(await notAuthorizedAccount.getBalance()).to.be.equal(startingBalance.add(MESSAGE_VALUE_1ETH));
      expect(await admin.getBalance()).to.be.greaterThan(adminBalance);

      expect(await l1MessageService.inboxL2L1MessageStatus(ethers.utils.keccak256(expectedBytes))).to.be.equal(
        INBOX_STATUS_UNKNOWN,
      );
    });

    it("Should execute the claim message and no fees to EOA with calldata and no refund sent", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        BigNumber.from(0),
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x12",
      );

      const startingBalance = await notAuthorizedAccount.getBalance();

      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));

      const adminBalance = await admin.getBalance();
      await l1MessageService
        .connect(admin)
        .claimMessage(
          l1MessageService.address,
          notAuthorizedAccount.address,
          BigNumber.from(0),
          MESSAGE_VALUE_1ETH,
          ethers.constants.AddressZero,
          "0x12",
          1,
        );

      expect(await notAuthorizedAccount.getBalance()).to.be.equal(startingBalance.add(MESSAGE_VALUE_1ETH));
      expect(await admin.getBalance()).to.be.lessThan(adminBalance);

      expect(await l1MessageService.inboxL2L1MessageStatus(ethers.utils.keccak256(expectedBytes))).to.be.equal(
        INBOX_STATUS_UNKNOWN,
      );
    });

    it("Should execute the claim message and no fees to EOA with empty calldata and no refund sent", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        BigNumber.from(0),
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        EMPTY_CALLDATA,
      );

      const startingBalance = await notAuthorizedAccount.getBalance();

      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));

      const adminBalance = await admin.getBalance();
      await l1MessageService
        .connect(admin)
        .claimMessage(
          l1MessageService.address,
          notAuthorizedAccount.address,
          BigNumber.from(0),
          MESSAGE_VALUE_1ETH,
          ethers.constants.AddressZero,
          EMPTY_CALLDATA,
          1,
        );

      expect(await notAuthorizedAccount.getBalance()).to.be.equal(startingBalance.add(MESSAGE_VALUE_1ETH));
      expect(await admin.getBalance()).to.be.lessThan(adminBalance);

      expect(await l1MessageService.inboxL2L1MessageStatus(ethers.utils.keccak256(expectedBytes))).to.be.equal(
        INBOX_STATUS_UNKNOWN,
      );
    });

    it("Should execute the claim message when there are no fees", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        notAuthorizedAccount.address,
        BigNumber.from(0),
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x",
      );
      const destinationBalance = await notAuthorizedAccount.getBalance();

      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));

      const adminBalance = await admin.getBalance();
      await l1MessageService
        .connect(admin)
        .claimMessage(
          l1MessageService.address,
          notAuthorizedAccount.address,
          0,
          MESSAGE_VALUE_1ETH,
          ethers.constants.AddressZero,
          "0x",
          1,
        );

      expect(await notAuthorizedAccount.getBalance()).to.be.equal(destinationBalance.add(MESSAGE_VALUE_1ETH));
      expect(await admin.getBalance()).to.be.lessThan(adminBalance);

      expect(await l1MessageService.inboxL2L1MessageStatus(ethers.utils.keccak256(expectedBytes))).to.be.equal(
        INBOX_STATUS_UNKNOWN,
      );
    });

    it("Should provide the correct origin sender", async () => {
      const sendCalldata = generateKeccak256Hash("setSender()").substring(0, 10);

      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        l1MessageService.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        sendCalldata,
      );

      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));

      const storedSenderBeforeSending = await l1MessageService.originalSender();
      expect(storedSenderBeforeSending).to.be.equal(ethers.constants.AddressZero);

      await expect(
        l1MessageService
          .connect(admin)
          .claimMessage(
            l1MessageService.address,
            l1MessageService.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            ethers.constants.AddressZero,
            sendCalldata,
            1,
          ),
      ).to.not.be.reverted;

      const newSender = await l1MessageService.originalSender();

      expect(newSender).to.be.equal(l1MessageService.address);
    });

    it("Should allow sending post claiming a message", async () => {
      const sendCalldata = generateKeccak256Hash("sendNewMessage()").substring(0, 10);

      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        l1MessageService.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        sendCalldata,
      );

      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));

      await expect(
        l1MessageService
          .connect(admin)
          .claimMessage(
            l1MessageService.address,
            l1MessageService.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            ethers.constants.AddressZero,
            sendCalldata,
            1,
          ),
      ).to.not.be.reverted;
    });

    it("Should fail on reentry when sending to recipient", async () => {
      const callSignature = generateKeccak256Hash("doReentry()").substring(0, 10);

      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        l1MessageService.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        callSignature,
      );

      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));

      await expect(
        l1MessageService
          .connect(admin)
          .claimMessage(
            l1MessageService.address,
            l1MessageService.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            ethers.constants.AddressZero,
            callSignature,
            BigNumber.from(1),
          ),
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("Should fail when the destination errors", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        l1MessageService.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x",
      );

      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));
      await expect(
        l1MessageService
          .connect(admin)
          .claimMessage(
            l1MessageService.address,
            l1MessageService.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            ethers.constants.AddressZero,
            "0x",
            1,
          ),
      )
        .to.be.revertedWithCustomError(l1MessageService, "MessageSendingFailed")
        .withArgs(l1MessageService.address);

      expect(await l1MessageService.inboxL2L1MessageStatus(ethers.utils.keccak256(expectedBytes))).to.be.equal(
        INBOX_STATUS_RECEIVED,
      );
    });

    it("Should fail when the fee recipient fails errors", async () => {
      const expectedBytes = await encodeSendMessage(
        l1MessageService.address,
        admin.address,
        MESSAGE_FEE,
        MESSAGE_VALUE_1ETH,
        BigNumber.from(1),
        "0x",
      );

      await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));

      await expect(
        l1MessageService
          .connect(admin)
          .claimMessage(
            l1MessageService.address,
            admin.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            l1MessageService.address,
            "0x",
            1,
          ),
      )
        .to.be.revertedWithCustomError(l1MessageService, "FeePaymentFailed")
        .withArgs(l1MessageService.address);

      expect(await l1MessageService.inboxL2L1MessageStatus(ethers.utils.keccak256(expectedBytes))).to.be.equal(
        INBOX_STATUS_RECEIVED,
      );
    });

    it("Should revert with send over max limit amount only", async () => {
      await setHash(BigNumber.from(0), INITIAL_WITHDRAW_LIMIT.add(1));

      await expect(
        l1MessageService.claimMessage(
          l1MessageService.address,
          notAuthorizedAccount.address,
          0,
          INITIAL_WITHDRAW_LIMIT.add(1),
          postmanAddress.address,
          "0x",
          1,
        ),
      ).to.revertedWithCustomError(l1MessageService, "RateLimitExceeded");
    });

    it("Should revert with send over max limit amount and fees", async () => {
      await setHash(BigNumber.from(1), INITIAL_WITHDRAW_LIMIT.add(1));

      await expect(
        l1MessageService.claimMessage(
          l1MessageService.address,
          notAuthorizedAccount.address,
          1,
          INITIAL_WITHDRAW_LIMIT.add(1),
          postmanAddress.address,
          "0x",
          1,
        ),
      ).to.revertedWithCustomError(l1MessageService, "RateLimitExceeded");
    });

    it("Should revert with send over max limit amount and fees - multi tx", async () => {
      await setHashAndClaimMessage(MESSAGE_FEE, MESSAGE_VALUE_1ETH);

      await setHash(BigNumber.from(1), INITIAL_WITHDRAW_LIMIT.sub(MESSAGE_VALUE_1ETH).sub(MESSAGE_FEE).add(1));

      // limit - (fee+amount from success tx) + 1 = 1 over limit
      await expect(
        l1MessageService.claimMessage(
          l1MessageService.address,
          notAuthorizedAccount.address,
          1,
          INITIAL_WITHDRAW_LIMIT.sub(MESSAGE_VALUE_1ETH).sub(MESSAGE_FEE).add(1),
          postmanAddress.address,
          "0x",
          1,
        ),
      ).to.revertedWithCustomError(l1MessageService, "RateLimitExceeded");
    });
  });

  describe("Claim Message with Proof", () => {
    const VALID_MERKLE_PROOF = {
      //proof length 32
      proof: [
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0xad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb5",
        "0xb4c11951957c6f8f642c4af61cd6b24640fec6dc7fc607ee8206a99e92410d30",
        "0x21ddb9a356815c3fac1026b6dec5df3124afbadb485c9ba5a3e3398a04b7ba85",
        "0xe58769b32a1beaf1ea27375a44095a0d1fb664ce2dd358e7fcbfb78c26a19344",
        "0x0eb01ebfc9ed27500cd4dfc979272d1f0913cc9f66540d7e8005811109e1cf2d",
        "0x887c22bd8750d34016ac3c66b5ff102dacdd73f6b014e710b51e8022af9a1968",
        "0xffd70157e48063fc33c97a050f7f640233bf646cc98d9524c6b92bcf3ab56f83",
        "0x9867cc5f7f196b93bae1e27e6320742445d290f2263827498b54fec539f756af",
        "0xcefad4e508c098b9a7e1d8feb19955fb02ba9675585078710969d3440f5054e0",
        "0xf9dc3e7fe016e050eff260334f18a5d4fe391d82092319f5964f2e2eb7c1c3a5",
        "0xf8b13a49e282f609c317a833fb8d976d11517c571d1221a265d25af778ecf892",
        "0x3490c6ceeb450aecdc82e28293031d10c7d73bf85e57bf041a97360aa2c5d99c",
        "0xc1df82d9c4b87413eae2ef048f94b4d3554cea73d92b0f7af96e0271c691e2bb",
        "0x5c67add7c6caf302256adedf7ab114da0acfe870d449a3a489f781d659e8becc",
        "0xda7bce9f4e8618b6bd2f4132ce798cdc7a60e7e1460a7299e3c6342a579626d2",
        "0x2733e50f526ec2fa19a22b31e8ed50f23cd1fdf94c9154ed3a7609a2f1ff981f",
        "0xe1d3b5c807b281e4683cc6d6315cf95b9ade8641defcb32372f1c126e398ef7a",
        "0x5a2dce0a8a7f68bb74560f8f71837c2c2ebbcbf7fffb42ae1896f13f7c7479a0",
        "0xb46a28b6f55540f89444f63de0378e3d121be09e06cc9ded1c20e65876d36aa0",
        "0xc65e9645644786b620e2dd2ad648ddfcbf4a7e5b1a3a4ecfe7f64667a3f0b7e2",
        "0xf4418588ed35a2458cffeb39b93d26f18d2ab13bdce6aee58e7b99359ec2dfd9",
        "0x5a9c16dc00d6ef18b7933a6f8dc65ccb55667138776f7dea101070dc8796e377",
        "0x4df84f40ae0c8229d0d6069e5c8f39a7c299677a09d367fc7b05e3bc380ee652",
        "0xcdc72595f74c7b1043d0e1ffbab734648c838dfb0527d971b602bc216c9619ef",
        "0x0abf5ac974a1ed57f4050aa510dd9c74f508277b39d7973bb2dfccc5eeb0618d",
        "0xb8cd74046ff337f0a7bf2c8e03e10f642c1886798d71806ab1e888d9e5ee87d0",
        "0x838c5655cb21c6cb83313b5a631175dff4963772cce9108188b34ac87c81c41e",
        "0x662ee4dd2dd7b2bc707961b1e646c4047669dcb6584f0d8d770daf5d7e7deb2e",
        "0x388ab20e2573d171a88108e79d820e98f26c0b84aa8b2f4aa4968dbb818ea322",
        "0x93237c50ba75ee485f4c22adf2f741400bdf8d6a9cc7df7ecae576221665d735",
        "0x8448818bb4ae4562849e949e17ac16e0be16688e156b5cf15e098c627c0056a9",
      ],
      merkleRoot: "0x54e37f6a8efe3497d1b721d8a5a19786e78d16edabdefdfa94173ef104b132cb",
      index: 0,
    };

    const INVALID_MERKLE_PROOF = {
      merkleRoot: "0xfbe8939cea4bb333e59120d35f318e3e7c88cdd0e70e66ae98b64efb9a5716ec",
      index: 0,
      proof: [
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0xad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb5",
        "0xb4c11951957c6f8f642c4af61cd6b24640fec6dc7fc607ee8206a99e92410d30",
        "0x21ddb9a356815c3fac1026b6dec5df3124afbadb485c9ba5a3e3398a04b7ba85",
        "0xe58769b32a1beaf1ea27375a44095a0d1fb664ce2dd358e7fcbfb78c26a19344",
        "0x0eb01ebfc9ed27500cd4dfc979272d1f0913cc9f66540d7e8005811109e1cf2d",
        "0x887c22bd8750d34016ac3c66b5ff102dacdd73f6b014e710b51e8022af9a1968",
        "0xffd70157e48063fc33c97a050f7f640233bf646cc98d9524c6b92bcf3ab56f83",
        "0x9867cc5f7f196b93bae1e27e6320742445d290f2263827498b54fec539f756af",
        "0xcefad4e508c098b9a7e1d8feb19955fb02ba9675585078710969d3440f5054e0",
        "0xf9dc3e7fe016e050eff260334f18a5d4fe391d82092319f5964f2e2eb7c1c3a5",
        "0xf8b13a49e282f609c317a833fb8d976d11517c571d1221a265d25af778ecf892",
        "0x3490c6ceeb450aecdc82e28293031d10c7d73bf85e57bf041a97360aa2c5d99c",
        "0xc1df82d9c4b87413eae2ef048f94b4d3554cea73d92b0f7af96e0271c691e2bb",
        "0x5c67add7c6caf302256adedf7ab114da0acfe870d449a3a489f781d659e8becc",
        "0xad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb5",
        "0x2733e50f526ec2fa19a22b31e8ed50f23cd1fdf94c9154ed3a7609a2f1ff981f",
        "0xe1d3b5c807b281e4683cc6d6315cf95b9ade8641defcb32372f1c126e398ef7a",
        "0x5a2dce0a8a7f68bb74560f8f71837c2c2ebbcbf7fffb42ae1896f13f7c7479a0",
        "0xb46a28b6f55540f89444f63de0378e3d121be09e06cc9ded1c20e65876d36aa0",
        "0xc65e9645644786b620e2dd2ad648ddfcbf4a7e5b1a3a4ecfe7f64667a3f0b7e2",
        "0xf4418588ed35a2458cffeb39b93d26f18d2ab13bdce6aee58e7b99359ec2dfd9",
        "0x5a9c16dc00d6ef18b7933a6f8dc65ccb55667138776f7dea101070dc8796e377",
        "0x4df84f40ae0c8229d0d6069e5c8f39a7c299677a09d367fc7b05e3bc380ee652",
        "0xcdc72595f74c7b1043d0e1ffbab734648c838dfb0527d971b602bc216c9619ef",
        "0x0abf5ac974a1ed57f4050aa510dd9c74f508277b39d7973bb2dfccc5eeb0618d",
        "0xb8cd74046ff337f0a7bf2c8e03e10f642c1886798d71806ab1e888d9e5ee87d0",
        "0x838c5655cb21c6cb83313b5a631175dff4963772cce9108188b34ac87c81c41e",
        "0x662ee4dd2dd7b2bc707961b1e646c4047669dcb6584f0d8d770daf5d7e7deb2e",
        "0x388ab20e2573d171a88108e79d820e98f26c0b84aa8b2f4aa4968dbb818ea322",
        "0x93237c50ba75ee485f4c22adf2f741400bdf8d6a9cc7df7ecae576221665d735",
        "0x8448818bb4ae4562849e949e17ac16e0be16688e156b5cf15e098c627c0056a9",
      ],
    };

    const INVALID_MERKLE_PROOF_REVERT = {
      proof: [
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0xad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb5",
        "0xb4c11951957c6f8f642c4af61cd6b24640fec6dc7fc607ee8206a99e92410d30",
        "0x21ddb9a356815c3fac1026b6dec5df3124afbadb485c9ba5a3e3398a04b7ba85",
        "0xe58769b32a1beaf1ea27375a44095a0d1fb664ce2dd358e7fcbfb78c26a19344",
        "0x0eb01ebfc9ed27500cd4dfc979272d1f0913cc9f66540d7e8005811109e1cf2d",
        "0x887c22bd8750d34016ac3c66b5ff102dacdd73f6b014e710b51e8022af9a1968",
        "0xffd70157e48063fc33c97a050f7f640233bf646cc98d9524c6b92bcf3ab56f83",
        "0x9867cc5f7f196b93bae1e27e6320742445d290f2263827498b54fec539f756af",
        "0xcefad4e508c098b9a7e1d8feb19955fb02ba9675585078710969d3440f5054e0",
        "0xf9dc3e7fe016e050eff260334f18a5d4fe391d82092319f5964f2e2eb7c1c3a5",
        "0xf8b13a49e282f609c317a833fb8d976d11517c571d1221a265d25af778ecf892",
        "0x3490c6ceeb450aecdc82e28293031d10c7d73bf85e57bf041a97360aa2c5d99c",
        "0xc1df82d9c4b87413eae2ef048f94b4d3554cea73d92b0f7af96e0271c691e2bb",
        "0x5c67add7c6caf302256adedf7ab114da0acfe870d449a3a489f781d659e8becc",
        "0xda7bce9f4e8618b6bd2f4132ce798cdc7a60e7e1460a7299e3c6342a579626d2",
        "0x2733e50f526ec2fa19a22b31e8ed50f23cd1fdf94c9154ed3a7609a2f1ff981f",
        "0xe1d3b5c807b281e4683cc6d6315cf95b9ade8641defcb32372f1c126e398ef7a",
        "0x5a2dce0a8a7f68bb74560f8f71837c2c2ebbcbf7fffb42ae1896f13f7c7479a0",
        "0xb46a28b6f55540f89444f63de0378e3d121be09e06cc9ded1c20e65876d36aa0",
        "0xc65e9645644786b620e2dd2ad648ddfcbf4a7e5b1a3a4ecfe7f64667a3f0b7e2",
        "0xf4418588ed35a2458cffeb39b93d26f18d2ab13bdce6aee58e7b99359ec2dfd9",
        "0x5a9c16dc00d6ef18b7933a6f8dc65ccb55667138776f7dea101070dc8796e377",
        "0x4df84f40ae0c8229d0d6069e5c8f39a7c299677a09d367fc7b05e3bc380ee652",
        "0xcdc72595f74c7b1043d0e1ffbab734648c838dfb0527d971b602bc216c9619ef",
        "0x0abf5ac974a1ed57f4050aa510dd9c74f508277b39d7973bb2dfccc5eeb0618d",
        "0xb8cd74046ff337f0a7bf2c8e03e10f642c1886798d71806ab1e888d9e5ee87d0",
        "0x838c5655cb21c6cb83313b5a631175dff4963772cce9108188b34ac87c81c41e",
        "0x662ee4dd2dd7b2bc707961b1e646c4047669dcb6584f0d8d770daf5d7e7deb2e",
        "0x388ab20e2573d171a88108e79d820e98f26c0b84aa8b2f4aa4968dbb818ea322",
        "0x93237c50ba75ee485f4c22adf2f741400bdf8d6a9cc7df7ecae576221665d735",
        "0x8448818bb4ae4562849e949e17ac16e0be16688e156b5cf15e098c627c0056a9",
      ],
      merkleRoot: "0xd1eb21c855a643efa2b5f6e45c6e19784aeca4d4edfed71d16f1a4235a259aa1",
      index: 0,
    };

    const MERKLE_PROOF_FALLBACK = {
      proof: [
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0xad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb5",
        "0xb4c11951957c6f8f642c4af61cd6b24640fec6dc7fc607ee8206a99e92410d30",
        "0x21ddb9a356815c3fac1026b6dec5df3124afbadb485c9ba5a3e3398a04b7ba85",
        "0xe58769b32a1beaf1ea27375a44095a0d1fb664ce2dd358e7fcbfb78c26a19344",
        "0x0eb01ebfc9ed27500cd4dfc979272d1f0913cc9f66540d7e8005811109e1cf2d",
        "0x887c22bd8750d34016ac3c66b5ff102dacdd73f6b014e710b51e8022af9a1968",
        "0xffd70157e48063fc33c97a050f7f640233bf646cc98d9524c6b92bcf3ab56f83",
      ],
      merkleRoot: "0xcb9b5496c90542ac03009b37acf6ef8e8867856e2333e0eb9954290b9ce69272",
      index: 0,
    };

    const MERKLE_PROOF_REENTRY = {
      proof: [
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0xad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb5",
        "0xb4c11951957c6f8f642c4af61cd6b24640fec6dc7fc607ee8206a99e92410d30",
        "0x21ddb9a356815c3fac1026b6dec5df3124afbadb485c9ba5a3e3398a04b7ba85",
        "0xe58769b32a1beaf1ea27375a44095a0d1fb664ce2dd358e7fcbfb78c26a19344",
        "0x0eb01ebfc9ed27500cd4dfc979272d1f0913cc9f66540d7e8005811109e1cf2d",
        "0x887c22bd8750d34016ac3c66b5ff102dacdd73f6b014e710b51e8022af9a1968",
        "0xffd70157e48063fc33c97a050f7f640233bf646cc98d9524c6b92bcf3ab56f83",
      ],
      merkleRoot: "0x494aab847e375519445b672ca9f5b4adac13ceb233c371978a18ab437483521b",
      index: 0,
    };

    it("Should be able to claim a message that was sent", async () => {
      await l1MessageServiceMerkleProof.addL2MerkleRoots(
        [VALID_MERKLE_PROOF.merkleRoot],
        VALID_MERKLE_PROOF.proof.length,
      );

      await expect(
        l1MessageServiceMerkleProof.claimMessageWithProof({
          proof: VALID_MERKLE_PROOF.proof,
          messageNumber: 1,
          leafIndex: VALID_MERKLE_PROOF.index,
          from: admin.address,
          to: admin.address,
          fee: MESSAGE_FEE,
          value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
          feeRecipient: ethers.constants.AddressZero,
          merkleRoot: VALID_MERKLE_PROOF.merkleRoot,
          data: "0x",
        }),
      ).to.not.be.reverted;
    });

    it("Should be able to claim a message and emit a MessageClaimed event", async () => {
      await l1MessageServiceMerkleProof.addL2MerkleRoots(
        [VALID_MERKLE_PROOF.merkleRoot],
        VALID_MERKLE_PROOF.proof.length,
      );

      const messageLeafHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256", "uint256", "uint256", "bytes"],
          [admin.address, admin.address, MESSAGE_FEE, MESSAGE_FEE.add(MESSAGE_VALUE_1ETH), "1", "0x"],
        ),
      );

      await expect(
        l1MessageServiceMerkleProof.claimMessageWithProof({
          proof: VALID_MERKLE_PROOF.proof,
          messageNumber: 1,
          leafIndex: VALID_MERKLE_PROOF.index,
          from: admin.address,
          to: admin.address,
          fee: MESSAGE_FEE,
          value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
          feeRecipient: ethers.constants.AddressZero,
          merkleRoot: VALID_MERKLE_PROOF.merkleRoot,
          data: "0x",
        }),
      )
        .to.emit(l1MessageServiceMerkleProof, "MessageClaimed")
        .withArgs(messageLeafHash);
    });

    it("Should fail to claim when the contract is generally paused", async () => {
      await l1MessageServiceMerkleProof.connect(pauser).pauseByType(GENERAL_PAUSE_TYPE);

      await expect(
        l1MessageServiceMerkleProof.claimMessageWithProof({
          proof: VALID_MERKLE_PROOF.proof,
          messageNumber: 1,
          leafIndex: VALID_MERKLE_PROOF.index,
          from: admin.address,
          to: admin.address,
          fee: MESSAGE_FEE,
          value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
          feeRecipient: ethers.constants.AddressZero,
          merkleRoot: VALID_MERKLE_PROOF.merkleRoot,
          data: "0x",
        }),
      )
        .to.be.revertedWithCustomError(l1MessageService, "IsPaused")
        .withArgs(GENERAL_PAUSE_TYPE);
    });

    it("Should fail when the message has already been claimed", async () => {
      await l1MessageServiceMerkleProof.addL2MerkleRoots(
        [VALID_MERKLE_PROOF.merkleRoot],
        VALID_MERKLE_PROOF.proof.length,
      );

      await l1MessageServiceMerkleProof.claimMessageWithProof({
        proof: VALID_MERKLE_PROOF.proof,
        messageNumber: 1,
        leafIndex: VALID_MERKLE_PROOF.index,
        from: admin.address,
        to: admin.address,
        fee: MESSAGE_FEE,
        value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
        feeRecipient: ethers.constants.AddressZero,
        merkleRoot: VALID_MERKLE_PROOF.merkleRoot,
        data: "0x",
      });

      await expect(
        l1MessageServiceMerkleProof.claimMessageWithProof({
          proof: VALID_MERKLE_PROOF.proof,
          messageNumber: 1,
          leafIndex: VALID_MERKLE_PROOF.index,
          from: admin.address,
          to: admin.address,
          fee: MESSAGE_FEE,
          value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
          feeRecipient: ethers.constants.AddressZero,
          merkleRoot: VALID_MERKLE_PROOF.merkleRoot,
          data: "0x",
        }),
      ).to.be.revertedWithCustomError(l1MessageServiceMerkleProof, "MessageAlreadyClaimed");
    });

    it("Should fail when l2 merkle root does not exist on L1", async () => {
      await expect(
        l1MessageServiceMerkleProof.claimMessageWithProof({
          proof: VALID_MERKLE_PROOF.proof,
          messageNumber: 1,
          leafIndex: VALID_MERKLE_PROOF.index,
          from: admin.address,
          to: admin.address,
          fee: MESSAGE_FEE,
          value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
          feeRecipient: ethers.constants.AddressZero,
          merkleRoot: VALID_MERKLE_PROOF.merkleRoot,
          data: "0x",
        }),
      ).to.be.revertedWithCustomError(l1MessageServiceMerkleProof, "L2MerkleRootDoesNotExist");
    });

    it("Should fail when l2 merkle proof is invalid", async () => {
      await l1MessageServiceMerkleProof.addL2MerkleRoots(
        [VALID_MERKLE_PROOF.merkleRoot],
        VALID_MERKLE_PROOF.proof.length,
      );
      await expect(
        l1MessageServiceMerkleProof.claimMessageWithProof({
          proof: INVALID_MERKLE_PROOF.proof,
          messageNumber: 1,
          leafIndex: VALID_MERKLE_PROOF.index,
          from: admin.address,
          to: admin.address,
          fee: MESSAGE_FEE,
          value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
          feeRecipient: ethers.constants.AddressZero,
          merkleRoot: VALID_MERKLE_PROOF.merkleRoot,
          data: "0x",
        }),
      ).to.be.revertedWithCustomError(l1MessageServiceMerkleProof, "InvalidMerkleProof");
    });

    it("Should fail claiming when the call transaction fails with receive()", async () => {
      await l1MessageServiceMerkleProof.addL2MerkleRoots(
        [INVALID_MERKLE_PROOF_REVERT.merkleRoot],
        INVALID_MERKLE_PROOF_REVERT.proof.length,
      );

      await expect(
        l1MessageServiceMerkleProof.claimMessageWithProof({
          proof: INVALID_MERKLE_PROOF_REVERT.proof,
          messageNumber: 1,
          leafIndex: INVALID_MERKLE_PROOF_REVERT.index,
          from: admin.address,
          to: l1TestRevert.address,
          fee: MESSAGE_FEE,
          value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
          feeRecipient: ethers.constants.AddressZero,
          merkleRoot: INVALID_MERKLE_PROOF_REVERT.merkleRoot,
          data: "0xcd4aed30",
        }),
      ).to.be.reverted;
    });

    it("Should fail claiming when the call transaction fails with empty fallback", async () => {
      await l1MessageServiceMerkleProof.addL2MerkleRoots(
        [MERKLE_PROOF_FALLBACK.merkleRoot],
        MERKLE_PROOF_FALLBACK.proof.length,
      );

      await expect(
        l1MessageServiceMerkleProof.claimMessageWithProof({
          proof: MERKLE_PROOF_FALLBACK.proof,
          messageNumber: 1,
          leafIndex: MERKLE_PROOF_FALLBACK.index,
          from: admin.address,
          to: l1TestRevert.address,
          fee: MESSAGE_FEE,
          value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
          feeRecipient: ethers.constants.AddressZero,
          merkleRoot: MERKLE_PROOF_FALLBACK.merkleRoot,
          data: "0xce398a64",
        }),
      ).to.be.revertedWithCustomError(l1MessageServiceMerkleProof, "MessageSendingFailed");
    });

    it("Should fail on reentry", async () => {
      await l1MessageServiceMerkleProof.addL2MerkleRoots(
        [MERKLE_PROOF_REENTRY.merkleRoot],
        MERKLE_PROOF_REENTRY.proof.length,
      );

      await expect(
        l1MessageServiceMerkleProof.claimMessageWithProof({
          proof: MERKLE_PROOF_REENTRY.proof,
          messageNumber: 1,
          leafIndex: MERKLE_PROOF_REENTRY.index,
          from: admin.address,
          to: l1MessageServiceMerkleProof.address,
          fee: MESSAGE_FEE,
          value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
          feeRecipient: ethers.constants.AddressZero,
          merkleRoot: MERKLE_PROOF_REENTRY.merkleRoot,
          data: "0xaf5696840000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000dc64a140aa3e981100a9beca4e685f962f0cf6c900000000000000000000000000000000000000000000000000b1a2bc2ec500000000000000000000000000000000000000000000000000000e92596fd62900000000000000000000000000000000000000000000000000000000000000000000c817003bf40005bdd4b6e06fd0ed2d01c27a89a4cf6ee67ea585489af54e4a8c000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        }),
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("Should fail when the fee recipient fails errors", async () => {
      await l1MessageServiceMerkleProof.addL2MerkleRoots(
        [VALID_MERKLE_PROOF.merkleRoot],
        VALID_MERKLE_PROOF.proof.length,
      );

      await expect(
        l1MessageServiceMerkleProof.claimMessageWithProof({
          proof: VALID_MERKLE_PROOF.proof,
          messageNumber: 1,
          leafIndex: VALID_MERKLE_PROOF.index,
          from: admin.address,
          to: admin.address,
          fee: MESSAGE_FEE,
          value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
          feeRecipient: l1MessageService.address,
          merkleRoot: VALID_MERKLE_PROOF.merkleRoot,
          data: "0x",
        }),
      )
        .to.be.revertedWithCustomError(l1MessageService, "FeePaymentFailed")
        .withArgs(l1MessageService.address);
    });

    it("Should fail when the merkle depth is different than the proof length", async () => {
      await l1MessageServiceMerkleProof.addL2MerkleRoots(
        [VALID_MERKLE_PROOF.merkleRoot],
        VALID_MERKLE_PROOF.proof.length,
      );

      const merkleDepth = (
        await l1MessageServiceMerkleProof.l2MerkleRootsDepths(VALID_MERKLE_PROOF.merkleRoot)
      ).toNumber();

      await expect(
        l1MessageServiceMerkleProof.claimMessageWithProof({
          proof: VALID_MERKLE_PROOF.proof.slice(0, -1),
          messageNumber: 1,
          leafIndex: VALID_MERKLE_PROOF.index,
          from: admin.address,
          to: admin.address,
          fee: MESSAGE_FEE,
          value: MESSAGE_FEE.add(MESSAGE_VALUE_1ETH),
          feeRecipient: l1MessageService.address,
          merkleRoot: VALID_MERKLE_PROOF.merkleRoot,
          data: "0x",
        }),
      )
        .to.be.revertedWithCustomError(l1MessageServiceMerkleProof, "ProofLengthDifferentThanMerkleDepth")
        .withArgs(merkleDepth, VALID_MERKLE_PROOF.proof.slice(0, -1).length);
    });
  });

  describe("Resetting limits", () => {
    it("Should reset limits as limitSetter", async () => {
      let usedAmount = await l1MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(0);

      await setHashAndClaimMessage(MESSAGE_FEE, MESSAGE_VALUE_1ETH);

      usedAmount = await l1MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(MESSAGE_FEE.add(MESSAGE_VALUE_1ETH));

      await l1MessageService.connect(limitSetter).resetAmountUsedInPeriod();
      usedAmount = await l1MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(0);
    });

    it("Should fail reset limits as non-RATE_LIMIT_SETTER_ROLE", async () => {
      let usedAmount = await l1MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(0);

      await setHashAndClaimMessage(MESSAGE_FEE, MESSAGE_VALUE_1ETH);

      usedAmount = await l1MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(MESSAGE_FEE.add(MESSAGE_VALUE_1ETH));

      await expect(l1MessageService.connect(admin).resetAmountUsedInPeriod()).to.be.revertedWith(
        "AccessControl: account " + admin.address.toLowerCase() + " is missing role " + RATE_LIMIT_SETTER_ROLE,
      );

      usedAmount = await l1MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(MESSAGE_FEE.add(MESSAGE_VALUE_1ETH));
    });
  });

  describe("Pausing contracts", () => {
    it("Should fail general pausing as non-pauser", async () => {
      expect(await l1MessageService.isPaused(GENERAL_PAUSE_TYPE)).to.be.false;

      await expect(l1MessageService.connect(admin).pauseByType(GENERAL_PAUSE_TYPE)).to.be.revertedWith(
        "AccessControl: account " + admin.address.toLowerCase() + " is missing role " + PAUSE_MANAGER_ROLE,
      );

      expect(await l1MessageService.isPaused(GENERAL_PAUSE_TYPE)).to.be.false;
    });

    it("Should pause generally as pause manager", async () => {
      expect(await l1MessageService.isPaused(GENERAL_PAUSE_TYPE)).to.be.false;

      await l1MessageService.connect(pauser).pauseByType(GENERAL_PAUSE_TYPE);

      expect(await l1MessageService.isPaused(GENERAL_PAUSE_TYPE)).to.be.true;
    });

    it("Should fail when to claim the contract is generally paused", async () => {
      await l1MessageService.connect(pauser).pauseByType(GENERAL_PAUSE_TYPE);

      await expect(
        l1MessageService.claimMessage(
          l1MessageService.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          ethers.constants.AddressZero,
          "0x",
          1,
        ),
      )
        .to.be.revertedWithCustomError(l1MessageService, "IsPaused")
        .withArgs(GENERAL_PAUSE_TYPE);
    });

    it("Should fail to claim when the L2 to L1 communication is paused", async () => {
      await l1MessageService.connect(pauser).pauseByType(L2_L1_PAUSE_TYPE);

      await expect(
        l1MessageService.claimMessage(
          l1MessageService.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          ethers.constants.AddressZero,
          "0x",
          1,
        ),
      )
        .to.be.revertedWithCustomError(l1MessageService, "IsPaused")
        .withArgs(L2_L1_PAUSE_TYPE);
    });

    it("Should fail to send if the contract is generally paused", async () => {
      await l1MessageService.connect(pauser).pauseByType(GENERAL_PAUSE_TYPE);

      await expect(
        l1MessageService
          .connect(admin)
          .canSendMessage(notAuthorizedAccount.address, 0, "0x", { value: INITIAL_WITHDRAW_LIMIT }),
      )
        .to.be.revertedWithCustomError(l1MessageService, "IsPaused")
        .withArgs(GENERAL_PAUSE_TYPE);

      const usedAmount = await l1MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(0);
    });

    it("Should fail to send if L1 to L2 communication is paused", async () => {
      await l1MessageService.connect(pauser).pauseByType(L1_L2_PAUSE_TYPE);

      await expect(
        l1MessageService
          .connect(admin)
          .canSendMessage(notAuthorizedAccount.address, 0, "0x", { value: INITIAL_WITHDRAW_LIMIT }),
      )
        .to.be.revertedWithCustomError(l1MessageService, "IsPaused")
        .withArgs(L1_L2_PAUSE_TYPE);

      const usedAmount = await l1MessageService.currentPeriodAmountInWei();
      expect(usedAmount).to.be.equal(0);
    });
  });

  async function setHash(fee: BigNumber, value: BigNumber) {
    const expectedBytes = await encodeSendMessage(
      l1MessageService.address,
      notAuthorizedAccount.address,
      fee,
      value,
      BigNumber.from(1),
      "0x",
    );

    await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));
  }

  async function setHashAndClaimMessage(fee: BigNumber, value: BigNumber) {
    const expectedBytes = await encodeSendMessage(
      l1MessageService.address,
      notAuthorizedAccount.address,
      fee,
      value,
      BigNumber.from(1),
      "0x",
    );

    await l1MessageService.addL2L1MessageHash(ethers.utils.keccak256(expectedBytes));

    await l1MessageService.claimMessage(
      l1MessageService.address,
      notAuthorizedAccount.address,
      fee,
      value,
      postmanAddress.address,
      "0x",
      1,
    );
  }
});
