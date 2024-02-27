import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { TestL2MessageManager } from "../typechain-types";
import {
  DEFAULT_ADMIN_ROLE,
  GENERAL_PAUSE_TYPE,
  HASH_ZERO,
  INBOX_STATUS_CLAIMED,
  INBOX_STATUS_RECEIVED,
  L1_L2_MESSAGE_SETTER_ROLE,
} from "./utils/constants";
import { deployUpgradableFromFactory } from "./utils/deployment";
import { calculateRollingHashFromCollection, generateKeccak256Hash, generateNKeccak256Hashes } from "./utils/helpers";

describe("L2MessageManager", () => {
  let l2MessageManager: TestL2MessageManager;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let admin: SignerWithAddress;
  let pauser: SignerWithAddress;
  let l1l2MessageSetter: SignerWithAddress;
  let notAuthorizedAccount: SignerWithAddress;

  async function deployL2MessageManagerFixture() {
    return deployUpgradableFromFactory("TestL2MessageManager", [
      pauser.address,
      l1l2MessageSetter.address,
    ]) as Promise<TestL2MessageManager>;
  }

  beforeEach(async () => {
    [admin, pauser, l1l2MessageSetter, notAuthorizedAccount] = await ethers.getSigners();
    l2MessageManager = await loadFixture(deployL2MessageManagerFixture);
  });

  describe("Initialization checks", () => {
    it("Deployer has default admin role", async () => {
      expect(await l2MessageManager.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("It should fail when not initializing", async () => {
      await expect(l2MessageManager.tryInitialize(admin.address)).to.be.revertedWith(
        "Initializable: contract is not initializing",
      );
    });
  });

  describe("Add L1->L2 message hashes in 'inboxL1L2MessageStatus'", () => {
    it("Should revert if GENERAL_PAUSE_TYPE is enabled", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 2);
      await l2MessageManager.connect(pauser).pauseByType(GENERAL_PAUSE_TYPE);

      await expect(l2MessageManager.connect(l1l2MessageSetter).addL1L2MessageHashes(messageHashes))
        .to.be.revertedWithCustomError(l2MessageManager, "IsPaused")
        .withArgs(GENERAL_PAUSE_TYPE);
    });

    it("Should revert addL1L2MessageHashes if the caller does not have the role 'L1_L2_MESSAGE_SETTER_ROLE'", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 2);

      await expect(
        l2MessageManager.connect(notAuthorizedAccount).addL1L2MessageHashes(messageHashes),
      ).to.be.revertedWith(
        `AccessControl: account ${notAuthorizedAccount.address.toLowerCase()} is missing role ${L1_L2_MESSAGE_SETTER_ROLE}`,
      );
    });

    it("Should revert if message hashes array length is higher than one hundred", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 101);

      await expect(
        l2MessageManager.connect(l1l2MessageSetter).addL1L2MessageHashes(messageHashes),
      ).to.be.revertedWithCustomError(l2MessageManager, "MessageHashesListLengthHigherThanOneHundred");
    });

    it("Should succeed if message hashes array param is correct", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 100);
      await l2MessageManager.connect(l1l2MessageSetter).addL1L2MessageHashes(messageHashes);
      for (const messageHash of messageHashes) {
        expect(await l2MessageManager.connect(l1l2MessageSetter).inboxL1L2MessageStatus(messageHash)).to.equal(
          INBOX_STATUS_RECEIVED,
        );
      }
    });

    it("Should revert if GENERAL_PAUSE_TYPE is enabled", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 2);
      await l2MessageManager.connect(pauser).pauseByType(GENERAL_PAUSE_TYPE);

      await expect(
        l2MessageManager.connect(l1l2MessageSetter).anchorL1L2MessageHashes(messageHashes, 1, 100, HASH_ZERO),
      )
        .to.be.revertedWithCustomError(l2MessageManager, "IsPaused")
        .withArgs(GENERAL_PAUSE_TYPE);
    });

    it("Should revert anchorL1L2MessageHashes if the caller does not have the role 'L1_L2_MESSAGE_SETTER_ROLE'", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 2);
      await expect(
        l2MessageManager.connect(notAuthorizedAccount).anchorL1L2MessageHashes(messageHashes, 1, 100, HASH_ZERO),
      ).to.be.revertedWith(
        `AccessControl: account ${notAuthorizedAccount.address.toLowerCase()} is missing role ${L1_L2_MESSAGE_SETTER_ROLE}`,
      );
    });

    it("Should update rolling hash and messages emitting events", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 100);
      const expectedRollingHash = calculateRollingHashFromCollection(
        ethers.constants.HashZero,
        messageHashes.slice(0, 100),
      );

      expect(
        await l2MessageManager
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(messageHashes, 1, 100, expectedRollingHash),
      )
        .emit(l2MessageManager, "L1L2MessageHashesAddedToInbox")
        .withArgs(messageHashes)
        .emit(l2MessageManager, "RollingHashUpdated")
        .withArgs(100, expectedRollingHash);

      let mappedRollingHash = await l2MessageManager.l1RollingHashes(100);
      expect(mappedRollingHash).to.equal(expectedRollingHash);

      mappedRollingHash = await l2MessageManager.l1RollingHashes(100);
      expect(mappedRollingHash).to.equal(expectedRollingHash);

      expect(await l2MessageManager.lastAnchoredL1MessageNumber()).to.equal(100);
    });

    it("Should not emit events when a second anchoring is duplicated", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 100);
      const expectedRollingHash = calculateRollingHashFromCollection(
        ethers.constants.HashZero,
        messageHashes.slice(0, 100),
      );

      expect(
        await l2MessageManager
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(messageHashes, 1, 100, expectedRollingHash),
      )
        .emit(l2MessageManager, "L1L2MessageHashesAddedToInbox")
        .withArgs(messageHashes)
        .emit(l2MessageManager, "RollingHashUpdated")
        .withArgs(100, expectedRollingHash);

      let mappedRollingHash = await l2MessageManager.l1RollingHashes(100);
      expect(mappedRollingHash).to.equal(expectedRollingHash);

      mappedRollingHash = await l2MessageManager.l1RollingHashes(100);
      expect(mappedRollingHash).to.equal(expectedRollingHash);

      const transaction = await l2MessageManager
        .connect(l1l2MessageSetter)
        .anchorL1L2MessageHashes(messageHashes, 101, 100, expectedRollingHash);

      const transactionReceipt = await transaction.wait();

      expect(transactionReceipt.logs).to.be.empty;

      expect(await l2MessageManager.lastAnchoredL1MessageNumber()).to.equal(100);
    });

    it("Should update rolling hashes mapping ignoring 1 duplicate", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 100);
      const expectedRollingHash = calculateRollingHashFromCollection(
        ethers.constants.HashZero,
        messageHashes.slice(0, 99),
      );

      // forced duplicate
      messageHashes[99] = messageHashes[98];
      await l2MessageManager
        .connect(l1l2MessageSetter)
        .anchorL1L2MessageHashes(messageHashes, 1, 99, expectedRollingHash);

      let mappedRollingHash = await l2MessageManager.l1RollingHashes(99);
      expect(mappedRollingHash).to.equal(expectedRollingHash);

      mappedRollingHash = await l2MessageManager.l1RollingHashes(100);
      expect(mappedRollingHash).to.equal(ethers.constants.HashZero);

      expect(await l2MessageManager.lastAnchoredL1MessageNumber()).to.equal(99);
    });

    it("Should revert when message hashes array length is higher than 100", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 101);

      await expect(l2MessageManager.connect(l1l2MessageSetter).anchorL1L2MessageHashes(messageHashes, 1, 99, HASH_ZERO))
        .to.revertedWithCustomError(l2MessageManager, "MessageHashesListLengthHigherThanOneHundred")
        .withArgs(101);
    });

    it("Should revert when final rolling hash is zero hash", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 100);

      await expect(
        l2MessageManager.connect(l1l2MessageSetter).anchorL1L2MessageHashes(messageHashes, 1, 99, HASH_ZERO),
      ).to.revertedWithCustomError(l2MessageManager, "FinalRollingHashIsZero");
    });

    it("Should revert the with mistmatched hashes", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 100);
      const badRollingHash = calculateRollingHashFromCollection(ethers.constants.HashZero, messageHashes);

      const foundRollingHash = calculateRollingHashFromCollection(
        ethers.constants.HashZero,
        messageHashes.slice(0, 99),
      );

      // forced duplicate
      messageHashes[99] = messageHashes[98];
      await expect(
        l2MessageManager.connect(l1l2MessageSetter).anchorL1L2MessageHashes(messageHashes, 1, 99, badRollingHash),
      )
        .to.revertedWithCustomError(l2MessageManager, "L1RollingHashSynchronizationWrong")
        .withArgs(badRollingHash, foundRollingHash);
    });

    it("Should revert the with mistmatched counts", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 100);

      const foundRollingHash = calculateRollingHashFromCollection(
        ethers.constants.HashZero,
        messageHashes.slice(0, 99),
      );

      // forced duplicate
      messageHashes[99] = messageHashes[98];
      await expect(
        l2MessageManager.connect(l1l2MessageSetter).anchorL1L2MessageHashes(messageHashes, 1, 100, foundRollingHash),
      )
        .to.revertedWithCustomError(l2MessageManager, "L1MessageNumberSynchronizationWrong")
        .withArgs(100, 99);
    });

    it("Should revert if L1 message number is out of sequence when lastAnchoredL1MessageNumber is higher than zero", async () => {
      await l2MessageManager.setLastAnchoredL1MessageNumber(100);
      const messageHashes = generateNKeccak256Hashes("message", 100);

      const expectedRollingHash = calculateRollingHashFromCollection(
        ethers.constants.HashZero,
        messageHashes.slice(0, 99),
      );

      // forced duplicate
      messageHashes[99] = messageHashes[98];

      await expect(
        l2MessageManager
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(messageHashes, 100, 199, expectedRollingHash),
      )
        .to.be.revertedWithCustomError(l2MessageManager, "L1MessageNumberSynchronizationWrong")
        .withArgs(99, 100);
    });

    it("Should update rolling hashes mapping ignoring 1 duplicate when lastAnchoredL1MessageNumber is higher than zero", async () => {
      await l2MessageManager.setLastAnchoredL1MessageNumber(100);
      const messageHashes = generateNKeccak256Hashes("message", 100);

      const expectedRollingHash = calculateRollingHashFromCollection(
        ethers.constants.HashZero,
        messageHashes.slice(0, 99),
      );

      // forced duplicate
      messageHashes[99] = messageHashes[98];

      await l2MessageManager
        .connect(l1l2MessageSetter)
        .anchorL1L2MessageHashes(messageHashes, 101, 199, expectedRollingHash);

      let mappedRollingHash = await l2MessageManager.l1RollingHashes(199);
      expect(mappedRollingHash).to.equal(expectedRollingHash);

      mappedRollingHash = await l2MessageManager.l1RollingHashes(200);
      expect(mappedRollingHash).to.equal(ethers.constants.HashZero);
    });

    it("Should emit the version lastAnchoredL1MessageNumber switches from 0", async () => {
      await l2MessageManager.setLastAnchoredL1MessageNumber(100);
      const messageHashes = generateNKeccak256Hashes("message", 100);

      const expectedRollingHash = calculateRollingHashFromCollection(
        ethers.constants.HashZero,
        messageHashes.slice(0, 99),
      );

      // forced duplicate
      messageHashes[99] = messageHashes[98];

      expect(
        await l2MessageManager
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(messageHashes, 101, 199, expectedRollingHash),
      )
        .emit(l2MessageManager, "ServiceVersionMigrated")
        .withArgs(2);
    });

    it("Should fail old method post-migration", async () => {
      await l2MessageManager.setLastAnchoredL1MessageNumber(100);
      const messageHashes = generateNKeccak256Hashes("message", 100);

      const expectedRollingHash = calculateRollingHashFromCollection(ethers.constants.HashZero, messageHashes);

      expect(
        await l2MessageManager
          .connect(l1l2MessageSetter)
          .anchorL1L2MessageHashes(messageHashes, 101, 200, expectedRollingHash),
      )
        .emit(l2MessageManager, "ServiceVersionMigrated")
        .withArgs(2);

      await expect(
        l2MessageManager.connect(l1l2MessageSetter).addL1L2MessageHashes(messageHashes),
      ).to.be.revertedWithCustomError(l2MessageManager, "ServiceHasMigratedToRollingHashes");
    });

    it("Should succeed if duplicates hashes exist in the array", async () => {
      const messageHashes = [
        ethers.constants.HashZero,
        ethers.constants.HashZero,
        generateKeccak256Hash("message1"),
        generateKeccak256Hash("message1"),
      ];
      await l2MessageManager.connect(l1l2MessageSetter).addL1L2MessageHashes(messageHashes);
      for (const messageHash of messageHashes) {
        expect(await l2MessageManager.connect(l1l2MessageSetter).inboxL1L2MessageStatus(messageHash)).to.equal(
          INBOX_STATUS_RECEIVED,
        );
      }
    });

    it("Should emit an event 'L1L2MessageHashesAddedToInbox' when succeed", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 50);

      await expect(l2MessageManager.connect(l1l2MessageSetter).addL1L2MessageHashes(messageHashes))
        .to.emit(l2MessageManager, "L1L2MessageHashesAddedToInbox")
        .withArgs(messageHashes);
    });
  });

  describe("Update L1->L2 message status to 'claimed' in 'inboxL1L2MessageStatus'", () => {
    it("Should revert if the message hash has not the status 'received' in 'inboxL1L2MessageStatus' mapping", async () => {
      const messageHash = generateKeccak256Hash("message");
      await expect(l2MessageManager.updateL1L2MessageStatusToClaimed(messageHash)).to.be.revertedWithCustomError(
        l2MessageManager,
        "MessageDoesNotExistOrHasAlreadyBeenClaimed",
      );
    });

    it("Should succeed if message hash has the status 'received' in 'inboxL1L2MessageStatus' mapping", async () => {
      const messageHash = generateKeccak256Hash("message1");
      const messageHashes = generateNKeccak256Hashes("message", 50);

      await l2MessageManager.connect(l1l2MessageSetter).addL1L2MessageHashes(messageHashes);
      await l2MessageManager.updateL1L2MessageStatusToClaimed(messageHash);

      expect(await l2MessageManager.inboxL1L2MessageStatus(messageHash)).to.equal(INBOX_STATUS_CLAIMED);
    });
  });
});
