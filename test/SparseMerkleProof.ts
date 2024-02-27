import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Mimc, SparseMerkleProof } from "../typechain-types";
import merkleProofTestData from "./testData/merkle-proof-data.json";
import { deployFromFactory } from "./utils/deployment";

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
    describe("account proof", () => {
      it("Should return false when the account proof is not correct", async () => {
        const {
          accountProof: {
            proof: { proofRelatedNodes },
          },
        } = merkleProofTestData;

        const stateRoot = "0x21c232d5a976e50550df25f9e87517a77df4dcd85e3462af1ab380bae11b4455";
        const leafIndex = 200;
        const result = await sparseMerkleProof.verifyProof(proofRelatedNodes, leafIndex, stateRoot);

        expect(result).to.be.false;
      });

      it("Should return true when the account proof is correct", async () => {
        const {
          accountProof: {
            proof: { proofRelatedNodes },
            leafIndex,
          },
        } = merkleProofTestData;
        // blockNumber: 3460924;
        const stateRoot = "0x0e1f20b74aeb5103431c6a0fbb7a2fdc0b2cdc38ba2104cfa6229a3606ccd798";

        const result = await sparseMerkleProof.verifyProof(proofRelatedNodes, leafIndex, stateRoot);

        expect(result).to.be.true;
      });
    });

    describe("storage proof", () => {
      it("Should return false when the storage proof is not correct", async () => {
        const {
          storageProofs: [
            {
              proof: { proofRelatedNodes },
            },
          ],
        } = merkleProofTestData;

        const stateRoot = "0x21c232d5a976e50550df25f9e87517a77df4dcd85e3462af1ab380bae11b4455";
        const leafIndex = 200;
        const result = await sparseMerkleProof.verifyProof(proofRelatedNodes, leafIndex, stateRoot);

        expect(result).to.be.false;
      });

      it("Should return true when the storage proof is correct", async () => {
        const {
          storageProofs: [
            {
              proof: { proofRelatedNodes },
              leafIndex,
            },
          ],
        } = merkleProofTestData;
        // blockNumber: 3460924;
        const stateRoot = "0x0bb8293ebdb6a709dcaa06e52831d1ad6054c037a2c70a32d17b71ccd65b53f9";

        const result = await sparseMerkleProof.verifyProof(proofRelatedNodes, leafIndex, stateRoot);

        expect(result).to.be.true;
      });
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
      expect(hVal).to.be.equal("0x0040b41c9882018b27400a081b06ae7267a2336447df05f7e4e44c0d29d74121");
    });
  });

  describe("hashStorageValue", () => {
    it("Should return value hash", async () => {
      const {
        storageProofs: [
          {
            proof: { value },
          },
        ],
      } = merkleProofTestData;
      const hVal = await sparseMerkleProof.hashStorageValue(value);
      expect(hVal).to.be.equal("0x045f00303c14e5eb434ef44b58ecf209715378b062f60b347139f473f6e61a46");
    });
  });

  describe("getLeaf", () => {
    describe("account leaf", () => {
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

        expect(leaf.prev).to.be.equal(2090373);
        expect(leaf.next).to.be.equal(2975408);
        expect(leaf.hKey).to.be.equal("0x09f049109ce672e71c951ca4dc0444f96b81d08df4d875d811760e1f49deaa7d");
        expect(leaf.hValue).to.be.equal("0x0040b41c9882018b27400a081b06ae7267a2336447df05f7e4e44c0d29d74121");
      });
    });

    describe("storage leaf", () => {
      it("Should revert when leaf bytes length < 128", async () => {
        const {
          storageProofs: [
            {
              proof: { proofRelatedNodes },
            },
          ],
        } = merkleProofTestData;

        const wrongLeaftValue = `0x${proofRelatedNodes[proofRelatedNodes.length - 1].slice(4)}`;

        await expect(sparseMerkleProof.getLeaf(wrongLeaftValue))
          .to.revertedWithCustomError(sparseMerkleProof, "WrongBytesLength")
          .withArgs(128, ethers.utils.hexDataLength(wrongLeaftValue));
      });

      it("Should return parsed leaf", async () => {
        const {
          storageProofs: [
            {
              proof: { proofRelatedNodes },
            },
          ],
        } = merkleProofTestData;

        const leaf = await sparseMerkleProof.getLeaf(proofRelatedNodes[proofRelatedNodes.length - 1]);

        expect(leaf.prev).to.be.equal(264883);
        expect(leaf.next).to.be.equal(147462);
        expect(leaf.hKey).to.be.equal("0x0aff320fd77e6145e4e371459658c9cb30ec26baba0558ef57a373a8c75cfc31");
        expect(leaf.hValue).to.be.equal("0x045f00303c14e5eb434ef44b58ecf209715378b062f60b347139f473f6e61a46");
      });
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

      expect(account.nonce).to.be.equal(1);
      expect(account.balance).to.be.equal("993942244765750129749953953");
      expect(account.storageRoot).to.be.equal("0x0bb8293ebdb6a709dcaa06e52831d1ad6054c037a2c70a32d17b71ccd65b53f9");
      expect(account.mimcCodeHash).to.be.equal("0x07febcc933327a6488b2d38ed12b2ec3f8a4ddc8363478764c026171c62aa94b");
      expect(account.keccakCodeHash).to.be.equal("0x6bec2bf64f7e824109f6ed55f77dd7665801d6195e461666ad6a5342a9f6daf5");
      expect(account.codeSize).to.be.equal(2112);
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

      expect(hashedValue).to.be.equal("0x119a4afb7f27c66df406cb692ac3010d924a10a9e6c8d867772c1370a06cbc22");
    });
  });
});
