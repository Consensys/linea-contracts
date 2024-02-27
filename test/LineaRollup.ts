import { loadFixture, time as networkTime } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { LineaRollup__factory, TestLineaRollup } from "../typechain-types";
import { SubmissionData } from "./utils/types";
import {
  DEFAULT_ADMIN_ROLE,
  HASH_WITHOUT_ZERO_FIRST_BYTE,
  HASH_ZERO,
  INITIAL_WITHDRAW_LIMIT,
  ONE_DAY_IN_SECONDS,
  OPERATOR_ROLE,
  VERY_HIGH_MIGRATION_BLOCK,
  TEST_PUBLIC_VERIFIER_INDEX,
  GENERAL_PAUSE_TYPE,
  PROVING_SYSTEM_PAUSE_TYPE,
  INITIAL_MIGRATION_BLOCK,
  ADDRESS_ZERO,
  VERIFIER_SETTER_ROLE,
} from "./utils/constants";
import { deployUpgradableFromFactory } from "./utils/deployment";
import {
  calculateRollingHash,
  generateRandomBytes,
  generateFinalizationData,
  generateSubmissionData,
  encodeData,
  generateSubmissionDataMultipleProofs,
} from "./utils/helpers";
import firstCompressedDataContent from "./testData/compressedData/blocks-1-46.json";
import secondCompressedDataContent from "./testData/compressedData/blocks-47-81.json";
import aggregatedProof1To155 from "./testData/compressedData/aggregatedProof-1-155.json";

import aggregatedProof1To81 from "./testData/compressedData/multipleProofs/aggregatedProof-1-81.json";
import aggregatedProof82To153 from "./testData/compressedData/multipleProofs/aggregatedProof-82-153.json";

