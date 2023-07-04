import { expect } from "chai";
import { BigNumber } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { TestPlonkVerifier } from "../typechain-types";
import { getProverTestData } from "./utils/helpers";
import { deployFromFactory } from "./utils/deployment";

describe("test plonk", () => {
  let zkEvm: TestPlonkVerifier;

  async function deployZkEvmFixture() {
    return deployFromFactory("TestPlonkVerifier") as Promise<TestPlonkVerifier>;
  }

  beforeEach(async () => {
    zkEvm = await loadFixture(deployZkEvmFixture);
  });

  describe("test_verifier_go", () => {
    it("Should succeed", async () => {
      const {
        proof,
        debugData: { finalHash },
      } = getProverTestData("Light", "output-file.json");

      expect(
        await zkEvm.test_verifier_go(proof, [BigNumber.from(finalHash)], {
          gasLimit: 500_000,
        }),
      ).to.not.be.reverted;
    });
  });
});
