import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { TestL1MessageManager } from "../../../typechain-types";
import {
  INBOX_STATUS_RECEIVED,
  INBOX_STATUS_UNKNOWN,
  OUTBOX_STATUS_RECEIVED,
  OUTBOX_STATUS_SENT,
} from "../../utils/constants";
import { deployFromFactory } from "../../utils/deployment";
import {
  generateKeccak256Hash,
  generateL2MessagingBlocksOffsets,
  generateNKeccak256Hashes,
  generateRandomBytes,
  range,
} from "../../utils/helpers";

describe("L1MessageManager", () => {
  let l1MessageManager: TestL1MessageManager;

  async function deployTestL1MessageManagerFixture(): Promise<TestL1MessageManager> {
    return deployFromFactory("TestL1MessageManager") as Promise<TestL1MessageManager>;
  }

  beforeEach(async () => {
    l1MessageManager = await loadFixture(deployTestL1MessageManagerFixture);
  });

  describe("Add L2->L1 message hash in 'inboxL2L1MessageStatus' mapping", () => {
    it("Should revert if the message hash already exists in 'inboxL2L1MessageStatus' mapping", async () => {
      const messageHash = generateKeccak256Hash("message1");
      await l1MessageManager.addL2L1MessageHash(messageHash);

      await expect(l1MessageManager.addL2L1MessageHash(messageHash))
        .to.be.revertedWithCustomError(l1MessageManager, "MessageAlreadyReceived")
        .withArgs(messageHash);
    });

    it("Should succeed if message hash does not exist in 'inboxL2L1MessageStatus' mapping", async () => {
      const messageHash = generateKeccak256Hash("message1");
      await l1MessageManager.addL2L1MessageHash(messageHash);

      expect(await l1MessageManager.inboxL2L1MessageStatus(messageHash)).to.equal(INBOX_STATUS_RECEIVED);
    });

    it("Should emit an event 'L2L1MessageHashAddedToInbox' when succeed", async () => {
      const messageHash = generateKeccak256Hash("message1");

      await expect(l1MessageManager.addL2L1MessageHash(messageHash))
        .to.emit(l1MessageManager, "L2L1MessageHashAddedToInbox")
        .withArgs(messageHash);
    });
  });

  describe("Update L2->L1 message hash status in 'inboxL2L1MessageStatus' mapping to 'claimed'", () => {
    it("Should revert if the message hash has not the status 'received' in 'inboxL2L1MessageStatus' mapping", async () => {
      const messageHash = generateKeccak256Hash("message1");

      await l1MessageManager.addL2L1MessageHash(messageHash);
      await l1MessageManager.updateL2L1MessageStatusToClaimed(messageHash);

      await expect(l1MessageManager.updateL2L1MessageStatusToClaimed(messageHash)).to.be.revertedWithCustomError(
        l1MessageManager,
        "MessageDoesNotExistOrHasAlreadyBeenClaimed",
      );
    });

    it("Should succeed if message hash has the status 'received' in 'inboxL2L1MessageStatus' mapping", async () => {
      const messageHash = generateKeccak256Hash("message1");

      await l1MessageManager.addL2L1MessageHash(messageHash);
      await l1MessageManager.updateL2L1MessageStatusToClaimed(messageHash);

      expect(await l1MessageManager.inboxL2L1MessageStatus(messageHash)).to.equal(INBOX_STATUS_UNKNOWN);
    });
  });

  describe("Add L1->L2 message hash in 'outboxL1L2MessageStatus' mapping", () => {
    it("Should succeed if the message hash does not exists in 'outboxL1L2MessageStatus' mapping", async () => {
      const messageHash = generateKeccak256Hash("message1");
      await l1MessageManager.addL1L2MessageHash(messageHash);
      expect(await l1MessageManager.outboxL1L2MessageStatus(messageHash)).to.equal(OUTBOX_STATUS_SENT);
    });
  });

  describe("Update L1->L2 message hashes in 'outboxL1L2MessageStatus' mapping to 'received'", () => {
    it("Should revert if one of the message hashes has the status 'unknown'", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 2);

      await expect(l1MessageManager.updateL1L2MessageStatusToReceived(messageHashes))
        .to.be.revertedWithCustomError(l1MessageManager, "L1L2MessageNotSent")
        .withArgs(messageHashes[0]);
    });

    it("Should succeed if the message hash exists in 'outboxL1L2MessageStatus' mapping and has the status 'sent'", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 100);
      for (const messageHash of messageHashes) {
        await l1MessageManager.addL1L2MessageHash(messageHash);
      }

      await l1MessageManager.updateL1L2MessageStatusToReceived(messageHashes);
      for (const messageHash of messageHashes) {
        expect(await l1MessageManager.outboxL1L2MessageStatus(messageHash)).to.equal(OUTBOX_STATUS_RECEIVED);
      }
    });

    it("Should succeed duplicate submit if the message hash exists in 'outboxL1L2MessageStatus' mapping and has the status 'sent'", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 100);
      for (const messageHash of messageHashes) {
        await l1MessageManager.addL1L2MessageHash(messageHash);
      }

      await l1MessageManager.updateL1L2MessageStatusToReceived(messageHashes);
      for (const messageHash of messageHashes) {
        expect(await l1MessageManager.outboxL1L2MessageStatus(messageHash)).to.equal(OUTBOX_STATUS_RECEIVED);
      }

      await expect(l1MessageManager.updateL1L2MessageStatusToReceived(messageHashes)).to.not.be.reverted;
      for (const messageHash of messageHashes) {
        expect(await l1MessageManager.outboxL1L2MessageStatus(messageHash)).to.equal(OUTBOX_STATUS_RECEIVED);
      }
    });

    it("Should emit an event 'L1L2MessagesReceivedOnL2' when succeed", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 2);
      for (const messageHash of messageHashes) {
        await l1MessageManager.addL1L2MessageHash(messageHash);
      }

      await expect(l1MessageManager.updateL1L2MessageStatusToReceived(messageHashes))
        .to.emit(l1MessageManager, "L1L2MessagesReceivedOnL2")
        .withArgs(messageHashes);
    });
  });

  describe("Set L2->L1 message status in '_messageClaimedBitMap' mapping to 'claimed'", () => {
    it("Should failed if message has already been claimed", async () => {
      const messageNumber = 1;
      await l1MessageManager.setL2L1MessageToClaimed(messageNumber);

      await expect(l1MessageManager.setL2L1MessageToClaimed(messageNumber))
        .to.be.revertedWithCustomError(l1MessageManager, "MessageAlreadyClaimed")
        .withArgs(messageNumber);
    });

    it("Should set the message as claimed", async () => {
      const messagesNumber = [1, 2, 3];
      const [firstMessage, secondMessage, thirdMessage] = messagesNumber;

      await Promise.all([
        l1MessageManager.setL2L1MessageToClaimed(firstMessage),
        l1MessageManager.setL2L1MessageToClaimed(secondMessage),
        l1MessageManager.setL2L1MessageToClaimed(thirdMessage),
      ]);

      const messagesStatus = await Promise.all([
        l1MessageManager.isMessageClaimed(firstMessage),
        l1MessageManager.isMessageClaimed(secondMessage),
        l1MessageManager.isMessageClaimed(thirdMessage),
      ]);

      expect(messagesStatus).to.deep.equal([true, true, true]);
    });
  });

  describe("Add L2 merkle root in 'l2MerkleRootsDepths' mapping", () => {
    it("Should revert if the merkle root already exists", async () => {
      const merkleRoot = generateRandomBytes(32);
      const treeDepth = 32;

      await l1MessageManager.addL2MerkleRoots([merkleRoot], treeDepth);
      await expect(l1MessageManager.addL2MerkleRoots([merkleRoot], treeDepth))
        .to.be.revertedWithCustomError(l1MessageManager, "L2MerkleRootAlreadyAnchored")
        .withArgs(merkleRoot);
    });

    it("Should add the new root to contract storage and emit a 'L2MerkleRootAdded' event", async () => {
      const merkleRoot = generateRandomBytes(32);
      const treeDepth = 32;

      await expect(l1MessageManager.addL2MerkleRoots([merkleRoot], treeDepth))
        .to.emit(l1MessageManager, "L2MerkleRootAdded")
        .withArgs(merkleRoot, treeDepth);

      expect(await l1MessageManager.l2MerkleRootsDepths(merkleRoot)).to.not.equal(0);
    });
  });

  describe("Anchor L2 messaging blocks on L1", () => {
    it("Should fail when '_l2MessagingBlocksOffsets' length is not a multiple of 2", async () => {
      const currentL2BlockNumber = ethers.BigNumber.from(10);
      await expect(l1MessageManager.anchorL2MessagingBlocks("0x01", currentL2BlockNumber))
        .to.be.revertedWithCustomError(l1MessageManager, "BytesLengthNotMultipleOfTwo")
        .withArgs(1);
    });

    it("Should not emit events when '_l2MessagingBlocksOffsets' is empty", async () => {
      const currentL2BlockNumber = ethers.BigNumber.from(10);
      await expect(l1MessageManager.anchorL2MessagingBlocks("0x", currentL2BlockNumber)).to.not.emit(
        l1MessageManager,
        "L2MessagingBlockAnchored",
      );
    });

    it("Should anchor L2 messaging blocks on L1 when the input is not an empty array", async () => {
      const currentL2BlockNumber = ethers.BigNumber.from(10_000_000);

      const arr = range(1, 50);
      const l2MessagingBlocks = generateL2MessagingBlocksOffsets(1, 50);

      const transaction = await l1MessageManager.anchorL2MessagingBlocks(l2MessagingBlocks, currentL2BlockNumber);
      const { events } = await transaction.wait();

      expect(events).to.not.be.undefined;

      if (events) {
        const filteredEvents = events.filter((event) => event.event === "L2MessagingBlockAnchored");
        expect(filteredEvents.length).to.equal(50);
        for (let i = 0; i < filteredEvents.length; i++) {
          expect(filteredEvents[i].args?.l2Block).to.deep.equal(currentL2BlockNumber.add(arr[i]));
        }
      }
    });
  });

  describe("Check if L2->L1 message has been claimed on L1 or not", () => {
    it("Should return false if the message has not been claimed", async () => {
      const messageNumber = 1;
      expect(await l1MessageManager.isMessageClaimed(messageNumber)).to.equal(false);
    });

    it("Should return true if the message has been claimed", async () => {
      const messageNumber = 1;
      await l1MessageManager.setL2L1MessageToClaimed(messageNumber);
      expect(await l1MessageManager.isMessageClaimed(messageNumber)).to.equal(true);
    });
  });
});