describe("Linea Rollup contract", () => {
  let lineaRollup: TestLineaRollup;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let admin: SignerWithAddress;
  let verifier: string;
  let securityCouncil: SignerWithAddress;
  let operator: SignerWithAddress;
  let nonAuthorizedAccount: SignerWithAddress;

  const parentStateRootHash = generateRandomBytes(32);

  const { compressedData, dataHash, prevShnarf, finalStateRootHash, expectedShnarf, expectedX, expectedY } =
    firstCompressedDataContent;
  const {
    dataHash: secondCompressedDataHash,
    finalStateRootHash: secondNewStateRootHash,
    expectedShnarf: secondExpectedShnarf,
  } = secondCompressedDataContent;

  async function deployLineaRollupFixture() {
    const PlonkVerifierFactory = await ethers.getContractFactory("TestPlonkVerifierForDataAggregation");
    const plonkVerifier = await PlonkVerifierFactory.deploy();
    await plonkVerifier.deployed();

    verifier = plonkVerifier.address;

    const lineaRollup = (await deployUpgradableFromFactory(
      "TestLineaRollup",
      [
        HASH_ZERO,
        0,
        verifier,
        securityCouncil.address,
        [operator.address],
        ONE_DAY_IN_SECONDS,
        INITIAL_WITHDRAW_LIMIT,
        VERY_HIGH_MIGRATION_BLOCK,
      ],
      {
        initializer: "initialize(bytes32,uint256,address,address,address[],uint256,uint256,uint256)",
        unsafeAllow: ["constructor"],
      },
    )) as TestLineaRollup;

    return lineaRollup;
  }

  before(async () => {
    [admin, securityCouncil, operator, nonAuthorizedAccount] = await ethers.getSigners();
  });

  beforeEach(async () => {
    lineaRollup = await loadFixture(deployLineaRollupFixture);
  });

  describe("Fallback/Receive tests", () => {
    it("Should fail to send eth to the lineaRollup contract through the fallback", async () => {
      await expect(admin.sendTransaction({ to: lineaRollup.address, value: INITIAL_WITHDRAW_LIMIT, data: "0x" })).to.be
        .reverted;
    });

    it("Should fail to send eth to the lineaRollup contract through the receive function", async () => {
      await expect(admin.sendTransaction({ to: lineaRollup.address, value: INITIAL_WITHDRAW_LIMIT, data: "0x1234" })).to
        .be.reverted;
    });
  });

  describe("Initialisation", () => {
    const lineaRollupInterface = LineaRollup__factory.createInterface();

    it("Should revert if verifier address is zero address ", async () => {
      await expect(
        deployUpgradableFromFactory(
          "LineaRollup",
          [
            parentStateRootHash,
            INITIAL_MIGRATION_BLOCK,
            ADDRESS_ZERO,
            securityCouncil.address,
            [operator.address],
            ONE_DAY_IN_SECONDS,
            INITIAL_WITHDRAW_LIMIT,
            VERY_HIGH_MIGRATION_BLOCK,
          ],
          {
            initializer: "initialize(bytes32,uint256,address,address,address[],uint256,uint256,uint256)",
            unsafeAllow: ["constructor"],
          },
        ),
      ).to.be.revertedWithCustomError({ interface: lineaRollupInterface }, "ZeroAddressNotAllowed");
    });

    it("Should set the initial block number ", async () => {
      const lineaRollup = await deployUpgradableFromFactory(
        "TestZkEvmV1",
        [
          parentStateRootHash,
          12345,
          verifier,
          securityCouncil.address,
          [operator.address],
          ONE_DAY_IN_SECONDS,
          INITIAL_WITHDRAW_LIMIT,
          VERY_HIGH_MIGRATION_BLOCK,
        ],
        {
          initializer: "initialize(bytes32,uint256,address,address,address[],uint256,uint256,uint256)",
          unsafeAllow: ["constructor"],
        },
      );

      expect(await lineaRollup.currentL2BlockNumber()).to.be.equal(12345);
    });

    it("Should revert if an operator address is zero address ", async () => {
      await expect(
        deployUpgradableFromFactory(
          "TestLineaRollup",
          [
            parentStateRootHash,
            INITIAL_MIGRATION_BLOCK,
            verifier,
            securityCouncil.address,
            [ADDRESS_ZERO],
            ONE_DAY_IN_SECONDS,
            INITIAL_WITHDRAW_LIMIT,
            VERY_HIGH_MIGRATION_BLOCK,
          ],
          {
            initializer: "initialize(bytes32,uint256,address,address,address[],uint256,uint256,uint256)",
            unsafeAllow: ["constructor"],
          },
        ),
      ).to.be.revertedWithCustomError({ interface: lineaRollupInterface }, "ZeroAddressNotAllowed");
    });

    it("Should store verifier address in storage ", async () => {
      lineaRollup = await loadFixture(deployLineaRollupFixture);
      expect(await lineaRollup.verifiers(0)).to.be.equal(verifier);
    });

    it("Should assign the OPERATOR_ROLE to operator addresses", async () => {
      lineaRollup = await loadFixture(deployLineaRollupFixture);
      expect(await lineaRollup.hasRole(OPERATOR_ROLE, operator.address)).to.be.true;
    });

    it("Should assign the VERIFIER_SETTER_ROLE to operator addresses", async () => {
      lineaRollup = await loadFixture(deployLineaRollupFixture);
      expect(await lineaRollup.hasRole(VERIFIER_SETTER_ROLE, securityCouncil.address)).to.be.true;
    });

    it("Should store the startingRootHash in storage for the first block number", async () => {
      const lineaRollup = await deployUpgradableFromFactory(
        "LineaRollup",
        [
          parentStateRootHash,
          INITIAL_MIGRATION_BLOCK,
          verifier,
          securityCouncil.address,
          [operator.address],
          ONE_DAY_IN_SECONDS,
          INITIAL_WITHDRAW_LIMIT,
          VERY_HIGH_MIGRATION_BLOCK,
        ],
        {
          initializer: "initialize(bytes32,uint256,address,address,address[],uint256,uint256,uint256)",
          unsafeAllow: ["constructor"],
        },
      );

      expect(await lineaRollup.stateRootHashes(INITIAL_MIGRATION_BLOCK)).to.be.equal(parentStateRootHash);
    });

    it("Should revert if the initialize function is called a second time", async () => {
      lineaRollup = await loadFixture(deployLineaRollupFixture);
      await expect(
        lineaRollup.initialize(
          parentStateRootHash,
          INITIAL_MIGRATION_BLOCK,
          verifier,
          securityCouncil.address,
          [operator.address],
          ONE_DAY_IN_SECONDS,
          INITIAL_WITHDRAW_LIMIT,
          VERY_HIGH_MIGRATION_BLOCK,
        ),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("Data submission tests", () => {
    beforeEach(async () => {
      await lineaRollup.setLastFinalizedBlock(0);
      await lineaRollup.setupParentDataHash(dataHash, HASH_ZERO);
      await lineaRollup.setupParentDataShnarf(HASH_ZERO, prevShnarf);
    });

    const DATA_ONE = generateSubmissionData(0, 1);
    const SECOND_DATA_ONE = generateSubmissionData(1, 2);

    const DATA_THREE = generateSubmissionData(0, 2);
    DATA_THREE[1].parentStateRootHash = generateRandomBytes(32);

    it("Fails when the compressed data is empty", async () => {
      const [submissionData] = generateSubmissionData(0, 1);
      submissionData.compressedData = "0x";

      await expect(
        lineaRollup.connect(operator).submitData(submissionData, { gasLimit: 30_000_000 }),
      ).to.be.revertedWithCustomError(lineaRollup, "EmptySubmissionData");
    });

    it("Should succesfully submit 1 compressed data chunk setting values", async () => {
      const [submissionData] = generateSubmissionData(0, 1);
      await expect(lineaRollup.connect(operator).submitData(submissionData, { gasLimit: 30_000_000 })).to.not.be
        .reverted;

      const foundStateRoot = await lineaRollup.dataFinalStateRootHashes(dataHash);
      expect(foundStateRoot).to.be.equal(finalStateRootHash);

      const foundShnarf = await lineaRollup.dataShnarfHashes(dataHash);
      expect(foundShnarf).to.be.equal(expectedShnarf);
    });

    it("Should succesfully submit 2 compressed data chunks in two transactions", async () => {
      const [firstSubmissionData, secondSubmissionData] = generateSubmissionData(0, 2);
      await expect(lineaRollup.connect(operator).submitData(firstSubmissionData, { gasLimit: 30_000_000 })).to.not.be
        .reverted;
      await expect(lineaRollup.connect(operator).submitData(secondSubmissionData, { gasLimit: 30_000_000 })).to.not.be
        .reverted;

      let foundStateRoot = await lineaRollup.dataFinalStateRootHashes(dataHash);
      expect(foundStateRoot).to.be.equal(finalStateRootHash);

      foundStateRoot = await lineaRollup.dataFinalStateRootHashes(secondCompressedDataHash);
      expect(foundStateRoot).to.be.equal(secondNewStateRootHash);

      let foundShnarf = await lineaRollup.dataShnarfHashes(dataHash);
      expect(foundShnarf).to.be.equal(expectedShnarf);

      foundShnarf = await lineaRollup.dataShnarfHashes(secondCompressedDataHash);
      expect(foundShnarf).to.be.equal(secondExpectedShnarf);
    });

    it("Should emit an event while submitting 1 compressed data chunk", async () => {
      const [firstSubmissionData] = generateSubmissionData(0, 1);

      await expect(lineaRollup.connect(operator).submitData(firstSubmissionData, { gasLimit: 30_000_000 }))
        .to.emit(lineaRollup, "DataSubmitted")
        .withArgs(dataHash, 1, 46);
    });

    it("Should fail if the final state root hash is empty", async () => {
      const [firstSubmissionData] = generateSubmissionData(0, 1);

      firstSubmissionData.finalStateRootHash = HASH_ZERO;

      await expect(
        lineaRollup.connect(operator).submitData(firstSubmissionData, { gasLimit: 30_000_000 }),
      ).to.be.revertedWithCustomError(lineaRollup, "FinalBlockStateEqualsZeroHash");
    });

    it("Should fail if the block numbers are out of sequence", async () => {
      const [firstSubmissionData, secondSubmissionData] = generateSubmissionData(0, 2);
      await expect(lineaRollup.connect(operator).submitData(firstSubmissionData, { gasLimit: 30_000_000 })).to.not.be
        .reverted;

      const expectedFirstBlock = secondSubmissionData.firstBlockInData;
      secondSubmissionData.firstBlockInData = secondSubmissionData.firstBlockInData.add(1);

      await expect(lineaRollup.connect(operator).submitData(secondSubmissionData, { gasLimit: 30_000_000 }))
        .to.be.revertedWithCustomError(lineaRollup, "DataStartingBlockDoesNotMatch")
        .withArgs(expectedFirstBlock, secondSubmissionData.firstBlockInData);
    });

    it("Should fail if the previous parent exists but has an empty shnarf", async () => {
      const [firstSubmissionData, secondSubmissionData] = generateSubmissionData(0, 2);
      await expect(lineaRollup.connect(operator).submitData(firstSubmissionData, { gasLimit: 30_000_000 })).to.not.be
        .reverted;

      await lineaRollup.setupParentDataShnarf(secondSubmissionData.dataParentHash, HASH_ZERO);

      await expect(
        lineaRollup.connect(operator).submitData(secondSubmissionData, { gasLimit: 30_000_000 }),
      ).to.be.revertedWithCustomError(lineaRollup, "DataParentHasEmptyShnarf");
    });

    it("Should fail to submit 2nd compressed data with parent giving mismatched state root", async () => {
      const [firstDataOutOfSync, secondDataOutOfSync] = generateSubmissionData(0, 2);
      secondDataOutOfSync.dataParentHash = generateRandomBytes(32);

      await expect(lineaRollup.connect(operator).submitData(firstDataOutOfSync, { gasLimit: 30_000_000 })).to.not.be
        .reverted;

      await expect(lineaRollup.connect(operator).submitData(secondDataOutOfSync, { gasLimit: 30_000_000 }))
        .to.be.revertedWithCustomError(lineaRollup, "StateRootHashInvalid")
        .withArgs(HASH_ZERO, finalStateRootHash);
    });

    it("Should revert if the caller does not have the OPERATOR_ROLE", async () => {
      await expect(
        lineaRollup.connect(nonAuthorizedAccount).submitData(DATA_ONE[0], { gasLimit: 30_000_000 }),
      ).to.be.revertedWith(
        `AccessControl: account ${nonAuthorizedAccount.address.toLowerCase()} is missing role ${OPERATOR_ROLE}`,
      );
    });

    it("Should revert if GENERAL_PAUSE_TYPE is enabled", async () => {
      await lineaRollup.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);
      await expect(lineaRollup.connect(operator).submitData(DATA_ONE[0], { gasLimit: 30_000_000 }))
        .to.be.revertedWithCustomError(lineaRollup, "IsPaused")
        .withArgs(GENERAL_PAUSE_TYPE);
    });

    it("Should revert if PROVING_SYSTEM_PAUSE_TYPE is enabled", async () => {
      await lineaRollup.connect(securityCouncil).pauseByType(PROVING_SYSTEM_PAUSE_TYPE);
      await expect(lineaRollup.connect(operator).submitData(DATA_ONE[0], { gasLimit: 30_000_000 }))
        .to.be.revertedWithCustomError(lineaRollup, "IsPaused")
        .withArgs(PROVING_SYSTEM_PAUSE_TYPE);
    });

    it("Should revert with FirstBlockLessThanOrEqualToLastFinalizedBlock when submitting data with firstBlockInData less than currentL2BlockNumber", async () => {
      await lineaRollup.setLastFinalizedBlock(1_000_000);

      const submissionData: SubmissionData = DATA_ONE[0];

      await expect(lineaRollup.connect(operator).submitData(submissionData, { gasLimit: 30_000_000 }))
        .to.be.revertedWithCustomError(lineaRollup, "FirstBlockLessThanOrEqualToLastFinalizedBlock")
        .withArgs(submissionData.firstBlockInData, 1000000);
    });

    it("Should revert with FirstBlockGreaterThanFinalBlock when submitting data with firstBlockInData greater than finalBlockInData", async () => {
      const submissionData: SubmissionData = {
        ...DATA_ONE[0],
        firstBlockInData: DATA_ONE[0].firstBlockInData.add(10),
        finalBlockInData: DATA_ONE[0].firstBlockInData.add(9),
      };

      await expect(lineaRollup.connect(operator).submitData(submissionData, { gasLimit: 30_000_000 }))
        .to.be.revertedWithCustomError(lineaRollup, "FirstBlockGreaterThanFinalBlock")
        .withArgs(submissionData.firstBlockInData, submissionData.finalBlockInData);
    });

    it("Should revert with DataAlreadySubmitted when submitting same compressed data twice in 2 separate transactions", async () => {
      await lineaRollup.connect(operator).submitData(DATA_ONE[0], { gasLimit: 30_000_000 });
      await expect(
        lineaRollup.connect(operator).submitData(DATA_ONE[0], { gasLimit: 30_000_000 }),
      ).to.be.revertedWithCustomError(lineaRollup, "DataAlreadySubmitted");
    });

    it("Should revert with StateRootHashInvalid when verifying last stored dataStateRootHash matches parent dataStateRootHash in calldata", async () => {
      await lineaRollup.connect(operator).submitData(DATA_ONE[0], { gasLimit: 30_000_000 });
      await expect(
        lineaRollup.connect(operator).submitData(SECOND_DATA_ONE[0], { gasLimit: 30_000_000 }),
      ).to.be.revertedWithCustomError(lineaRollup, "StateRootHashInvalid");
    });
  });

  describe("Blocks finalization without proof", () => {
    const messageHash = generateRandomBytes(32);

    beforeEach(async () => {
      await lineaRollup.addRollingHash(10, messageHash);
      await lineaRollup.setLastFinalizedBlock(0);
    });

    describe("With and without submission data", () => {
      it("Should revert if caller does not the role 'DEFAULT_ADMIN_ROLE'", async () => {
        const finalizationData = await generateFinalizationData();

        await expect(
          lineaRollup.connect(operator).finalizeCompressedBlocksWithoutProof(finalizationData),
        ).to.be.revertedWith(
          "AccessControl: account " + operator.address.toLowerCase() + " is missing role " + DEFAULT_ADMIN_ROLE,
        );
      });

      it("Should revert if GENERAL_PAUSE_TYPE is enabled", async () => {
        const finalizationData = await generateFinalizationData({ dataHashes: [] });

        await lineaRollup.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);
        await expect(lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData))
          .to.be.revertedWithCustomError(lineaRollup, "IsPaused")
          .withArgs(GENERAL_PAUSE_TYPE);
      });

      it("Should revert if finalization data hashes are empty", async () => {
        const finalizationData = await generateFinalizationData({ dataHashes: [] });

        // finalization block is set to 0 and the hash is zero - the test is to perform other validations
        finalizationData.parentStateRootHash = HASH_ZERO;

        await expect(
          lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData),
        ).to.be.revertedWithCustomError(lineaRollup, "FinalizationDataMissing");
      });

      it("Should revert if _finalizationData.finalBlockNumber is less than or equal to currentL2BlockNumber", async () => {
        await lineaRollup.setLastFinalizedBlock(10_000_000);

        const finalizationData = await generateFinalizationData({ finalBlockNumber: BigNumber.from(10) });

        // finalization block is set to 0 and the hash is zero - the test is to perform other validations
        finalizationData.parentStateRootHash = HASH_ZERO;

        await expect(lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData))
          .to.be.revertedWithCustomError(lineaRollup, "FinalBlockNumberLessThanOrEqualToLastFinalizedBlock")
          .withArgs(finalizationData.finalBlockNumber, 10_000_000);
      });

      it("Should revert if l1 message number == 0 and l1 rolling hash is not empty", async () => {
        const finalizationData = await generateFinalizationData({
          l1RollingHashMessageNumber: BigNumber.from(0),
        });

        // finalization block is set to 0 and the hash is zero - the test is to perform other validations
        finalizationData.parentStateRootHash = HASH_ZERO;

        await expect(lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData))
          .to.be.revertedWithCustomError(lineaRollup, "MissingMessageNumberForRollingHash")
          .withArgs(finalizationData.l1RollingHash);
      });

      it("Should revert if l1 message number != 0 and l1 rolling hash is empty", async () => {
        const finalizationData = await generateFinalizationData({ l1RollingHash: HASH_ZERO });

        // finalization block is set to 0 and the hash is zero - the test is to perform other validations
        finalizationData.parentStateRootHash = HASH_ZERO;

        await expect(lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData))
          .to.be.revertedWithCustomError(lineaRollup, "MissingRollingHashForMessageNumber")
          .withArgs(finalizationData.l1RollingHashMessageNumber);
      });

      it("Should revert if l1RollingHash does not exist on L1", async () => {
        const finalizationData = await generateFinalizationData();

        // finalization block is set to 0 and the hash is zero - the test is to perform other validations
        finalizationData.parentStateRootHash = HASH_ZERO;

        await expect(lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData))
          .to.be.revertedWithCustomError(lineaRollup, "L1RollingHashDoesNotExistOnL1")
          .withArgs(finalizationData.l1RollingHashMessageNumber, finalizationData.l1RollingHash);
      });

      it("Should revert if timestamps are not in sequence", async () => {
        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: BigNumber.from(10),
        });

        // finalization block is set to 0 and the hash is zero - the test is to perform other validations
        finalizationData.parentStateRootHash = HASH_ZERO;

        await expect(lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData))
          .to.be.revertedWithCustomError(lineaRollup, "TimestampsNotInSequence")
          .withArgs(0, finalizationData.lastFinalizedTimestamp);
      });

      it("Should revert if finalizationData.finalTimestamp is greater than the block.timestamp", async () => {
        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: BigNumber.from(10),
          lastFinalizedTimestamp: BigNumber.from(0),
          finalTimestamp: new Date(new Date().setHours(new Date().getHours() + 2)).getTime(),
        });

        // finalization block is set to 0 and the hash is zero - the test is to perform other validations
        finalizationData.parentStateRootHash = HASH_ZERO;

        await expect(lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData))
          .to.be.revertedWithCustomError(lineaRollup, "FinalizationInTheFuture")
          .withArgs(finalizationData.finalTimestamp, (await networkTime.latest()) + 1);
      });

      it("Should revert if the parent hash of the first dataHash does not match finalizationData.dataParentHash", async () => {
        const [submissionDataBeforeFinalization] = generateSubmissionData(0, 1);
        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization, { gasLimit: 30_000_000 });

        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: BigNumber.from(10),
          lastFinalizedTimestamp: BigNumber.from(0),
        });

        // finalization block is set to 0 and the hash is zero - the test is to perform other validations
        finalizationData.parentStateRootHash = HASH_ZERO;

        await expect(lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData))
          .to.be.revertedWithCustomError(lineaRollup, "ParentHashesDoesNotMatch")
          .withArgs(HASH_ZERO, finalizationData.dataParentHash);
      });

      it("Should revert if data hashes are not in sequence", async () => {
        const submissionDataBeforeFinalization = generateSubmissionData(0, 2);
        await lineaRollup.setupParentDataHash(dataHash, HASH_ZERO);
        await lineaRollup.setupParentDataShnarf(HASH_ZERO, prevShnarf);

        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[0], { gasLimit: 30_000_000 });
        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[1], { gasLimit: 30_000_000 });

        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: BigNumber.from(10),
          lastFinalizedTimestamp: BigNumber.from(0),
          dataParentHash: HASH_ZERO,
          parentStateRootHash: HASH_ZERO,
          finalBlockNumber: submissionDataBeforeFinalization[1].finalBlockInData,
          dataHashes: submissionDataBeforeFinalization.map((data, index) => {
            let dataToHash = data.compressedData;
            if (index === 0) {
              dataToHash = generateRandomBytes(10_000);
            }
            return ethers.utils.keccak256(dataToHash);
          }),
        });

        await expect(lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData))
          .to.be.revertedWithCustomError(lineaRollup, "DataHashesNotInSequence")
          .withArgs(
            finalizationData.dataHashes[0],
            ethers.utils.keccak256(submissionDataBeforeFinalization[0].compressedData),
          );
      });
    });

    describe("Without submission data", () => {
      beforeEach(async () => {
        await lineaRollup.setLastFinalizedBlock(0);
        await lineaRollup.setupParentDataHash(dataHash, HASH_ZERO);
        await lineaRollup.setupParentDataShnarf(HASH_ZERO, prevShnarf);
      });

      it("Should revert with if the final block state equals the zero hash", async () => {
        const submissionDataBeforeFinalization = generateSubmissionData(0, 2);
        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[0], { gasLimit: 30_000_000 });
        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[1], { gasLimit: 30_000_000 });

        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: BigNumber.from(10),
          lastFinalizedTimestamp: BigNumber.from(0),
          dataParentHash: HASH_ZERO,
          parentStateRootHash: HASH_ZERO,
          finalBlockNumber: submissionDataBeforeFinalization[1].finalBlockInData,
          dataHashes: submissionDataBeforeFinalization.map((data, index, arr) => {
            if (index == arr.length - 1) {
              return generateRandomBytes(32);
            }
            return ethers.utils.keccak256(data.compressedData);
          }),
        });

        await expect(
          lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData),
        ).to.be.revertedWithCustomError(lineaRollup, "FinalBlockStateEqualsZeroHash");
      });

      it("Should successfully finalize blocks and emit DataFinalized event", async () => {
        const submissionDataBeforeFinalization = generateSubmissionData(0, 2);
        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[0], { gasLimit: 30_000_000 });
        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[1], { gasLimit: 30_000_000 });

        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: BigNumber.from(10),
          lastFinalizedTimestamp: BigNumber.from(0),
          dataParentHash: HASH_ZERO,
          parentStateRootHash: HASH_ZERO,
          finalBlockNumber: submissionDataBeforeFinalization[1].finalBlockInData,
          dataHashes: submissionDataBeforeFinalization.map((data) => ethers.utils.keccak256(data.compressedData)),
        });

        await expect(lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData))
          .to.emit(lineaRollup, "DataFinalized")
          .withArgs(
            finalizationData.finalBlockNumber,
            finalizationData.parentStateRootHash,
            await lineaRollup.dataFinalStateRootHashes(finalizationData.dataHashes.slice(-1)[0]),
            false,
          );
      });

      it("Should fail if starting block is out of sequence", async () => {
        const submissionDataBeforeFinalization = generateSubmissionData(0, 2);

        submissionDataBeforeFinalization[0].firstBlockInData = BigNumber.from(41);

        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[0], { gasLimit: 30_000_000 });
        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[1], { gasLimit: 30_000_000 });

        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: BigNumber.from(10),
          lastFinalizedTimestamp: BigNumber.from(0),
          dataParentHash: HASH_ZERO,
          parentStateRootHash: HASH_ZERO,
          finalBlockNumber: submissionDataBeforeFinalization[1].finalBlockInData,
          dataHashes: submissionDataBeforeFinalization.map((data) => ethers.utils.keccak256(data.compressedData)),
        });

        await expect(lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData))
          .to.be.revertedWithCustomError(lineaRollup, "DataStartingBlockDoesNotMatch")
          .withArgs(1, 41);
      });

      it("Should fail if final block is mismatched", async () => {
        const submissionDataBeforeFinalization = generateSubmissionData(0, 2);

        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[0], { gasLimit: 30_000_000 });
        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[1], { gasLimit: 30_000_000 });

        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: BigNumber.from(10),
          lastFinalizedTimestamp: BigNumber.from(0),
          dataParentHash: HASH_ZERO,
          parentStateRootHash: HASH_ZERO,
          finalBlockNumber: BigNumber.from(1000000),
          dataHashes: submissionDataBeforeFinalization.map((data) => ethers.utils.keccak256(data.compressedData)),
        });

        await expect(lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData))
          .to.be.revertedWithCustomError(lineaRollup, "DataEndingBlockDoesNotMatch")
          .withArgs(81, 1000000);
      });

      it("Should successfully finalize blocks and store the last state root hash, the final timestamp, the final block number", async () => {
        const submissionDataBeforeFinalization = generateSubmissionData(0, 2);
        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[0], { gasLimit: 30_000_000 });
        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[1], { gasLimit: 30_000_000 });

        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: BigNumber.from(10),
          lastFinalizedTimestamp: BigNumber.from(0),
          dataParentHash: HASH_ZERO,
          parentStateRootHash: HASH_ZERO,
          finalBlockNumber: submissionDataBeforeFinalization[1].finalBlockInData,
          dataHashes: submissionDataBeforeFinalization.map((data) => ethers.utils.keccak256(data.compressedData)),
        });

        expect(await lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData)).to.not
          .be.reverted;

        const [finalStateRootHash, lastFinalizedBlockTimestamp, lastFinalizedBlockNumber] = await Promise.all([
          lineaRollup.stateRootHashes(finalizationData.finalBlockNumber),
          lineaRollup.currentTimestamp(),
          lineaRollup.currentL2BlockNumber(),
        ]);

        expect(finalStateRootHash).to.equal(
          await lineaRollup.dataFinalStateRootHashes(finalizationData.dataHashes.slice(-1)[0]),
        );
        expect(lastFinalizedBlockTimestamp).to.equal(finalizationData.finalTimestamp);
        expect(lastFinalizedBlockNumber).to.equal(finalizationData.finalBlockNumber);
      });

      it("Should successfully finalize blocks and anchor L2 merkle root, emit an event for each L2 block containing L2->L1 messages", async () => {
        const submissionDataBeforeFinalization = generateSubmissionData(0, 2);
        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[0], { gasLimit: 30_000_000 });
        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[1], { gasLimit: 30_000_000 });

        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: BigNumber.from(10),
          lastFinalizedTimestamp: BigNumber.from(0),
          dataParentHash: HASH_ZERO,
          parentStateRootHash: HASH_ZERO,
          finalBlockNumber: submissionDataBeforeFinalization[1].finalBlockInData,
          dataHashes: submissionDataBeforeFinalization.map((data) => ethers.utils.keccak256(data.compressedData)),
        });

        const currentL2BlockNumber = await lineaRollup.currentL2BlockNumber();

        const tx = await lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData);
        const { events } = await tx.wait();

        if (events) {
          const filteredEvents = events.filter((event) => event.event === "L2MessagingBlockAnchored");
          expect(filteredEvents.length).to.equal(1);

          for (let i = 0; i < filteredEvents.length; i++) {
            expect(filteredEvents[i].args?.l2Block).to.deep.equal(
              currentL2BlockNumber.add(`0x${finalizationData.l2MessagingBlocksOffsets.slice(i * 4 + 2, i * 4 + 6)}`),
            );
          }
        }
        for (let i = 0; i < finalizationData.l2MerkleRoots.length; i++) {
          const l2MerkleRootTreeDepth = await lineaRollup.l2MerkleRootsDepths(finalizationData.l2MerkleRoots[i]);
          expect(l2MerkleRootTreeDepth).to.equal(finalizationData.l2MerkleTreesDepth);
        }
      });

      it("Should successfully finalize blocks when we submit data1 and data2 but only finalizing data1", async () => {
        const submissionDataBeforeFinalization = generateSubmissionData(0, 2);
        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[0], { gasLimit: 30_000_000 });
        await lineaRollup.connect(operator).submitData(submissionDataBeforeFinalization[1], { gasLimit: 30_000_000 });

        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: BigNumber.from(10),
          lastFinalizedTimestamp: BigNumber.from(0),
          dataParentHash: HASH_ZERO,
          parentStateRootHash: HASH_ZERO,
          finalBlockNumber: submissionDataBeforeFinalization[0].finalBlockInData,
          dataHashes: submissionDataBeforeFinalization
            .slice(0, 1)
            .map((data) => ethers.utils.keccak256(data.compressedData)),
        });

        await expect(lineaRollup.connect(securityCouncil).finalizeCompressedBlocksWithoutProof(finalizationData))
          .to.emit(lineaRollup, "DataFinalized")
          .withArgs(
            finalizationData.finalBlockNumber,
            finalizationData.parentStateRootHash,
            await lineaRollup.dataFinalStateRootHashes(finalizationData.dataHashes.slice(-1)[0]),
            false,
          );
      });
    });
  });

  describe("Compressed data finalization with proof", () => {
    beforeEach(async () => {
      await lineaRollup.setupParentDataShnarf(HASH_ZERO, prevShnarf);
    });

    it("Should revert if the caller does not have the OPERATOR_ROLE", async () => {
      const finalizationData = await generateFinalizationData();

      await expect(
        lineaRollup
          .connect(nonAuthorizedAccount)
          .finalizeCompressedBlocksWithProof(
            aggregatedProof1To155.aggregatedProof,
            TEST_PUBLIC_VERIFIER_INDEX,
            finalizationData,
          ),
      ).to.be.revertedWith(
        `AccessControl: account ${nonAuthorizedAccount.address.toLowerCase()} is missing role ${OPERATOR_ROLE}`,
      );
    });

    it("Should revert if GENERAL_PAUSE_TYPE is enabled", async () => {
      const finalizationData = await generateFinalizationData();

      await lineaRollup.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);
      await expect(
        lineaRollup
          .connect(operator)
          .finalizeCompressedBlocksWithProof([], TEST_PUBLIC_VERIFIER_INDEX, finalizationData),
      )
        .to.be.revertedWithCustomError(lineaRollup, "IsPaused")
        .withArgs(GENERAL_PAUSE_TYPE);
    });

    it("Should revert if PROVING_SYSTEM_PAUSE_TYPE is enabled", async () => {
      const finalizationData = await generateFinalizationData();

      await lineaRollup.connect(securityCouncil).pauseByType(PROVING_SYSTEM_PAUSE_TYPE);
      await expect(
        lineaRollup
          .connect(operator)
          .finalizeCompressedBlocksWithProof([], TEST_PUBLIC_VERIFIER_INDEX, finalizationData),
      )
        .to.be.revertedWithCustomError(lineaRollup, "IsPaused")
        .withArgs(PROVING_SYSTEM_PAUSE_TYPE);
    });

    it("Should revert if the proof is empty", async () => {
      const finalizationData = await generateFinalizationData();

      await expect(
        lineaRollup
          .connect(operator)
          .finalizeCompressedBlocksWithProof([], TEST_PUBLIC_VERIFIER_INDEX, finalizationData),
      ).to.be.revertedWithCustomError(lineaRollup, "ProofIsEmpty");
    });

    it("Should revert when finalization parentStateRootHash is different than last finalized state root hash", async () => {
      // Submit 4 sets of compressed data setting the correct shnarf in storage
      const submissionDataBeforeFinalization = generateSubmissionData(0, 4);

      for (const data of submissionDataBeforeFinalization.slice(0, 3)) {
        await lineaRollup.connect(operator).submitData(data, { gasLimit: 30_000_000 });
      }

      const finalizationData = await generateFinalizationData({
        parentStateRootHash: generateRandomBytes(32),
        aggregatedProof: aggregatedProof1To155.aggregatedProof,
      });

      await expect(
        lineaRollup
          .connect(operator)
          .finalizeCompressedBlocksWithProof(
            aggregatedProof1To155.aggregatedProof,
            TEST_PUBLIC_VERIFIER_INDEX,
            finalizationData,
            { gasLimit: 30_000_000 },
          ),
      ).to.be.revertedWithCustomError(lineaRollup, "StartingRootHashDoesNotMatch");
    });

    it("Should successfully finalize with only previously submitted data", async () => {
      // Submit 4 sets of compressed data setting the correct shnarf in storage
      const submissionDataBeforeFinalization = generateSubmissionData(0, 4);

      for (const data of submissionDataBeforeFinalization) {
        await lineaRollup.connect(operator).submitData(data, { gasLimit: 30_000_000 });
      }

      const finalizationData = await generateFinalizationData({
        l1RollingHash: aggregatedProof1To155.l1RollingHash,
        l1RollingHashMessageNumber: BigNumber.from(aggregatedProof1To155.l1RollingHashMessageNumber),
        lastFinalizedTimestamp: BigNumber.from(aggregatedProof1To155.parentAggregationLastBlockTimestamp),
        dataParentHash: aggregatedProof1To155.dataParentHash,
        parentStateRootHash: aggregatedProof1To155.parentStateRootHash,
        dataHashes: submissionDataBeforeFinalization.map((data) => ethers.utils.keccak256(data.compressedData)),
        finalTimestamp: BigNumber.from(aggregatedProof1To155.finalTimestamp),
        l2MerkleRoots: aggregatedProof1To155.l2MerkleRoots,
        l2MerkleTreesDepth: BigNumber.from(aggregatedProof1To155.l2MerkleTreesDepth),
        l2MessagingBlocksOffsets: aggregatedProof1To155.l2MessagingBlocksOffsets,
        finalBlockNumber: BigNumber.from(aggregatedProof1To155.finalBlockNumber),
        aggregatedProof: aggregatedProof1To155.aggregatedProof,
      });

      await lineaRollup.setupParentDataHash(aggregatedProof1To155.dataParentHash, dataHash);
      await lineaRollup.setupParentFinalizedStateRoot(
        aggregatedProof1To155.dataParentHash,
        aggregatedProof1To155.parentStateRootHash,
      );
      await lineaRollup.setRollingHash(
        aggregatedProof1To155.l1RollingHashMessageNumber,
        aggregatedProof1To155.l1RollingHash,
      );
      await lineaRollup.setLastTimeStamp(aggregatedProof1To155.parentAggregationLastBlockTimestamp);

      await expect(
        await lineaRollup
          .connect(operator)
          .finalizeCompressedBlocksWithProof(
            aggregatedProof1To155.aggregatedProof,
            TEST_PUBLIC_VERIFIER_INDEX,
            finalizationData,
          ),
      )
        .to.emit(lineaRollup, "BlocksVerificationDone")
        .withArgs(
          BigNumber.from(aggregatedProof1To155.finalBlockNumber),
          finalizationData.parentStateRootHash,
          await lineaRollup.stateRootHashes(BigNumber.from(aggregatedProof1To155.finalBlockNumber)),
        );

      const [finalStateRootHash, lastFinalizedBlockTimestamp, lastFinalizedBlockNumber] = await Promise.all([
        lineaRollup.stateRootHashes(finalizationData.finalBlockNumber),
        lineaRollup.currentTimestamp(),
        lineaRollup.currentL2BlockNumber(),
      ]);

      expect(finalStateRootHash).to.equal(
        await lineaRollup.dataFinalStateRootHashes(finalizationData.dataHashes.slice(-1)[0]),
      );

      expect(lastFinalizedBlockTimestamp).to.equal(finalizationData.finalTimestamp);
      expect(lastFinalizedBlockNumber).to.equal(finalizationData.finalBlockNumber);
    });

    it("Should fail if shnarf is empty when finalizing", async () => {
      // Submit 4 sets of compressed data setting the correct shnarf in storage
      const submissionDataBeforeFinalization = generateSubmissionData(0, 4);

      for (const data of submissionDataBeforeFinalization) {
        await lineaRollup.connect(operator).submitData(data, { gasLimit: 30_000_000 });
      }

      const finalizationData = await generateFinalizationData({
        l1RollingHash: aggregatedProof1To155.l1RollingHash,
        l1RollingHashMessageNumber: BigNumber.from(aggregatedProof1To155.l1RollingHashMessageNumber),
        lastFinalizedTimestamp: BigNumber.from(aggregatedProof1To155.parentAggregationLastBlockTimestamp),
        dataParentHash: aggregatedProof1To155.dataParentHash,
        parentStateRootHash: aggregatedProof1To155.parentStateRootHash,
        dataHashes: submissionDataBeforeFinalization.map((data) => ethers.utils.keccak256(data.compressedData)),
        finalTimestamp: BigNumber.from(aggregatedProof1To155.finalTimestamp),
        l2MerkleRoots: aggregatedProof1To155.l2MerkleRoots,
        l2MerkleTreesDepth: BigNumber.from(aggregatedProof1To155.l2MerkleTreesDepth),
        l2MessagingBlocksOffsets: aggregatedProof1To155.l2MessagingBlocksOffsets,
        finalBlockNumber: BigNumber.from(aggregatedProof1To155.finalBlockNumber),
        aggregatedProof: aggregatedProof1To155.aggregatedProof,
      });

      await lineaRollup.setupParentDataHash(aggregatedProof1To155.dataParentHash, dataHash);
      await lineaRollup.setupParentFinalizedStateRoot(
        aggregatedProof1To155.dataParentHash,
        aggregatedProof1To155.parentStateRootHash,
      );
      await lineaRollup.setRollingHash(
        aggregatedProof1To155.l1RollingHashMessageNumber,
        aggregatedProof1To155.l1RollingHash,
      );
      await lineaRollup.setLastTimeStamp(BigNumber.from(aggregatedProof1To155.parentAggregationLastBlockTimestamp));

      await lineaRollup.setupParentDataShnarf(
        finalizationData.dataHashes[finalizationData.dataHashes.length - 1],
        HASH_ZERO,
      );

      await expect(
        lineaRollup
          .connect(operator)
          .finalizeCompressedBlocksWithProof(
            aggregatedProof1To155.aggregatedProof,
            TEST_PUBLIC_VERIFIER_INDEX,
            finalizationData,
          ),
      ).to.be.revertedWithCustomError(lineaRollup, "DataParentHasEmptyShnarf");
    });

    it("Should successfully finalize 1-81 and then 82-153 in two separate finalizations", async () => {
      // Submit 4 sets of compressed data setting the correct shnarf in storage
      await lineaRollup.setLastFinalizedBlock(0);

      // Submit all the data
      const submissionDataBeforeFinalization = generateSubmissionDataMultipleProofs(0, 4);

      for (const data of submissionDataBeforeFinalization) {
        await lineaRollup.connect(operator).submitData(data, { gasLimit: 30_000_000 });
      }

      // generate finalization for 1-81
      let finalizationData = await generateFinalizationData({
        l1RollingHash: aggregatedProof1To81.l1RollingHash,
        l1RollingHashMessageNumber: BigNumber.from(aggregatedProof1To81.l1RollingHashMessageNumber),
        lastFinalizedTimestamp: BigNumber.from(aggregatedProof1To81.parentAggregationLastBlockTimestamp),
        dataParentHash: aggregatedProof1To81.dataParentHash,
        parentStateRootHash: aggregatedProof1To81.parentStateRootHash,
        dataHashes: submissionDataBeforeFinalization
          .slice(0, 2)
          .map((data) => ethers.utils.keccak256(data.compressedData)),
        finalTimestamp: BigNumber.from(aggregatedProof1To81.finalTimestamp),
        l2MerkleRoots: aggregatedProof1To81.l2MerkleRoots,
        l2MerkleTreesDepth: BigNumber.from(aggregatedProof1To81.l2MerkleTreesDepth),
        l2MessagingBlocksOffsets: aggregatedProof1To81.l2MessagingBlocksOffsets,
        finalBlockNumber: BigNumber.from(aggregatedProof1To81.finalBlockNumber),
        aggregatedProof: aggregatedProof1To81.aggregatedProof,
      });

      // pre-configure messaging etc.
      await lineaRollup.setupParentDataHash(aggregatedProof1To81.dataParentHash, dataHash);
      await lineaRollup.setupParentFinalizedStateRoot(
        aggregatedProof1To81.dataParentHash,
        aggregatedProof1To81.parentStateRootHash,
      );
      await lineaRollup.setRollingHash(
        aggregatedProof1To81.l1RollingHashMessageNumber,
        aggregatedProof1To81.l1RollingHash,
      );
      await lineaRollup.setLastTimeStamp(BigNumber.from(aggregatedProof1To81.parentAggregationLastBlockTimestamp));

      // finalize 1-81
      await expect(
        await lineaRollup
          .connect(operator)
          .finalizeCompressedBlocksWithProof(
            aggregatedProof1To81.aggregatedProof,
            TEST_PUBLIC_VERIFIER_INDEX,
            finalizationData,
          ),
      )
        .to.emit(lineaRollup, "BlocksVerificationDone")
        .withArgs(
          BigNumber.from(aggregatedProof1To81.finalBlockNumber),
          finalizationData.parentStateRootHash,
          await lineaRollup.stateRootHashes(BigNumber.from(aggregatedProof1To81.finalBlockNumber)),
        );

      let [finalStateRootHash, lastFinalizedBlockTimestamp, lastFinalizedBlockNumber] = await Promise.all([
        lineaRollup.stateRootHashes(finalizationData.finalBlockNumber),
        lineaRollup.currentTimestamp(),
        lineaRollup.currentL2BlockNumber(),
      ]);

      expect(finalStateRootHash).to.equal(
        await lineaRollup.dataFinalStateRootHashes(finalizationData.dataHashes.slice(-1)[0]),
      );

      expect(lastFinalizedBlockTimestamp).to.equal(finalizationData.finalTimestamp);
      expect(lastFinalizedBlockNumber).to.equal(finalizationData.finalBlockNumber);

      // generate finalization for 82-153
      finalizationData = await generateFinalizationData({
        l1RollingHash: aggregatedProof82To153.l1RollingHash,
        l1RollingHashMessageNumber: BigNumber.from(aggregatedProof82To153.l1RollingHashMessageNumber),
        lastFinalizedTimestamp: BigNumber.from(aggregatedProof82To153.parentAggregationLastBlockTimestamp),
        dataParentHash: aggregatedProof82To153.dataParentHash,
        parentStateRootHash: aggregatedProof82To153.parentStateRootHash,
        dataHashes: submissionDataBeforeFinalization
          .slice(2, 4)
          .map((data) => ethers.utils.keccak256(data.compressedData)),
        finalTimestamp: BigNumber.from(aggregatedProof82To153.finalTimestamp),
        l2MerkleRoots: aggregatedProof82To153.l2MerkleRoots,
        l2MerkleTreesDepth: BigNumber.from(aggregatedProof82To153.l2MerkleTreesDepth),
        l2MessagingBlocksOffsets: aggregatedProof82To153.l2MessagingBlocksOffsets,
        finalBlockNumber: BigNumber.from(aggregatedProof82To153.finalBlockNumber),
        aggregatedProof: aggregatedProof82To153.aggregatedProof,
      });

      // configure messaging - all other parent/child relationships should already exist
      await lineaRollup.setRollingHash(
        aggregatedProof82To153.l1RollingHashMessageNumber,
        aggregatedProof82To153.l1RollingHash,
      );

      // This should cover the verification of the state root hash and block number 82 being the same
      await expect(
        await lineaRollup
          .connect(operator)
          .finalizeCompressedBlocksWithProof(
            aggregatedProof82To153.aggregatedProof,
            TEST_PUBLIC_VERIFIER_INDEX,
            finalizationData,
          ),
      )
        .to.emit(lineaRollup, "BlocksVerificationDone")
        .withArgs(
          BigNumber.from(aggregatedProof82To153.finalBlockNumber),
          finalizationData.parentStateRootHash,
          await lineaRollup.stateRootHashes(BigNumber.from(aggregatedProof82To153.finalBlockNumber)),
        );

      [finalStateRootHash, lastFinalizedBlockTimestamp, lastFinalizedBlockNumber] = await Promise.all([
        lineaRollup.stateRootHashes(finalizationData.finalBlockNumber),
        lineaRollup.currentTimestamp(),
        lineaRollup.currentL2BlockNumber(),
      ]);

      expect(finalStateRootHash).to.equal(
        await lineaRollup.dataFinalStateRootHashes(finalizationData.dataHashes.slice(-1)[0]),
      );

      expect(lastFinalizedBlockTimestamp).to.equal(finalizationData.finalTimestamp);
      expect(lastFinalizedBlockNumber).to.equal(finalizationData.finalBlockNumber);
    });

    it("Should revert if final state root hashes don't match on the second finalization", async () => {
      // Submit 4 sets of compressed data setting the correct shnarf in storage
      await lineaRollup.setLastFinalizedBlock(0);

      // Submit all the data
      const submissionDataBeforeFinalization = generateSubmissionDataMultipleProofs(0, 4);

      for (const data of submissionDataBeforeFinalization) {
        await lineaRollup.connect(operator).submitData(data, { gasLimit: 30_000_000 });
      }

      // generate finalization for 1-81
      let finalizationData = await generateFinalizationData({
        l1RollingHash: aggregatedProof1To81.l1RollingHash,
        l1RollingHashMessageNumber: BigNumber.from(aggregatedProof1To81.l1RollingHashMessageNumber),
        lastFinalizedTimestamp: BigNumber.from(aggregatedProof1To81.parentAggregationLastBlockTimestamp),
        dataParentHash: aggregatedProof1To81.dataParentHash,
        parentStateRootHash: aggregatedProof1To81.parentStateRootHash,
        dataHashes: submissionDataBeforeFinalization
          .slice(0, 2)
          .map((data) => ethers.utils.keccak256(data.compressedData)),
        finalTimestamp: aggregatedProof1To81.finalTimestamp,
        l2MerkleRoots: aggregatedProof1To81.l2MerkleRoots,
        l2MerkleTreesDepth: BigNumber.from(aggregatedProof1To81.l2MerkleTreesDepth),
        l2MessagingBlocksOffsets: aggregatedProof1To81.l2MessagingBlocksOffsets,
        finalBlockNumber: BigNumber.from(aggregatedProof1To81.finalBlockNumber),
        aggregatedProof: aggregatedProof1To81.aggregatedProof,
      });

      // pre-configure messaging etc.
      await lineaRollup.setupParentDataHash(aggregatedProof1To81.dataParentHash, dataHash);
      await lineaRollup.setupParentFinalizedStateRoot(
        aggregatedProof1To81.dataParentHash,
        aggregatedProof1To81.parentStateRootHash,
      );
      await lineaRollup.setRollingHash(
        aggregatedProof1To81.l1RollingHashMessageNumber,
        aggregatedProof1To81.l1RollingHash,
      );
      await lineaRollup.setLastTimeStamp(aggregatedProof1To81.parentAggregationLastBlockTimestamp);

      // finalize 1-81
      await expect(
        await lineaRollup
          .connect(operator)
          .finalizeCompressedBlocksWithProof(
            aggregatedProof1To81.aggregatedProof,
            TEST_PUBLIC_VERIFIER_INDEX,
            finalizationData,
          ),
      )
        .to.emit(lineaRollup, "BlocksVerificationDone")
        .withArgs(
          BigNumber.from(aggregatedProof1To81.finalBlockNumber),
          finalizationData.parentStateRootHash,
          await lineaRollup.stateRootHashes(BigNumber.from(aggregatedProof1To81.finalBlockNumber)),
        );

      const mismatchDataItem = ethers.utils.keccak256(submissionDataBeforeFinalization[1].compressedData);
      const mismatchDataItemFinalState = generateRandomBytes(32);

      await lineaRollup.setupParentFinalizedStateRoot(mismatchDataItem, mismatchDataItemFinalState);

      // generate finalization for 82-153
      finalizationData = await generateFinalizationData({
        l1RollingHash: aggregatedProof82To153.l1RollingHash,
        l1RollingHashMessageNumber: BigNumber.from(aggregatedProof82To153.l1RollingHashMessageNumber),
        lastFinalizedTimestamp: BigNumber.from(aggregatedProof82To153.parentAggregationLastBlockTimestamp),
        dataParentHash: aggregatedProof82To153.dataParentHash,
        parentStateRootHash: aggregatedProof82To153.parentStateRootHash,
        dataHashes: submissionDataBeforeFinalization
          .slice(2, 4)
          .map((data) => ethers.utils.keccak256(data.compressedData)),
        finalTimestamp: BigNumber.from(aggregatedProof82To153.finalTimestamp),
        l2MerkleRoots: aggregatedProof82To153.l2MerkleRoots,
        l2MerkleTreesDepth: BigNumber.from(aggregatedProof82To153.l2MerkleTreesDepth),
        l2MessagingBlocksOffsets: aggregatedProof82To153.l2MessagingBlocksOffsets,
        finalBlockNumber: BigNumber.from(aggregatedProof82To153.finalBlockNumber),
        aggregatedProof: aggregatedProof82To153.aggregatedProof,
      });

      // configure messaging - all other parent/child relationships should already exist
      await lineaRollup.setRollingHash(
        aggregatedProof82To153.l1RollingHashMessageNumber,
        aggregatedProof82To153.l1RollingHash,
      );

      // This should cover the verification of the state root hash and block number 82 being the same
      await expect(
        lineaRollup
          .connect(operator)
          .finalizeCompressedBlocksWithProof(
            aggregatedProof82To153.aggregatedProof,
            TEST_PUBLIC_VERIFIER_INDEX,
            finalizationData,
          ),
      )
        .to.be.revertedWithCustomError(lineaRollup, "FinalStateRootHashDoesNotMatch")
        .withArgs(mismatchDataItemFinalState, finalizationData.parentStateRootHash);
    });
  });

  describe("Validate L2 computed rolling hash", () => {
    it("Should revert if l1 message number == 0 and l1 rolling hash is not empty", async () => {
      const l1MessageNumber = 0;
      const l1RollingHash = generateRandomBytes(32);
      await expect(lineaRollup.validateL2ComputedRollingHash(l1MessageNumber, l1RollingHash))
        .to.be.revertedWithCustomError(lineaRollup, "MissingMessageNumberForRollingHash")
        .withArgs(l1RollingHash);
    });

    it("Should revert if l1 message number != 0 and l1 rolling hash is empty", async () => {
      const l1MessageNumber = BigNumber.from(1);
      const l1RollingHash = HASH_ZERO;
      await expect(lineaRollup.validateL2ComputedRollingHash(l1MessageNumber, l1RollingHash))
        .to.be.revertedWithCustomError(lineaRollup, "MissingRollingHashForMessageNumber")
        .withArgs(l1MessageNumber);
    });

    it("Should revert if l1RollingHash does not exist on L1", async () => {
      const l1MessageNumber = BigNumber.from(1);
      const l1RollingHash = generateRandomBytes(32);
      await expect(lineaRollup.validateL2ComputedRollingHash(l1MessageNumber, l1RollingHash))
        .to.be.revertedWithCustomError(lineaRollup, "L1RollingHashDoesNotExistOnL1")
        .withArgs(l1MessageNumber, l1RollingHash);
    });

    it("Should succeed if l1 message number == 0 and l1 rolling hash is empty", async () => {
      const l1MessageNumber = 0;
      const l1RollingHash = HASH_ZERO;
      await expect(lineaRollup.validateL2ComputedRollingHash(l1MessageNumber, l1RollingHash)).to.not.be.reverted;
    });

    it("Should succeed if l1 message number != 0, l1 rolling hash is not empty and exists on L1", async () => {
      const l1MessageNumber = BigNumber.from(1);
      const messageHash = generateRandomBytes(32);

      await lineaRollup.addRollingHash(l1MessageNumber, messageHash);

      const l1RollingHash = calculateRollingHash(HASH_ZERO, messageHash);

      await expect(lineaRollup.validateL2ComputedRollingHash(l1MessageNumber, l1RollingHash)).to.not.be.reverted;
    });
  });

  describe("Calculate Y value for Compressed Data", () => {
    it("Should successfully calculate y", async () => {
      const compressedDataBytes = ethers.utils.base64.decode(compressedData);

      expect(await lineaRollup.calculateY(compressedDataBytes, expectedX, { gasLimit: 30_000_000 })).to.equal(
        expectedY,
      );
    });

    it("Should revert if first byte is no zero", async () => {
      const compressedDataBytes = encodeData(
        ["bytes32", "bytes32", "bytes32"],
        [generateRandomBytes(32), HASH_WITHOUT_ZERO_FIRST_BYTE, generateRandomBytes(32)],
      );

      await expect(
        lineaRollup.calculateY(compressedDataBytes, expectedX, { gasLimit: 30_000_000 }),
      ).to.be.revertedWithCustomError(lineaRollup, "FirstByteIsNotZero");
    });

    it("Should revert if bytes length is not a multiple of 32", async () => {
      const compressedDataBytes = generateRandomBytes(56);

      await expect(
        lineaRollup.calculateY(compressedDataBytes, expectedX, { gasLimit: 30_000_000 }),
      ).to.be.revertedWithCustomError(lineaRollup, "BytesLengthNotMultipleOf32");
    });
  });
});
