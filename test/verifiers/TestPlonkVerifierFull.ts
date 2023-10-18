import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { TestPlonkVerifierFull } from "../../typechain-types";
import { deployFromFactory } from "../utils/deployment";
import { getProverTestData } from "./../utils/helpers";

describe("test plonk", () => {
  let plonkVerifier: TestPlonkVerifierFull;

  const PROOF_MODE = "Full";
  const { proof } = getProverTestData(PROOF_MODE, "output-file.json");

  async function deployPlonkVerifierFixture() {
    return deployFromFactory("TestPlonkVerifierFull") as Promise<TestPlonkVerifierFull>;
  }

  beforeEach(async () => {
    plonkVerifier = await loadFixture(deployPlonkVerifierFixture);
  });

  describe("testVerifier_go", () => {
    it("Should verify proof successfully", async () => {
      expect(
        await plonkVerifier.testVerifier(proof, [
          BigNumber.from("1569407992020056697981973343817321150885915812575179742983266746535250033504"),
        ]),
      ).to.not.be.reverted;
    });
  });
});
