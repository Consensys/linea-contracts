import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { TestPlonkVerifier } from "../../typechain-types";
import { deployFromFactory } from "../utils/deployment";
import { getProverTestData } from "../utils/helpers";

describe("Test Plonk Verifier", () => {
  let plonkVerifier: TestPlonkVerifier;

  async function deployPlonkVerifierFixture() {
    return deployFromFactory("TestPlonkVerifier") as Promise<TestPlonkVerifier>;
  }

  beforeEach(async () => {
    plonkVerifier = await loadFixture(deployPlonkVerifierFixture);
  });

  describe("test_verifier_go", () => {
    it("Should succeed", async () => {
      const {
        proof,
        debugData: { finalHash },
      } = getProverTestData("Light", "output-file.json");

      expect(
        await plonkVerifier.test_verifier_go(proof, [BigNumber.from(finalHash)], {
          gasLimit: 500_000,
        }),
      ).to.not.be.reverted;
    });
  });
});
