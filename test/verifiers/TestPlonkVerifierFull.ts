import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { TestPlonkVerifierFull } from "../../typechain-types";
import { deployFromFactory } from "../utils/deployment";

describe("test plonk", () => {
  let plonkVerifier: TestPlonkVerifierFull;

  async function deployPlonkVerifierFixture() {
    return deployFromFactory("TestPlonkVerifierFull") as Promise<TestPlonkVerifierFull>;
  }

  beforeEach(async () => {
    plonkVerifier = await loadFixture(deployPlonkVerifierFixture);
  });

  describe("test_verifier_go", () => {
    it("Should verify proof successfully", async () => {
      expect(
        await plonkVerifier.test_verifier()
      ).to.not.be.reverted;
    });
  });
});
