import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Contract } from "ethers";
import { deployFromFactory } from "./utils/deployment";
import { generateKeccak256, generateRandomBytes } from "./utils/helpers";

describe("Utils Library", () => {
  let contract: Contract;

  async function deployTestUtilsFixture() {
    return deployFromFactory("TestUtils");
  }
  beforeEach(async () => {
    contract = await loadFixture(deployTestUtilsFixture);
  });

  describe("efficientKeccak", () => {
    it("Should return the correct keccak hash", async () => {
      const leftValue = generateRandomBytes(32);
      const rightValue = generateRandomBytes(32);
      const solidityKeccakHash = generateKeccak256(["bytes32", "bytes32"], [leftValue, rightValue]);
      expect(await contract.efficientKeccak(leftValue, rightValue)).to.equal(solidityKeccakHash);
    });
  });
});
