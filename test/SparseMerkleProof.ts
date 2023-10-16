import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFromFactory } from "./utils/deployment";
import { Mimc, SparseMerkleProof } from "../typechain-types";
import merkleProofTestData from "./testData/merkle-proof-data.json";

describe("SparseMerkleProof", () => {
  let sparseMerkleProof: SparseMerkleProof;

  async function deploySparseMerkleProofFixture() {
    const mimc = (await deployFromFactory("Mimc")) as Mimc;
    const factory = await ethers.getContractFactory("SparseMerkleProof", { libraries: { Mimc: mimc.address } });
    const sparseMerkleProof = await factory.deploy();
    await sparseMerkleProof.deployed();
    return sparseMerkleProof;
  }

  beforeEach(async () => {
    sparseMerkleProof = await loadFixture(deploySparseMerkleProofFixture);
  });

  describe("verifyProof", () => {
    it("Should return false when the proof is not correct", async () => {
      const {
        accountProof: {
          proof: { proofRelatedNodes },
        },
      } = merkleProofTestData;
      // blockNumber: 1495371;
      const stateRoot = "0x21c232d5a976e50550df25f9e87517a77df4dcd85e3462af1ab380bae11b4455";
      const leafIndex = 200;
      const result = await sparseMerkleProof.verifyProof(proofRelatedNodes, leafIndex, stateRoot);

      expect(result).to.be.false;
    });

    it("Should return true when the proof is correct", async () => {
      const {
        accountProof: {
          proof: { proofRelatedNodes },
          leafIndex,
        },
      } = merkleProofTestData;
      // blockNumber: 1495371;
      const stateRoot = "0x21c232d5a976e50550df25f9e87517a77df4dcd85e3462af1ab380bae11b4455";

      const result = await sparseMerkleProof.verifyProof(proofRelatedNodes, leafIndex, stateRoot);

      expect(result).to.be.true;
    });
  });

  describe("hashAccountValue", () => {
    it("Should return value hash", async () => {
      const {
        accountProof: {
          proof: { value },
        },
      } = merkleProofTestData;

      const hVal = await sparseMerkleProof.hashAccountValue(value);
      expect(hVal).to.be.equal("0x0c6b0fe15d74cfaed6a43d9621dec00e0ef0c82ed905156fb73d1ccea11206b5");
    });
  });

  describe("hashStorageValue", () => {
    it("Should return value hash", async () => {
      const hVal = await sparseMerkleProof.hashStorageValue(
        "0x0000000000000000000000002f632b08ece7e9dca0fcff1f91c1d5bc245440eb",
      );
      expect(hVal).to.be.equal("0x2f74ce17a8e4ccbf84d3480aa5346d748d878d7ef670686a4fbfc410f62cf853");
    });
  });

  describe("getLeaf", () => {
    it("Should revert when leaf bytes length < 128", async () => {
      const {
        accountProof: {
          proof: { proofRelatedNodes },
        },
      } = merkleProofTestData;

      const wrongLeaftValue = `0x${proofRelatedNodes[proofRelatedNodes.length - 1].slice(4)}`;

      await expect(sparseMerkleProof.getLeaf(wrongLeaftValue))
        .to.revertedWithCustomError(sparseMerkleProof, "WrongBytesLength")
        .withArgs(128, ethers.utils.hexDataLength(wrongLeaftValue));
    });

    it("Should return parsed leaf", async () => {
      const {
        accountProof: {
          proof: { proofRelatedNodes },
        },
      } = merkleProofTestData;

      const leaf = await sparseMerkleProof.getLeaf(proofRelatedNodes[proofRelatedNodes.length - 1]);

      expect(leaf.prev).to.be.equal(1951783);
      expect(leaf.next).to.be.equal(4237295);
      expect(leaf.hKey).to.be.equal("0x0ca9c4d4b16e27b5052ccf9d2f11ddc49e46bf9bbb270af9cd9e4774e20a9bbe");
      expect(leaf.hValue).to.be.equal("0x0c6b0fe15d74cfaed6a43d9621dec00e0ef0c82ed905156fb73d1ccea11206b5");
    });
  });

  describe("getAccount", () => {
    it("Should revert when account bytes length < 192", async () => {
      const {
        accountProof: {
          proof: { value },
        },
      } = merkleProofTestData;

      const wrongAccountValue = `0x${value.slice(4)}`;

      await expect(sparseMerkleProof.getAccount(wrongAccountValue))
        .to.revertedWithCustomError(sparseMerkleProof, "WrongBytesLength")
        .withArgs(192, ethers.utils.hexDataLength(wrongAccountValue));
    });

    it("Should return parsed leaf", async () => {
      const {
        accountProof: {
          proof: { value },
        },
      } = merkleProofTestData;

      const account = await sparseMerkleProof.getAccount(value);

      expect(account.nonce).to.be.equal(5334);
      expect(account.balance).to.be.equal("985913336575739795");
      expect(account.storageRoot).to.be.equal("0x2e7942bb21022172cbad3ffc38d1c59e998f1ab6ab52feb15345d04bbf859f14");
      expect(account.mimcCodeHash).to.be.equal("0x2c7298fd87d3039ffea208538f6b297b60b373a63792b4cd0654fdc88fd0d6ee");
      expect(account.keccakCodeHash).to.be.equal("0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
      expect(account.codeSize).to.be.equal(0);
    });
  });

  describe("mimcHash", () => {
    it("Should return mimc hash", async () => {
      const {
        accountProof: {
          proof: { value },
        },
      } = merkleProofTestData;

      const hashedValue = await sparseMerkleProof.mimcHash(value);

      expect(hashedValue).to.be.equal("0x066c7a020dfda720cf56305f46b90d2abb3c1e6d7e42023466014e4d6e8a71f2");
    });
  });
});
