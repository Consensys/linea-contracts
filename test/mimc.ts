import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFromFactory } from "./utils/deployment";
import { Mimc } from "../typechain-types";
import mimcTestData from "./testData/mimc-test-data.json";

describe("Mimc", () => {
  let mimc: Mimc;

  async function deployMIMCFixture() {
    return deployFromFactory("Mimc") as Promise<Mimc>;
  }

  beforeEach(async () => {
    mimc = await loadFixture(deployMIMCFixture);
  });

  describe("hash", () => {
    it("Should return mimc hash for each test case", async () => {
      for (const element of mimcTestData) {
        const msgs = ethers.utils.hexConcat(element.in);
        expect(await mimc.hash(msgs)).to.equal(element.out);
      }
    });
  });
});
