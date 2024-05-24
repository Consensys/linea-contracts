import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture, time as networkTime } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { TestLineaRollup } from "../typechain-types";
import aggregatedProof1To155 from "./testData/compressedData/aggregatedProof-1-155.json";
import firstCompressedDataContent from "./testData/compressedData/blocks-1-46.json";
import secondCompressedDataContent from "./testData/compressedData/blocks-47-81.json";
import fourthCompressedDataContent from "./testData/compressedData/blocks-115-155.json";
import {
  ADDRESS_ZERO,
  DEFAULT_ADMIN_ROLE,
  GENERAL_PAUSE_TYPE,
  HASH_WITHOUT_ZERO_FIRST_BYTE,
  HASH_ZERO,
  INITIAL_MIGRATION_BLOCK,
  INITIAL_WITHDRAW_LIMIT,
  ONE_DAY_IN_SECONDS,
  OPERATOR_ROLE,
  PROVING_SYSTEM_PAUSE_TYPE,
  TEST_PUBLIC_VERIFIER_INDEX,
  VERIFIER_SETTER_ROLE,
  GENESIS_L2_TIMESTAMP,
  EMPTY_CALLDATA,
  INITIALIZED_ALREADY_MESSAGE,
} from "./utils/constants";
import { deployUpgradableFromFactory } from "./utils/deployment";
import {
  calculateRollingHash,
  encodeData,
  generateFinalizationData,
  generateKeccak256Hash,
  generateRandomBytes,
  generateCallDataSubmission,
  generateCallDataSubmissionMultipleProofs,
  generateSubmissionData,
  generateParentSubmissionDataForIndex,
  generateParentSubmissionDataForIndexForMultiple,
  generateKeccak256,
  expectEvent,
  buildAccessErrorMessage,
  expectRevertWithCustomError,
  expectRevertWithReason,
  generateParentAndExpectedShnarfForIndex,
  generateParentAndExpectedShnarfForMulitpleIndex,
  generateParentShnarfData,
} from "./utils/helpers";
import { CalldataSubmissionData, ParentSubmissionData, SubmissionData } from "./utils/types";

import aggregatedProof1To81 from "./testData/compressedData/multipleProofs/aggregatedProof-1-81.json";
import aggregatedProof82To153 from "./testData/compressedData/multipleProofs/aggregatedProof-82-153.json";
import { BigNumberish } from "ethers";

describe("Linea Rollup contract", () => {
  let lineaRollup: TestLineaRollup;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let admin: SignerWithAddress;
  let verifier: string;
  let securityCouncil: SignerWithAddress;
  let operator: SignerWithAddress;
  let nonAuthorizedAccount: SignerWithAddress;
  let parentSubmissionData: ParentSubmissionData;

  const { compressedData, prevShnarf, expectedShnarf, expectedX, expectedY, parentDataHash, parentStateRootHash } =
    firstCompressedDataContent;
  const { dataHash: secondCompressedDataHash, expectedShnarf: secondExpectedShnarf } = secondCompressedDataContent;

  async function deployLineaRollupFixture() {
    const PlonkVerifierFactory = await ethers.getContractFactory("TestPlonkVerifierForDataAggregation");
    const plonkVerifier = await PlonkVerifierFactory.deploy();
    await plonkVerifier.waitForDeployment();

    verifier = await plonkVerifier.getAddress();

    const lineaRollup = (await deployUpgradableFromFactory(
      "TestLineaRollup",
      [
        parentStateRootHash,
        0,
        verifier,
        securityCouncil.address,
        [operator.address],
        ONE_DAY_IN_SECONDS,
        INITIAL_WITHDRAW_LIMIT,
        1683325137n,
      ],
      {
        initializer: "initialize(bytes32,uint256,address,address,address[],uint256,uint256,uint256)",
        unsafeAllow: ["constructor"],
      },
    )) as unknown as TestLineaRollup;

    return lineaRollup;
  }

  before(async () => {
    [admin, securityCouncil, operator, nonAuthorizedAccount] = await ethers.getSigners();
  });

  beforeEach(async () => {
    lineaRollup = await loadFixture(deployLineaRollupFixture);
  });

  describe("Fallback/Receive tests", () => {
    const sendEthToContract = async (data: string) => {
      return admin.sendTransaction({ to: await lineaRollup.getAddress(), value: INITIAL_WITHDRAW_LIMIT, data });
    };

    it("Should fail to send eth to the lineaRollup contract through the fallback", async () => {
      await expect(sendEthToContract(EMPTY_CALLDATA)).to.be.reverted;
    });

    it("Should fail to send eth to the lineaRollup contract through the receive function", async () => {
      await expect(sendEthToContract("0x1234")).to.be.reverted;
    });
  });

  describe("Initialisation", () => {
    it("Should revert if verifier address is zero address ", async () => {
      const deployCall = deployUpgradableFromFactory(
        "LineaRollup",
        [
          parentStateRootHash,
          INITIAL_MIGRATION_BLOCK,
          ADDRESS_ZERO,
          securityCouncil.address,
          [operator.address],
          ONE_DAY_IN_SECONDS,
          INITIAL_WITHDRAW_LIMIT,
          GENESIS_L2_TIMESTAMP,
        ],
        {
          initializer: "initialize(bytes32,uint256,address,address,address[],uint256,uint256,uint256)",
          unsafeAllow: ["constructor"],
        },
      );

      await expectRevertWithCustomError(lineaRollup, deployCall, "ZeroAddressNotAllowed");
    });

    it("Should revert if an operator address is zero address ", async () => {
      const deployCall = deployUpgradableFromFactory(
        "TestLineaRollup",
        [
          parentStateRootHash,
          INITIAL_MIGRATION_BLOCK,
          verifier,
          securityCouncil.address,
          [ADDRESS_ZERO],
          ONE_DAY_IN_SECONDS,
          INITIAL_WITHDRAW_LIMIT,
          GENESIS_L2_TIMESTAMP,
        ],
        {
          initializer: "initialize(bytes32,uint256,address,address,address[],uint256,uint256,uint256)",
          unsafeAllow: ["constructor"],
        },
      );

      await expectRevertWithCustomError(lineaRollup, deployCall, "ZeroAddressNotAllowed");
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
          GENESIS_L2_TIMESTAMP,
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
      const initializeCall = lineaRollup.initialize(
        parentStateRootHash,
        INITIAL_MIGRATION_BLOCK,
        verifier,
        securityCouncil.address,
        [operator.address],
        ONE_DAY_IN_SECONDS,
        INITIAL_WITHDRAW_LIMIT,
        GENESIS_L2_TIMESTAMP,
      );

      await expectRevertWithReason(initializeCall, INITIALIZED_ALREADY_MESSAGE);
    });
  });

  describe("Upgrading, calculating and setting the data submission shnarfs", () => {
    it("Should upgrade and set the shnarfs correctly", async () => {
      const shnarfs = [generateRandomBytes(32), generateRandomBytes(32)];
      const finalBlockNumbers = [46n, 81n];

      await lineaRollup.initializeParentShnarfsAndFinalizedState(shnarfs, finalBlockNumbers);

      for (let i = 0; i < shnarfs.length; i++) {
        const finalblockNumber = await lineaRollup.shnarfFinalBlockNumbers(shnarfs[i]);
        expect(finalblockNumber).to.equal(finalBlockNumbers[i]);
      }
    });

    it("Should fail if the two array lengths are mismatched", async () => {
      const shnarfs = [generateRandomBytes(32), generateRandomBytes(32), generateRandomBytes(32)];
      const finalBlockNumbers = [46n, 81n];

      await expectRevertWithCustomError(
        lineaRollup,
        lineaRollup.initializeParentShnarfsAndFinalizedState(shnarfs, finalBlockNumbers),
        "ShnarfAndFinalBlockNumberLengthsMismatched",
        [shnarfs.length, finalBlockNumbers.length],
      );
    });

    it("Should fail trying to call initializeParentShnarfsAndFinalizedState twice", async () => {
      const shnarfs = [generateRandomBytes(32), generateRandomBytes(32)];
      const finalBlockNumbers = [46n, 81n];

      await lineaRollup.initializeParentShnarfsAndFinalizedState(shnarfs, finalBlockNumbers);

      for (let i = 0; i < shnarfs.length; i++) {
        const finalblockNumber = await lineaRollup.shnarfFinalBlockNumbers(shnarfs[i]);
        expect(finalblockNumber).to.equal(finalBlockNumbers[i]);
      }

      expectRevertWithReason(
        lineaRollup.initializeParentShnarfsAndFinalizedState(shnarfs, finalBlockNumbers),
        INITIALIZED_ALREADY_MESSAGE,
      );
    });
  });

  describe("Change verifier address", () => {
    it("Should revert if the caller has not the VERIFIER_SETTER_ROLE", async () => {
      const setVerifierCall = lineaRollup.connect(nonAuthorizedAccount).setVerifierAddress(verifier, 2);

      await expectRevertWithReason(
        setVerifierCall,
        buildAccessErrorMessage(nonAuthorizedAccount, VERIFIER_SETTER_ROLE),
      );
    });

    it("Should revert if the address being set is the zero address", async () => {
      await lineaRollup.connect(securityCouncil).grantRole(VERIFIER_SETTER_ROLE, securityCouncil.address);

      const setVerifierCall = lineaRollup.connect(securityCouncil).setVerifierAddress(ADDRESS_ZERO, 2);
      await expectRevertWithCustomError(lineaRollup, setVerifierCall, "ZeroAddressNotAllowed");
    });

    it("Should set the new verifier address", async () => {
      await lineaRollup.connect(securityCouncil).grantRole(VERIFIER_SETTER_ROLE, securityCouncil.address);

      await lineaRollup.connect(securityCouncil).setVerifierAddress(verifier, 2);
      expect(await lineaRollup.verifiers(2)).to.be.equal(verifier);
    });

    it("Should remove verifier address in storage ", async () => {
      lineaRollup = await loadFixture(deployLineaRollupFixture);
      await lineaRollup.connect(securityCouncil).unsetVerifierAddress(0);

      expect(await lineaRollup.verifiers(0)).to.be.equal(ADDRESS_ZERO);
    });

    it("Should revert when removing verifier address if the caller has not the VERIFIER_SETTER_ROLE ", async () => {
      lineaRollup = await loadFixture(deployLineaRollupFixture);

      await expect(lineaRollup.connect(nonAuthorizedAccount).unsetVerifierAddress(0)).to.be.revertedWith(
        buildAccessErrorMessage(nonAuthorizedAccount, VERIFIER_SETTER_ROLE),
      );
    });

    it("Should emit the correct event", async () => {
      await lineaRollup.connect(securityCouncil).grantRole(VERIFIER_SETTER_ROLE, securityCouncil.address);

      const oldVerifierAddress = await lineaRollup.verifiers(2);

      const setVerifierCall = lineaRollup.connect(securityCouncil).setVerifierAddress(verifier, 2);
      let expectedArgs = [verifier, 2, securityCouncil.address, oldVerifierAddress];

      await expectEvent(lineaRollup, setVerifierCall, "VerifierAddressChanged", expectedArgs);

      await lineaRollup.connect(securityCouncil).unsetVerifierAddress(2);

      const unsetVerifierCall = lineaRollup.connect(securityCouncil).unsetVerifierAddress(2);
      expectedArgs = [ADDRESS_ZERO, 2, securityCouncil.address, oldVerifierAddress];

      await expectEvent(lineaRollup, unsetVerifierCall, "VerifierAddressChanged", expectedArgs);
    });
  });

  describe("Data submission tests", () => {
    beforeEach(async () => {
      await lineaRollup.setLastFinalizedBlock(0);
    });

    const [DATA_ONE] = generateCallDataSubmission(0, 1);

    it("Fails when the compressed data is empty", async () => {
      const [submissionData] = generateCallDataSubmission(0, 1);
      submissionData.compressedData = EMPTY_CALLDATA;

      const submitDataCall = lineaRollup
        .connect(operator)
        .submitDataAsCalldata(submissionData, prevShnarf, secondExpectedShnarf, { gasLimit: 30_000_000 });
      await expectRevertWithCustomError(lineaRollup, submitDataCall, "EmptySubmissionData");
    });

    it("Should succesfully submit 1 compressed data chunk setting values", async () => {
      const [submissionData] = generateCallDataSubmission(0, 1);

      await expect(
        lineaRollup
          .connect(operator)
          .submitDataAsCalldata(submissionData, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 }),
      ).to.not.be.reverted;

      const finalBlockNumber = await lineaRollup.shnarfFinalBlockNumbers(expectedShnarf);
      expect(finalBlockNumber).to.equal(submissionData.finalBlockInData);
    });

    it("Should succesfully submit 2 compressed data chunks in two transactions", async () => {
      const [firstSubmissionData, secondSubmissionData] = generateCallDataSubmission(0, 2);

      await expect(
        lineaRollup
          .connect(operator)
          .submitDataAsCalldata(firstSubmissionData, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 }),
      ).to.not.be.reverted;

      await expect(
        lineaRollup.connect(operator).submitDataAsCalldata(secondSubmissionData, expectedShnarf, secondExpectedShnarf, {
          gasLimit: 30_000_000,
        }),
      ).to.not.be.reverted;

      const finalBlockNumber = await lineaRollup.shnarfFinalBlockNumbers(secondExpectedShnarf);

      expect(finalBlockNumber).to.equal(secondSubmissionData.finalBlockInData);
    });

    it("Should emit an event while submitting 1 compressed data chunk", async () => {
      const [submissionData] = generateCallDataSubmission(0, 1);

      const submitDataCall = lineaRollup
        .connect(operator)
        .submitDataAsCalldata(submissionData, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 });
      const eventArgs = [expectedShnarf, 1, 46];

      await expectEvent(lineaRollup, submitDataCall, "DataSubmittedV2", eventArgs);
    });

    it("Should fail if the stored shnarf block number + 1 does not match the starting submission numer", async () => {
      const [submissionData] = generateCallDataSubmission(0, 1);

      await lineaRollup.setShnarfFinalBlockNumber(prevShnarf, 99n);

      const submitDataCall = lineaRollup
        .connect(operator)
        .submitDataAsCalldata(submissionData, prevShnarf, secondExpectedShnarf, { gasLimit: 30_000_000 });
      const eventArgs = [100n, 1n];

      await expectRevertWithCustomError(lineaRollup, submitDataCall, "DataStartingBlockDoesNotMatch", eventArgs);
    });

    it("Should fail if the final state root hash is empty", async () => {
      const [submissionData] = generateCallDataSubmission(0, 1);

      submissionData.finalStateRootHash = HASH_ZERO;

      const submitDataCall = lineaRollup
        .connect(operator)
        .submitDataAsCalldata(submissionData, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 });

      await expectRevertWithCustomError(lineaRollup, submitDataCall, "FinalBlockStateEqualsZeroHash");
    });

    it("Should fail if the block numbers are out of sequence", async () => {
      const [firstSubmissionData, secondSubmissionData] = generateCallDataSubmission(0, 2);

      await expect(
        lineaRollup
          .connect(operator)
          .submitDataAsCalldata(firstSubmissionData, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 }),
      ).to.not.be.reverted;

      const expectedFirstBlock = secondSubmissionData.firstBlockInData;
      secondSubmissionData.firstBlockInData = secondSubmissionData.firstBlockInData + 1n;

      const submitDataCall = lineaRollup
        .connect(operator)
        .submitDataAsCalldata(secondSubmissionData, expectedShnarf, secondExpectedShnarf, { gasLimit: 30_000_000 });
      const eventArgs = [expectedFirstBlock, secondSubmissionData.firstBlockInData];

      await expectRevertWithCustomError(lineaRollup, submitDataCall, "DataStartingBlockDoesNotMatch", eventArgs);
    });

    it("Should fail to submit where expected shnarf is wrong", async () => {
      const [firstSubmissionData, secondSubmissionData] = generateCallDataSubmission(0, 2);

      await expect(
        lineaRollup
          .connect(operator)
          .submitDataAsCalldata(firstSubmissionData, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 }),
      ).to.not.be.reverted;

      const wrongComputedShnarf = generateRandomBytes(32);

      const submitDataCall = lineaRollup
        .connect(operator)
        .submitDataAsCalldata(secondSubmissionData, expectedShnarf, wrongComputedShnarf, { gasLimit: 30_000_000 });

      const eventArgs = [wrongComputedShnarf, secondExpectedShnarf];

      await expectRevertWithCustomError(lineaRollup, submitDataCall, "FinalShnarfWrong", eventArgs);
    });

    it("Should revert if the caller does not have the OPERATOR_ROLE", async () => {
      const submitDataCall = lineaRollup
        .connect(nonAuthorizedAccount)
        .submitDataAsCalldata(DATA_ONE, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 });

      await expectRevertWithReason(submitDataCall, buildAccessErrorMessage(nonAuthorizedAccount, OPERATOR_ROLE));
    });

    it("Should revert if GENERAL_PAUSE_TYPE is enabled", async () => {
      await lineaRollup.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);

      const submitDataCall = lineaRollup
        .connect(operator)
        .submitDataAsCalldata(DATA_ONE, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 });

      await expectRevertWithCustomError(lineaRollup, submitDataCall, "IsPaused", [GENERAL_PAUSE_TYPE]);
    });

    it("Should revert if PROVING_SYSTEM_PAUSE_TYPE is enabled", async () => {
      await lineaRollup.connect(securityCouncil).pauseByType(PROVING_SYSTEM_PAUSE_TYPE);

      const submitDataCall = lineaRollup
        .connect(operator)
        .submitDataAsCalldata(DATA_ONE, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 });

      await expectRevertWithCustomError(lineaRollup, submitDataCall, "IsPaused", [PROVING_SYSTEM_PAUSE_TYPE]);
    });

    it("Should revert with FirstBlockLessThanOrEqualToLastFinalizedBlock when submitting data with firstBlockInData less than currentL2BlockNumber", async () => {
      await lineaRollup.setLastFinalizedBlock(1_000_000);

      const submitDataCall = lineaRollup
        .connect(operator)
        .submitDataAsCalldata(DATA_ONE, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 });

      await expectRevertWithCustomError(lineaRollup, submitDataCall, "FirstBlockLessThanOrEqualToLastFinalizedBlock", [
        DATA_ONE.firstBlockInData,
        1000000,
      ]);
    });

    it("Should revert with FirstBlockGreaterThanFinalBlock when submitting data with firstBlockInData greater than finalBlockInData", async () => {
      const submissionData: CalldataSubmissionData = {
        ...DATA_ONE,
        firstBlockInData: DATA_ONE.firstBlockInData,
        finalBlockInData: DATA_ONE.firstBlockInData - 1n,
      };

      const submitDataCall = lineaRollup
        .connect(operator)
        .submitDataAsCalldata(submissionData, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 });

      await expectRevertWithCustomError(lineaRollup, submitDataCall, "FirstBlockGreaterThanFinalBlock", [
        submissionData.firstBlockInData,
        submissionData.finalBlockInData,
      ]);
    });

    it("Should revert with DataAlreadySubmitted when submitting same compressed data twice in 2 separate transactions", async () => {
      await lineaRollup
        .connect(operator)
        .submitDataAsCalldata(DATA_ONE, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 });

      const submitDataCall = lineaRollup
        .connect(operator)
        .submitDataAsCalldata(DATA_ONE, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 });

      await expectRevertWithCustomError(lineaRollup, submitDataCall, "DataAlreadySubmitted", [expectedShnarf]);
    });

    it("Should revert with DataAlreadySubmitted when submitting same data, differing block numbers", async () => {
      await lineaRollup
        .connect(operator)
        .submitDataAsCalldata(DATA_ONE, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 });

      const [dataOneCopy] = generateCallDataSubmission(0, 1);
      dataOneCopy.finalBlockInData = 234253242n;

      const submitDataCall = lineaRollup
        .connect(operator)
        .submitDataAsCalldata(dataOneCopy, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 });

      await expectRevertWithCustomError(lineaRollup, submitDataCall, "DataAlreadySubmitted", [expectedShnarf]);
    });

    it("Should revert with SnarkHashIsZeroHash when snarkHash is zero hash", async () => {
      const submissionData: CalldataSubmissionData = {
        ...DATA_ONE,
        snarkHash: HASH_ZERO,
      };

      const submitDataCall = lineaRollup
        .connect(operator)
        .submitDataAsCalldata(submissionData, prevShnarf, expectedShnarf, { gasLimit: 30_000_000 });

      await expectRevertWithCustomError(lineaRollup, submitDataCall, "SnarkHashIsZeroHash");
    });
  });

  // Skipping until we have supporting tools to test with.
  describe.skip("EIP-4844 Blob submission tests", () => {
    beforeEach(async () => {
      await lineaRollup.setLastFinalizedBlock(0);
      await lineaRollup.setupParentShnarf(prevShnarf, 1);
      await lineaRollup.setupParentDataShnarf(parentDataHash, prevShnarf);
      await lineaRollup.setupParentFinalizedStateRoot(parentDataHash, parentStateRootHash);
    });

    const [DATA_ONE] = generateCallDataSubmission(0, 1);
    const [DATA_TWO] = generateCallDataSubmission(1, 2);
    const [submissionData] = generateCallDataSubmission(0, 1);
    const y: BigNumberish = 0;
    const kzgCommitment = generateRandomBytes(48);
    const kzgProof = generateRandomBytes(48);

    const [{ submissionData: DATA_THREE }] = generateSubmissionData(0, 2);
    DATA_THREE.parentStateRootHash = generateRandomBytes(32);

    // This should not be skipped once we can access blobhash(0)
    it("Fails when the blobhash is zero", async () => {
      await expect(
        lineaRollup
          .connect(operator)
          .submitBlobData(submissionData, y, kzgCommitment, kzgProof, { gasLimit: 30_000_000 }),
      ).to.be.revertedWithCustomError(lineaRollup, "EmptyBlobHashData");
    });

    it("Should revert if the caller does not have the OPERATOR_ROLE", async () => {
      await expect(
        lineaRollup
          .connect(nonAuthorizedAccount)
          .submitBlobData(submissionData, y, kzgCommitment, kzgProof, { gasLimit: 30_000_000 }),
      ).to.be.revertedWith(
        `AccessControl: account ${nonAuthorizedAccount.address.toLowerCase()} is missing role ${OPERATOR_ROLE}`,
      );
    });

    it("Should revert if GENERAL_PAUSE_TYPE is enabled", async () => {
      await lineaRollup.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);
      await expect(
        lineaRollup
          .connect(operator)
          .submitBlobData(submissionData, y, kzgCommitment, kzgProof, { gasLimit: 30_000_000 }),
      )
        .to.be.revertedWithCustomError(lineaRollup, "IsPaused")
        .withArgs(GENERAL_PAUSE_TYPE);
    });

    it("Should revert if PROVING_SYSTEM_PAUSE_TYPE is enabled", async () => {
      await lineaRollup.connect(securityCouncil).pauseByType(PROVING_SYSTEM_PAUSE_TYPE);
      await expect(
        lineaRollup
          .connect(operator)
          .submitBlobData(submissionData, y, kzgCommitment, kzgProof, { gasLimit: 30_000_000 }),
      )
        .to.be.revertedWithCustomError(lineaRollup, "IsPaused")
        .withArgs(PROVING_SYSTEM_PAUSE_TYPE);
    });

    it("Should fail if the final state root hash is empty", async () => {
      const [{ submissionData }] = generateSubmissionData(0, 1);

      submissionData.finalStateRootHash = HASH_ZERO;

      console.log(submissionData.snarkHash);
      console.log(y);
      console.log(kzgCommitment);
      console.log(kzgProof);

      await expect(
        lineaRollup
          .connect(operator)
          .submitBlobData(submissionData, y, kzgCommitment, kzgProof, { gasLimit: 30_000_000 }),
      ).to.be.revertedWithCustomError(lineaRollup, "FinalBlockStateEqualsZeroHash");
    });

    it("Should fail if the block numbers are out of sequence", async () => {
      const [{ submissionData: firstSubmissionData }, { submissionData: secondSubmissionData }] =
        generateSubmissionData(0, 2);
      await expect(
        lineaRollup.connect(operator).submitBlobData(firstSubmissionData, y, kzgCommitment, kzgProof, {
          gasLimit: 30_000_000,
        }),
      ).to.not.be.reverted;

      const expectedFirstBlock = secondSubmissionData.firstBlockInData;
      secondSubmissionData.firstBlockInData = secondSubmissionData.firstBlockInData + 1n;

      // Once the blobhash is available, this needs to change.
      secondSubmissionData.dataParentHash = generateKeccak256Hash("blobhash");

      await expect(
        lineaRollup.connect(operator).submitBlobData(secondSubmissionData, y, kzgCommitment, kzgProof, {
          gasLimit: 30_000_000,
        }),
      )
        .to.be.revertedWithCustomError(lineaRollup, "DataStartingBlockDoesNotMatch")
        .withArgs(expectedFirstBlock, secondSubmissionData.firstBlockInData);
    });

    it("Should revert with FirstBlockLessThanOrEqualToLastFinalizedBlock when submitting data with firstBlockInData less than currentL2BlockNumber", async () => {
      await lineaRollup.setLastFinalizedBlock(1_000_000);

      await expect(
        lineaRollup
          .connect(operator)
          .submitBlobData(submissionData, y, kzgCommitment, kzgProof, { gasLimit: 30_000_000 }),
      )
        .to.be.revertedWithCustomError(lineaRollup, "FirstBlockLessThanOrEqualToLastFinalizedBlock")
        .withArgs(submissionData.firstBlockInData, 1000000);
    });

    it("Should revert with FirstBlockGreaterThanFinalBlock when submitting data with firstBlockInData greater than finalBlockInData", async () => {
      const submissionData: SubmissionData = {
        ...DATA_ONE,
        firstBlockInData: DATA_ONE.firstBlockInData,
        finalBlockInData: DATA_ONE.firstBlockInData - 1n,
      };

      await expect(
        lineaRollup
          .connect(operator)
          .submitBlobData(submissionData, y, kzgCommitment, kzgProof, { gasLimit: 30_000_000 }),
      )
        .to.be.revertedWithCustomError(lineaRollup, "FirstBlockGreaterThanFinalBlock")
        .withArgs(submissionData.firstBlockInData, submissionData.finalBlockInData);
    });

    it("Should revert with DataAlreadySubmitted when submitting same compressed data twice in 2 separate transactions", async () => {
      await lineaRollup
        .connect(operator)
        .submitBlobData(submissionData, y, kzgCommitment, kzgProof, { gasLimit: 30_000_000 }),
        await expect(
          lineaRollup
            .connect(operator)
            .submitBlobData(submissionData, y, kzgCommitment, kzgProof, { gasLimit: 30_000_000 }),
        ).to.be.revertedWithCustomError(lineaRollup, "DataAlreadySubmitted");
    });

    it("Should revert with StateRootHashInvalid when verifying last stored dataStateRootHash matches parent dataStateRootHash in calldata", async () => {
      await lineaRollup
        .connect(operator)
        .submitBlobData(submissionData, y, kzgCommitment, kzgProof, { gasLimit: 30_000_000 });
      const secondData = DATA_TWO;
      secondData.parentStateRootHash = generateRandomBytes(32);

      await expect(
        lineaRollup.connect(operator).submitDataAsCalldata(secondData, { gasLimit: 30_000_000 }),
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

        const finalizeCall = lineaRollup.connect(operator).finalizeBlocksWithoutProof(finalizationData);

        await expectRevertWithReason(finalizeCall, buildAccessErrorMessage(operator, DEFAULT_ADMIN_ROLE));
      });

      it("Should revert if GENERAL_PAUSE_TYPE is enabled", async () => {
        const finalizationData = await generateFinalizationData();

        await lineaRollup.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);

        const finalizeCall = lineaRollup.connect(securityCouncil).finalizeBlocksWithoutProof(finalizationData);

        await expectRevertWithCustomError(lineaRollup, finalizeCall, "IsPaused", [GENERAL_PAUSE_TYPE]);
      });

      it("Should revert if _finalizationData.finalBlockNumber is less than or equal to currentL2BlockNumber", async () => {
        await lineaRollup.setLastFinalizedBlock(10_000_000);

        const finalizationData = await generateFinalizationData();

        // finalization block is set to 0 and the hash is zero - the test is to perform other validations
        finalizationData.parentStateRootHash = HASH_ZERO;

        const finalizeCall = lineaRollup.connect(securityCouncil).finalizeBlocksWithoutProof(finalizationData);

        await expectRevertWithCustomError(
          lineaRollup,
          finalizeCall,
          "FinalBlockNumberLessThanOrEqualToLastFinalizedBlock",
          [finalizationData.finalBlockInData, 10_000_000],
        );
      });

      it("Should revert if l1 message number == 0 and l1 rolling hash is not empty", async () => {
        const finalizationData = await generateFinalizationData({
          l1RollingHashMessageNumber: 0n,
        });

        // finalization block is set to 0 and the hash is zero - the test is to perform other validations
        finalizationData.parentStateRootHash = firstCompressedDataContent.parentStateRootHash;

        const finalizeCall = lineaRollup.connect(securityCouncil).finalizeBlocksWithoutProof(finalizationData);

        await expectRevertWithCustomError(lineaRollup, finalizeCall, "MissingMessageNumberForRollingHash", [
          finalizationData.l1RollingHash,
        ]);
      });

      it("Should revert if l1 message number != 0 and l1 rolling hash is empty", async () => {
        const finalizationData = await generateFinalizationData({ l1RollingHash: HASH_ZERO });

        // finalization block is set to 0 and the hash is zero - the test is to perform other validations
        finalizationData.parentStateRootHash = HASH_ZERO;

        const finalizeCall = lineaRollup.connect(securityCouncil).finalizeBlocksWithoutProof(finalizationData);

        await expectRevertWithCustomError(lineaRollup, finalizeCall, "MissingRollingHashForMessageNumber", [
          finalizationData.l1RollingHashMessageNumber,
        ]);
      });

      it("Should revert if l1RollingHash does not exist on L1", async () => {
        const finalizationData = await generateFinalizationData();

        // finalization block is set to 0 and the hash is zero - the test is to perform other validations
        finalizationData.parentStateRootHash = HASH_ZERO;

        const finalizeCall = lineaRollup.connect(securityCouncil).finalizeBlocksWithoutProof(finalizationData);

        await expectRevertWithCustomError(lineaRollup, finalizeCall, "L1RollingHashDoesNotExistOnL1", [
          finalizationData.l1RollingHashMessageNumber,
          finalizationData.l1RollingHash,
        ]);
      });

      it("Should revert if timestamps are not in sequence", async () => {
        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: 10n,
        });

        // finalization block is set to 0 and the hash is zero - the test is to perform other validations
        finalizationData.parentStateRootHash = HASH_ZERO;
        const expectedHashValue = generateKeccak256(
          ["uint256", "bytes32", "uint256"],
          [
            finalizationData.lastFinalizedL1RollingHashMessageNumber,
            finalizationData.lastFinalizedL1RollingHash,
            finalizationData.lastFinalizedTimestamp,
          ],
        );
        const actualHashValue = generateKeccak256(
          ["uint256", "bytes32", "uint256"],
          [
            finalizationData.lastFinalizedL1RollingHashMessageNumber,
            finalizationData.lastFinalizedL1RollingHash,
            1683325137n,
          ],
        );

        const finalizeCompressedCall = lineaRollup
          .connect(securityCouncil)
          .finalizeBlocksWithoutProof(finalizationData);
        await expectRevertWithCustomError(lineaRollup, finalizeCompressedCall, "FinalizationStateIncorrect", [
          expectedHashValue,
          actualHashValue,
        ]);
      });

      it("Should revert if finalizationData.finalTimestamp is greater than the block.timestamp", async () => {
        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: 10n,
          lastFinalizedTimestamp: 1683325137n,
          finalTimestamp: BigInt(new Date(new Date().setHours(new Date().getHours() + 2)).getTime()),
        });

        // finalization block is set to 0 and the hash is zero - the test is to perform other validations
        finalizationData.parentStateRootHash = HASH_ZERO;

        const finalizeCompressedCall = lineaRollup
          .connect(securityCouncil)
          .finalizeBlocksWithoutProof(finalizationData);
        await expectRevertWithCustomError(lineaRollup, finalizeCompressedCall, "FinalizationInTheFuture", [
          finalizationData.finalTimestamp,
          (await networkTime.latest()) + 1,
        ]);
      });

      it("Should revert if the parent datahash's fingerprint does not match", async () => {
        const [submissionDataBeforeFinalization] = generateCallDataSubmission(0, 1);
        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(submissionDataBeforeFinalization, prevShnarf, expectedShnarf, {
            gasLimit: 30_000_000,
          });

        const finalSubmissionData = generateParentSubmissionDataForIndex(1);

        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: 10n,
          lastFinalizedTimestamp: 1683325137n,
          finalBlockInData: BigInt(100n),
          shnarfData: generateParentShnarfData(0),
        });

        finalSubmissionData.shnarf = generateRandomBytes(32);

        const finalizeCompressedCall = lineaRollup
          .connect(securityCouncil)
          .finalizeBlocksWithoutProof(finalizationData);
        await expectRevertWithCustomError(
          lineaRollup,
          finalizeCompressedCall,
          "FinalBlockDoesNotMatchShnarfFinalBlock",
          [finalizationData.finalBlockInData, await lineaRollup.dataShnarfHashes(finalSubmissionData.shnarf)],
        );
      });
    });

    describe("Without submission data", () => {
      it("Should revert with if the final block state equals the zero hash", async () => {
        const submissionDataBeforeFinalization = generateCallDataSubmission(0, 2);
        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(submissionDataBeforeFinalization[0], prevShnarf, expectedShnarf, {
            gasLimit: 30_000_000,
          });

        parentSubmissionData = generateParentSubmissionDataForIndex(1);

        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(submissionDataBeforeFinalization[1], expectedShnarf, secondExpectedShnarf, {
            gasLimit: 30_000_000,
          });

        parentSubmissionData = generateParentSubmissionDataForIndex(2);

        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: 10n,
          lastFinalizedTimestamp: 1683325137n,
          finalDataHash: secondCompressedDataHash,
          finalSubmissionData: parentSubmissionData,
        });

        finalizationData.shnarfData.finalStateRootHash = HASH_ZERO;

        const finalizeCall = lineaRollup.connect(securityCouncil).finalizeBlocksWithoutProof(finalizationData);

        await expectRevertWithCustomError(lineaRollup, finalizeCall, "FinalBlockStateEqualsZeroHash");
      });

      it("Should successfully finalize blocks and emit DataFinalized event", async () => {
        const submissionDataBeforeFinalization = generateCallDataSubmission(0, 2);
        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(submissionDataBeforeFinalization[0], prevShnarf, expectedShnarf, {
            gasLimit: 30_000_000,
          });

        parentSubmissionData = generateParentSubmissionDataForIndex(1);

        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(submissionDataBeforeFinalization[1], expectedShnarf, secondExpectedShnarf, {
            gasLimit: 30_000_000,
          });

        parentSubmissionData = generateParentSubmissionDataForIndex(2);

        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: 10n,
          lastFinalizedTimestamp: 1683325137n,
          finalBlockInData: BigInt(submissionDataBeforeFinalization[1].finalBlockInData),
          parentStateRootHash: parentStateRootHash,
          shnarfData: generateParentShnarfData(2),
        });

        const finalizeCompressedCall = lineaRollup
          .connect(securityCouncil)
          .finalizeBlocksWithoutProof(finalizationData);
        const eventArgs = [
          finalizationData.finalBlockInData,
          finalizationData.parentStateRootHash,
          finalizationData.shnarfData.finalStateRootHash,
          false,
        ];

        await expectEvent(lineaRollup, finalizeCompressedCall, "DataFinalized", eventArgs);
      });

      it("Should successfully finalize blocks and store the last state root hash, the final timestamp, the final block number", async () => {
        const submissionDataBeforeFinalization = generateCallDataSubmission(0, 2);

        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(submissionDataBeforeFinalization[0], prevShnarf, expectedShnarf, {
            gasLimit: 30_000_000,
          });

        parentSubmissionData = generateParentSubmissionDataForIndex(1);

        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(submissionDataBeforeFinalization[1], expectedShnarf, secondExpectedShnarf, {
            gasLimit: 30_000_000,
          });

        parentSubmissionData = generateParentSubmissionDataForIndex(1);

        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: 10n,
          lastFinalizedTimestamp: 1683325137n,
          finalBlockInData: submissionDataBeforeFinalization[1].finalBlockInData,
          parentStateRootHash: parentStateRootHash,
          shnarfData: generateParentShnarfData(2),
        });

        expect(await lineaRollup.connect(securityCouncil).finalizeBlocksWithoutProof(finalizationData)).to.not.be
          .reverted;

        const [finalStateRootHash, lastFinalizedBlockNumber, lastFinalizedState] = await Promise.all([
          lineaRollup.stateRootHashes(finalizationData.finalBlockInData),
          lineaRollup.currentL2BlockNumber(),
          lineaRollup.currentFinalizedState(),
        ]);

        expect(finalStateRootHash).to.equal(finalizationData.shnarfData.finalStateRootHash);
        expect(lastFinalizedBlockNumber).to.equal(finalizationData.finalBlockInData);
        expect(lastFinalizedState).to.equal(
          generateKeccak256(
            ["uint256", "bytes32", "uint256"],
            [
              finalizationData.l1RollingHashMessageNumber,
              finalizationData.l1RollingHash,
              finalizationData.finalTimestamp,
            ],
          ),
        );
      });

      it("Should successfully finalize blocks and anchor L2 merkle root, emit an event for each L2 block containing L2->L1 messages", async () => {
        const submissionDataBeforeFinalization = generateCallDataSubmission(0, 2);

        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(submissionDataBeforeFinalization[0], prevShnarf, expectedShnarf, {
            gasLimit: 30_000_000,
          });

        parentSubmissionData = generateParentSubmissionDataForIndex(1);

        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(submissionDataBeforeFinalization[1], expectedShnarf, secondExpectedShnarf, {
            gasLimit: 30_000_000,
          });

        parentSubmissionData = generateParentSubmissionDataForIndex(1);

        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: 10n,
          lastFinalizedTimestamp: 1683325137n,
          finalBlockInData: submissionDataBeforeFinalization[1].finalBlockInData,
          parentStateRootHash: parentStateRootHash,
          shnarfData: generateParentShnarfData(2),
        });

        const currentL2BlockNumber = await lineaRollup.currentL2BlockNumber();

        const tx = await lineaRollup.connect(securityCouncil).finalizeBlocksWithoutProof(finalizationData);
        await tx.wait();

        const events = await lineaRollup.queryFilter(lineaRollup.filters.L2MessagingBlockAnchored());

        expect(events.length).to.equal(1);

        for (let i = 0; i < events.length; i++) {
          expect(events[i].args?.l2Block).to.deep.equal(
            currentL2BlockNumber + BigInt(`0x${finalizationData.l2MessagingBlocksOffsets.slice(i * 4 + 2, i * 4 + 6)}`),
          );
        }

        for (let i = 0; i < finalizationData.l2MerkleRoots.length; i++) {
          const l2MerkleRootTreeDepth = await lineaRollup.l2MerkleRootsDepths(finalizationData.l2MerkleRoots[i]);
          expect(l2MerkleRootTreeDepth).to.equal(finalizationData.l2MerkleTreesDepth);
        }
      });

      it("Should successfully finalize blocks when we submit data1 and data2 but only finalizing data1", async () => {
        const submissionDataBeforeFinalization = generateCallDataSubmission(0, 2);

        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(submissionDataBeforeFinalization[0], prevShnarf, expectedShnarf, {
            gasLimit: 30_000_000,
          });

        parentSubmissionData = generateParentSubmissionDataForIndex(1);

        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(submissionDataBeforeFinalization[1], expectedShnarf, secondExpectedShnarf, {
            gasLimit: 30_000_000,
          });

        const finalizationData = await generateFinalizationData({
          l1RollingHash: calculateRollingHash(HASH_ZERO, messageHash),
          l1RollingHashMessageNumber: 10n,
          lastFinalizedTimestamp: 1683325137n,
          finalBlockInData: submissionDataBeforeFinalization[0].finalBlockInData,
          parentStateRootHash: parentStateRootHash,
          shnarfData: generateParentShnarfData(1),
        });

        expect(await lineaRollup.connect(securityCouncil).finalizeBlocksWithoutProof(finalizationData)).to.not.be
          .reverted;

        const [finalStateRootHash, lastFinalizedBlockNumber, lastFinalizedState] = await Promise.all([
          lineaRollup.stateRootHashes(finalizationData.finalBlockInData),
          lineaRollup.currentL2BlockNumber(),
          lineaRollup.currentFinalizedState(),
        ]);

        expect(finalStateRootHash).to.equal(finalizationData.shnarfData.finalStateRootHash);
        expect(lastFinalizedBlockNumber).to.equal(finalizationData.finalBlockInData);
        expect(lastFinalizedState).to.equal(
          generateKeccak256(
            ["uint256", "bytes32", "uint256"],
            [
              finalizationData.l1RollingHashMessageNumber,
              finalizationData.l1RollingHash,
              finalizationData.finalTimestamp,
            ],
          ),
        );
      });
    });
  });

  describe("Compressed data finalization with proof", () => {
    beforeEach(async () => {
      parentSubmissionData = generateParentSubmissionDataForIndex(0);
      await lineaRollup.setLastFinalizedBlock(0);
    });

    it("Should revert if the caller does not have the OPERATOR_ROLE", async () => {
      const finalizationData = await generateFinalizationData();

      const finalizeCall = lineaRollup
        .connect(nonAuthorizedAccount)
        .finalizeBlocksWithProof(aggregatedProof1To155.aggregatedProof, TEST_PUBLIC_VERIFIER_INDEX, finalizationData);
      await expectRevertWithReason(finalizeCall, buildAccessErrorMessage(nonAuthorizedAccount, OPERATOR_ROLE));
    });

    it("Should revert if GENERAL_PAUSE_TYPE is enabled", async () => {
      const finalizationData = await generateFinalizationData();

      await lineaRollup.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);

      const finalizeCall = lineaRollup
        .connect(operator)
        .finalizeBlocksWithProof(EMPTY_CALLDATA, TEST_PUBLIC_VERIFIER_INDEX, finalizationData);
      await expectRevertWithCustomError(lineaRollup, finalizeCall, "IsPaused", [GENERAL_PAUSE_TYPE]);
    });

    it("Should revert if PROVING_SYSTEM_PAUSE_TYPE is enabled", async () => {
      const finalizationData = await generateFinalizationData();

      await lineaRollup.connect(securityCouncil).pauseByType(PROVING_SYSTEM_PAUSE_TYPE);

      const finalizeCall = lineaRollup
        .connect(operator)
        .finalizeBlocksWithProof(EMPTY_CALLDATA, TEST_PUBLIC_VERIFIER_INDEX, finalizationData);
      await expectRevertWithCustomError(lineaRollup, finalizeCall, "IsPaused", [PROVING_SYSTEM_PAUSE_TYPE]);
    });

    it("Should revert if the proof is empty", async () => {
      const finalizationData = await generateFinalizationData();

      const finalizeCall = lineaRollup
        .connect(operator)
        .finalizeBlocksWithProof(EMPTY_CALLDATA, TEST_PUBLIC_VERIFIER_INDEX, finalizationData);
      await expectRevertWithCustomError(lineaRollup, finalizeCall, "ProofIsEmpty");
    });

    it("Should revert when finalization parentStateRootHash is different than last finalized state root hash", async () => {
      // Submit 4 sets of compressed data setting the correct shnarf in storage
      const submissionDataBeforeFinalization = generateCallDataSubmission(0, 4);

      let index = 0;
      for (const data of submissionDataBeforeFinalization) {
        const parentAndExpectedShnarf = generateParentAndExpectedShnarfForIndex(index);
        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(data, parentAndExpectedShnarf.parentShnarf, parentAndExpectedShnarf.expectedShnarf, {
            gasLimit: 30_000_000,
          });
        parentSubmissionData = generateParentSubmissionDataForIndex(index + 1);
        index++;
      }

      const finalizationData = await generateFinalizationData({
        lastFinalizedTimestamp: 1683325137n,
        parentStateRootHash: generateRandomBytes(32),
        aggregatedProof: aggregatedProof1To155.aggregatedProof,
        finalSubmissionData: parentSubmissionData,
      });

      const finalizeCall = lineaRollup
        .connect(operator)
        .finalizeBlocksWithProof(aggregatedProof1To155.aggregatedProof, TEST_PUBLIC_VERIFIER_INDEX, finalizationData, {
          gasLimit: 30_000_000,
        });
      await expectRevertWithCustomError(lineaRollup, finalizeCall, "StartingRootHashDoesNotMatch");
    });

    it("Should successfully finalize with only previously submitted data", async () => {
      // Submit 4 sets of compressed data setting the correct shnarf in storage
      const submissionDataBeforeFinalization = generateCallDataSubmission(0, 4);
      let index = 0;
      for (const data of submissionDataBeforeFinalization) {
        const parentAndExpectedShnarf = generateParentAndExpectedShnarfForIndex(index);
        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(data, parentAndExpectedShnarf.parentShnarf, parentAndExpectedShnarf.expectedShnarf, {
            gasLimit: 30_000_000,
          });
        parentSubmissionData = generateParentSubmissionDataForIndex(index + 1);
        index++;
      }

      const finalizationData = await generateFinalizationData({
        l1RollingHash: aggregatedProof1To155.l1RollingHash,
        l1RollingHashMessageNumber: BigInt(aggregatedProof1To155.l1RollingHashMessageNumber),
        lastFinalizedTimestamp: BigInt(aggregatedProof1To155.parentAggregationLastBlockTimestamp),
        finalBlockInData: BigInt(aggregatedProof1To155.finalBlockNumber),
        parentStateRootHash: aggregatedProof1To155.parentStateRootHash,
        finalTimestamp: BigInt(aggregatedProof1To155.finalTimestamp),
        l2MerkleRoots: aggregatedProof1To155.l2MerkleRoots,
        l2MerkleTreesDepth: BigInt(aggregatedProof1To155.l2MerkleTreesDepth),
        l2MessagingBlocksOffsets: aggregatedProof1To155.l2MessagingBlocksOffsets,
        aggregatedProof: aggregatedProof1To155.aggregatedProof,
        shnarfData: generateParentShnarfData(index),
      });

      finalizationData.lastFinalizedShnarf = generateParentSubmissionDataForIndex(0).shnarf;

      await lineaRollup.setRollingHash(
        aggregatedProof1To155.l1RollingHashMessageNumber,
        aggregatedProof1To155.l1RollingHash,
      );

      const finalizeCompressedCall = lineaRollup
        .connect(operator)
        .finalizeBlocksWithProof(aggregatedProof1To155.aggregatedProof, TEST_PUBLIC_VERIFIER_INDEX, finalizationData);
      const eventArgs = [
        BigInt(aggregatedProof1To155.finalBlockNumber),
        finalizationData.parentStateRootHash,
        fourthCompressedDataContent.finalStateRootHash,
      ];

      await expectEvent(lineaRollup, finalizeCompressedCall, "BlocksVerificationDone", eventArgs);

      const [finalStateRootHash, lastFinalizedBlockNumber, lastFinalizedState] = await Promise.all([
        lineaRollup.stateRootHashes(finalizationData.finalBlockInData),
        lineaRollup.currentL2BlockNumber(),
        lineaRollup.currentFinalizedState(),
      ]);

      expect(finalStateRootHash).to.equal(finalizationData.shnarfData.finalStateRootHash);
      expect(lastFinalizedBlockNumber).to.equal(finalizationData.finalBlockInData);
      expect(lastFinalizedState).to.equal(
        generateKeccak256(
          ["uint256", "bytes32", "uint256"],
          [
            finalizationData.l1RollingHashMessageNumber,
            finalizationData.l1RollingHash,
            finalizationData.finalTimestamp,
          ],
        ),
      );
    });

    it("Should revert if last finalized shnarf is wrong", async () => {
      // Submit 4 sets of compressed data setting the correct shnarf in storage
      const submissionDataBeforeFinalization = generateCallDataSubmission(0, 4);

      let index = 0;
      for (const data of submissionDataBeforeFinalization) {
        const parentAndExpectedShnarf = generateParentAndExpectedShnarfForIndex(index);
        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(data, parentAndExpectedShnarf.parentShnarf, parentAndExpectedShnarf.expectedShnarf, {
            gasLimit: 30_000_000,
          });
        parentSubmissionData = generateParentSubmissionDataForIndex(index + 1);
        index++;
      }

      const finalizationData = await generateFinalizationData({
        l1RollingHash: aggregatedProof1To155.l1RollingHash,
        l1RollingHashMessageNumber: BigInt(aggregatedProof1To155.l1RollingHashMessageNumber),
        lastFinalizedTimestamp: BigInt(aggregatedProof1To155.parentAggregationLastBlockTimestamp),
        finalBlockInData: BigInt(aggregatedProof1To155.finalBlockNumber),
        parentStateRootHash: aggregatedProof1To155.parentStateRootHash,
        finalTimestamp: BigInt(aggregatedProof1To155.finalTimestamp),
        l2MerkleRoots: aggregatedProof1To155.l2MerkleRoots,
        l2MerkleTreesDepth: BigInt(aggregatedProof1To155.l2MerkleTreesDepth),
        l2MessagingBlocksOffsets: aggregatedProof1To155.l2MessagingBlocksOffsets,
        aggregatedProof: aggregatedProof1To155.aggregatedProof,
        finalSubmissionData: parentSubmissionData,
        lastFinalizedShnarf: generateRandomBytes(32),
      });

      await lineaRollup.setRollingHash(
        aggregatedProof1To155.l1RollingHashMessageNumber,
        aggregatedProof1To155.l1RollingHash,
      );

      const initialShnarf = await lineaRollup.currentFinalizedShnarf();

      const finalizeCall = lineaRollup
        .connect(operator)
        .finalizeBlocksWithProof(aggregatedProof1To155.aggregatedProof, TEST_PUBLIC_VERIFIER_INDEX, finalizationData);
      await expectRevertWithCustomError(lineaRollup, finalizeCall, "LastFinalizedShnarfWrong", [
        initialShnarf,
        finalizationData.lastFinalizedShnarf,
      ]);
    });

    it("Should revert when proofType is invalid", async () => {
      const submissionDataBeforeFinalization = generateCallDataSubmission(0, 4);
      let index = 0;
      for (const data of submissionDataBeforeFinalization) {
        const parentAndExpectedShnarf = generateParentAndExpectedShnarfForIndex(index);
        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(data, parentAndExpectedShnarf.parentShnarf, parentAndExpectedShnarf.expectedShnarf, {
            gasLimit: 30_000_000,
          });
        parentSubmissionData = generateParentSubmissionDataForIndex(index + 1);
        index++;
      }

      const finalizationData = await generateFinalizationData({
        l1RollingHash: aggregatedProof1To155.l1RollingHash,
        l1RollingHashMessageNumber: BigInt(aggregatedProof1To155.l1RollingHashMessageNumber),
        lastFinalizedTimestamp: BigInt(aggregatedProof1To155.parentAggregationLastBlockTimestamp),
        finalBlockInData: BigInt(aggregatedProof1To155.finalBlockNumber),
        parentStateRootHash: aggregatedProof1To155.parentStateRootHash,
        finalTimestamp: BigInt(aggregatedProof1To155.finalTimestamp),
        l2MerkleRoots: aggregatedProof1To155.l2MerkleRoots,
        l2MerkleTreesDepth: BigInt(aggregatedProof1To155.l2MerkleTreesDepth),
        l2MessagingBlocksOffsets: aggregatedProof1To155.l2MessagingBlocksOffsets,
        aggregatedProof: aggregatedProof1To155.aggregatedProof,
        shnarfData: generateParentShnarfData(index),
      });

      finalizationData.lastFinalizedShnarf = generateParentSubmissionDataForIndex(0).shnarf;

      await lineaRollup.setRollingHash(
        aggregatedProof1To155.l1RollingHashMessageNumber,
        aggregatedProof1To155.l1RollingHash,
      );

      const finalizeCall = lineaRollup
        .connect(operator)
        .finalizeBlocksWithProof(aggregatedProof1To155.aggregatedProof, 99, finalizationData);
      await expectRevertWithCustomError(lineaRollup, finalizeCall, "InvalidProofType");
    });

    it("Should revert when using a proofType index that was removed", async () => {
      const submissionDataBeforeFinalization = generateCallDataSubmission(0, 4);
      let index = 0;
      for (const data of submissionDataBeforeFinalization) {
        const parentAndExpectedShnarf = generateParentAndExpectedShnarfForIndex(index);
        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(data, parentAndExpectedShnarf.parentShnarf, parentAndExpectedShnarf.expectedShnarf, {
            gasLimit: 30_000_000,
          });
        parentSubmissionData = generateParentSubmissionDataForIndex(index + 1);
        index++;
      }

      const finalizationData = await generateFinalizationData({
        l1RollingHash: aggregatedProof1To155.l1RollingHash,
        l1RollingHashMessageNumber: BigInt(aggregatedProof1To155.l1RollingHashMessageNumber),
        lastFinalizedTimestamp: BigInt(aggregatedProof1To155.parentAggregationLastBlockTimestamp),
        finalBlockInData: BigInt(aggregatedProof1To155.finalBlockNumber),
        parentStateRootHash: aggregatedProof1To155.parentStateRootHash,
        finalTimestamp: BigInt(aggregatedProof1To155.finalTimestamp),
        l2MerkleRoots: aggregatedProof1To155.l2MerkleRoots,
        l2MerkleTreesDepth: BigInt(aggregatedProof1To155.l2MerkleTreesDepth),
        l2MessagingBlocksOffsets: aggregatedProof1To155.l2MessagingBlocksOffsets,
        aggregatedProof: aggregatedProof1To155.aggregatedProof,
        shnarfData: generateParentShnarfData(index),
      });

      finalizationData.lastFinalizedShnarf = generateParentSubmissionDataForIndex(0).shnarf;

      await lineaRollup.setRollingHash(
        aggregatedProof1To155.l1RollingHashMessageNumber,
        aggregatedProof1To155.l1RollingHash,
      );

      // removing the verifier index
      await lineaRollup.connect(securityCouncil).unsetVerifierAddress(TEST_PUBLIC_VERIFIER_INDEX);

      const finalizeCall = lineaRollup
        .connect(operator)
        .finalizeBlocksWithProof(aggregatedProof1To155.aggregatedProof, TEST_PUBLIC_VERIFIER_INDEX, finalizationData);
      await expectRevertWithCustomError(lineaRollup, finalizeCall, "InvalidProofType");
    });

    it("Should fail when proof does not match", async () => {
      const submissionDataBeforeFinalization = generateCallDataSubmission(0, 4);
      let index = 0;
      for (const data of submissionDataBeforeFinalization) {
        const parentAndExpectedShnarf = generateParentAndExpectedShnarfForIndex(index);
        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(data, parentAndExpectedShnarf.parentShnarf, parentAndExpectedShnarf.expectedShnarf, {
            gasLimit: 30_000_000,
          });
        parentSubmissionData = generateParentSubmissionDataForIndex(index + 1);
        index++;
      }

      const finalizationData = await generateFinalizationData({
        l1RollingHash: aggregatedProof1To155.l1RollingHash,
        l1RollingHashMessageNumber: BigInt(aggregatedProof1To155.l1RollingHashMessageNumber),
        lastFinalizedTimestamp: BigInt(aggregatedProof1To155.parentAggregationLastBlockTimestamp),
        finalBlockInData: BigInt(aggregatedProof1To155.finalBlockNumber),
        parentStateRootHash: aggregatedProof1To155.parentStateRootHash,
        finalTimestamp: BigInt(aggregatedProof1To155.finalTimestamp),
        l2MerkleRoots: aggregatedProof1To155.l2MerkleRoots,
        l2MerkleTreesDepth: BigInt(aggregatedProof1To155.l2MerkleTreesDepth),
        l2MessagingBlocksOffsets: aggregatedProof1To155.l2MessagingBlocksOffsets,
        aggregatedProof: aggregatedProof1To155.aggregatedProof,
        shnarfData: generateParentShnarfData(index),
      });

      finalizationData.lastFinalizedShnarf = generateParentSubmissionDataForIndex(0).shnarf;

      await lineaRollup.setRollingHash(
        aggregatedProof1To155.l1RollingHashMessageNumber,
        aggregatedProof1To155.l1RollingHash,
      );

      //     aggregatedProof1To81.aggregatedProof, // wrong proof on purpose
      const finalizeCall = lineaRollup
        .connect(operator)
        .finalizeBlocksWithProof(aggregatedProof1To81.aggregatedProof, TEST_PUBLIC_VERIFIER_INDEX, finalizationData);
      await expectRevertWithCustomError(lineaRollup, finalizeCall, "InvalidProof");
    });

    it("Should fail if shnarf does not exist when finalizing", async () => {
      // Submit 4 sets of compressed data setting the correct shnarf in storage
      const submissionDataBeforeFinalization = generateCallDataSubmission(0, 4);
      let index = 0;
      for (const data of submissionDataBeforeFinalization) {
        const parentAndExpectedShnarf = generateParentAndExpectedShnarfForIndex(index);
        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(data, parentAndExpectedShnarf.parentShnarf, parentAndExpectedShnarf.expectedShnarf, {
            gasLimit: 30_000_000,
          });
        parentSubmissionData = generateParentSubmissionDataForIndex(index + 1);
        index++;
      }

      const finalizationData = await generateFinalizationData({
        l1RollingHash: aggregatedProof1To155.l1RollingHash,
        l1RollingHashMessageNumber: BigInt(aggregatedProof1To155.l1RollingHashMessageNumber),
        lastFinalizedTimestamp: BigInt(aggregatedProof1To155.parentAggregationLastBlockTimestamp),
        finalBlockInData: BigInt(aggregatedProof1To155.finalBlockNumber),
        parentStateRootHash: aggregatedProof1To155.parentStateRootHash,
        finalTimestamp: BigInt(aggregatedProof1To155.finalTimestamp),
        l2MerkleRoots: aggregatedProof1To155.l2MerkleRoots,
        l2MerkleTreesDepth: BigInt(aggregatedProof1To155.l2MerkleTreesDepth),
        l2MessagingBlocksOffsets: aggregatedProof1To155.l2MessagingBlocksOffsets,
        aggregatedProof: aggregatedProof1To155.aggregatedProof,
        shnarfData: generateParentShnarfData(1),
      });

      finalizationData.lastFinalizedShnarf = generateParentSubmissionDataForIndex(1).shnarf;

      await lineaRollup.setRollingHash(
        aggregatedProof1To155.l1RollingHashMessageNumber,
        aggregatedProof1To155.l1RollingHash,
      );

      const finalizeCall = lineaRollup
        .connect(operator)
        .finalizeBlocksWithProof(aggregatedProof1To155.aggregatedProof, TEST_PUBLIC_VERIFIER_INDEX, finalizationData);
      await expectRevertWithCustomError(lineaRollup, finalizeCall, "LastFinalizedShnarfWrong", [
        aggregatedProof1To155.parentAggregationFinalShnarf,
        finalizationData.lastFinalizedShnarf,
      ]);
    });

    it("Should successfully finalize 1-81 and then 82-153 in two separate finalizations", async () => {
      // Submit all the data
      const submissionDataBeforeFinalization = generateCallDataSubmissionMultipleProofs(0, 4);
      let index = 0;
      for (const data of submissionDataBeforeFinalization) {
        const parentAndExpectedShnarf = generateParentAndExpectedShnarfForMulitpleIndex(index);
        await lineaRollup
          .connect(operator)
          .submitDataAsCalldata(data, parentAndExpectedShnarf.parentShnarf, parentAndExpectedShnarf.expectedShnarf, {
            gasLimit: 30_000_000,
          });
        index++;
        parentSubmissionData = generateParentSubmissionDataForIndexForMultiple(index);
      }

      let finalizationData = await generateFinalizationData({
        l1RollingHash: aggregatedProof1To81.l1RollingHash,
        l1RollingHashMessageNumber: BigInt(aggregatedProof1To81.l1RollingHashMessageNumber),
        lastFinalizedTimestamp: BigInt(aggregatedProof1To81.parentAggregationLastBlockTimestamp),
        finalBlockInData: BigInt(aggregatedProof1To81.finalBlockNumber),
        parentStateRootHash: aggregatedProof1To81.parentStateRootHash,
        finalTimestamp: BigInt(aggregatedProof1To81.finalTimestamp),
        l2MerkleRoots: aggregatedProof1To81.l2MerkleRoots,
        l2MerkleTreesDepth: BigInt(aggregatedProof1To81.l2MerkleTreesDepth),
        l2MessagingBlocksOffsets: aggregatedProof1To81.l2MessagingBlocksOffsets,
        aggregatedProof: aggregatedProof1To81.aggregatedProof,
        shnarfData: generateParentShnarfData(2, true),
      });

      finalizationData.lastFinalizedShnarf = generateParentSubmissionDataForIndex(0).shnarf;

      // pre-configure messaging etc.
      await lineaRollup.setRollingHash(
        aggregatedProof1To81.l1RollingHashMessageNumber,
        aggregatedProof1To81.l1RollingHash,
      );

      const finalizeCompressedCall = lineaRollup
        .connect(operator)
        .finalizeBlocksWithProof(aggregatedProof1To81.aggregatedProof, TEST_PUBLIC_VERIFIER_INDEX, finalizationData);

      const eventArgs = [
        BigInt(aggregatedProof1To81.finalBlockNumber),
        finalizationData.parentStateRootHash,
        secondCompressedDataContent.finalStateRootHash,
      ];

      // The state root hash has to be in the params because it needs to occur after the call to finalize.
      await expectEvent(lineaRollup, finalizeCompressedCall, "BlocksVerificationDone", eventArgs);

      let [finalStateRootHash, lastFinalizedBlockNumber, lastFinalizedState] = await Promise.all([
        lineaRollup.stateRootHashes(finalizationData.finalBlockInData),
        lineaRollup.currentL2BlockNumber(),
        lineaRollup.currentFinalizedState(),
      ]);

      expect(finalStateRootHash).to.equal(finalizationData.shnarfData.finalStateRootHash);
      expect(lastFinalizedBlockNumber).to.equal(finalizationData.finalBlockInData);
      expect(lastFinalizedState).to.equal(
        generateKeccak256(
          ["uint256", "bytes32", "uint256"],
          [
            finalizationData.l1RollingHashMessageNumber,
            finalizationData.l1RollingHash,
            finalizationData.finalTimestamp,
          ],
        ),
      );

      // // generate finalization for 82-153
      finalizationData = await generateFinalizationData({
        l1RollingHash: aggregatedProof82To153.l1RollingHash,
        l1RollingHashMessageNumber: BigInt(aggregatedProof82To153.l1RollingHashMessageNumber),
        lastFinalizedTimestamp: BigInt(aggregatedProof82To153.parentAggregationLastBlockTimestamp),
        finalBlockInData: BigInt(aggregatedProof82To153.finalBlockNumber),
        parentStateRootHash: aggregatedProof82To153.parentStateRootHash,
        finalTimestamp: BigInt(aggregatedProof82To153.finalTimestamp),
        l2MerkleRoots: aggregatedProof82To153.l2MerkleRoots,
        l2MerkleTreesDepth: BigInt(aggregatedProof82To153.l2MerkleTreesDepth),
        l2MessagingBlocksOffsets: aggregatedProof82To153.l2MessagingBlocksOffsets,
        aggregatedProof: aggregatedProof82To153.aggregatedProof,
        lastFinalizedL1RollingHash: aggregatedProof1To81.l1RollingHash,
        lastFinalizedL1RollingHashMessageNumber: BigInt(aggregatedProof1To81.l1RollingHashMessageNumber),
        shnarfData: generateParentShnarfData(index, true),
      });

      // // configure messaging - all other parent/child relationships should already exist
      await lineaRollup.setRollingHash(
        aggregatedProof82To153.l1RollingHashMessageNumber,
        aggregatedProof82To153.l1RollingHash,
      );

      finalizationData.lastFinalizedShnarf = generateParentSubmissionDataForIndex(2).shnarf;

      // // This should cover the verification of the state root hash and block number 82 being the same
      await expect(
        await lineaRollup
          .connect(operator)
          .finalizeBlocksWithProof(
            aggregatedProof82To153.aggregatedProof,
            TEST_PUBLIC_VERIFIER_INDEX,
            finalizationData,
          ),
      )
        .to.emit(lineaRollup, "BlocksVerificationDone")
        .withArgs(
          BigInt(aggregatedProof82To153.finalBlockNumber),
          finalizationData.parentStateRootHash,
          await lineaRollup.stateRootHashes(BigInt(aggregatedProof82To153.finalBlockNumber)),
        );

      [finalStateRootHash, lastFinalizedBlockNumber, lastFinalizedState] = await Promise.all([
        lineaRollup.stateRootHashes(finalizationData.finalBlockInData),
        lineaRollup.currentL2BlockNumber(),
        lineaRollup.currentFinalizedState(),
      ]);

      expect(finalStateRootHash).to.equal(finalizationData.shnarfData.finalStateRootHash);
      expect(lastFinalizedBlockNumber).to.equal(finalizationData.finalBlockInData);
      expect(lastFinalizedState).to.equal(
        generateKeccak256(
          ["uint256", "bytes32", "uint256"],
          [
            finalizationData.l1RollingHashMessageNumber,
            finalizationData.l1RollingHash,
            finalizationData.finalTimestamp,
          ],
        ),
      );
    });
  });

  describe("Validate L2 computed rolling hash", () => {
    it("Should revert if l1 message number == 0 and l1 rolling hash is not empty", async () => {
      const l1MessageNumber = 0;
      const l1RollingHash = generateRandomBytes(32);

      await expectRevertWithCustomError(
        lineaRollup,
        lineaRollup.validateL2ComputedRollingHash(l1MessageNumber, l1RollingHash),
        "MissingMessageNumberForRollingHash",
        [l1RollingHash],
      );
    });

    it("Should revert if l1 message number != 0 and l1 rolling hash is empty", async () => {
      const l1MessageNumber = 1n;
      const l1RollingHash = HASH_ZERO;

      await expectRevertWithCustomError(
        lineaRollup,
        lineaRollup.validateL2ComputedRollingHash(l1MessageNumber, l1RollingHash),
        "MissingRollingHashForMessageNumber",
        [l1MessageNumber],
      );
    });

    it("Should revert if l1RollingHash does not exist on L1", async () => {
      const l1MessageNumber = 1n;
      const l1RollingHash = generateRandomBytes(32);

      await expectRevertWithCustomError(
        lineaRollup,
        lineaRollup.validateL2ComputedRollingHash(l1MessageNumber, l1RollingHash),
        "L1RollingHashDoesNotExistOnL1",
        [l1MessageNumber, l1RollingHash],
      );
    });

    it("Should succeed if l1 message number == 0 and l1 rolling hash is empty", async () => {
      const l1MessageNumber = 0;
      const l1RollingHash = HASH_ZERO;
      await expect(lineaRollup.validateL2ComputedRollingHash(l1MessageNumber, l1RollingHash)).to.not.be.reverted;
    });

    it("Should succeed if l1 message number != 0, l1 rolling hash is not empty and exists on L1", async () => {
      const l1MessageNumber = 1n;
      const messageHash = generateRandomBytes(32);

      await lineaRollup.addRollingHash(l1MessageNumber, messageHash);

      const l1RollingHash = calculateRollingHash(HASH_ZERO, messageHash);

      await expect(lineaRollup.validateL2ComputedRollingHash(l1MessageNumber, l1RollingHash)).to.not.be.reverted;
    });
  });

  describe("Calculate Y value for Compressed Data", () => {
    it("Should successfully calculate y", async () => {
      const compressedDataBytes = ethers.decodeBase64(compressedData);

      expect(await lineaRollup.calculateY(compressedDataBytes, expectedX, { gasLimit: 30_000_000 })).to.equal(
        expectedY,
      );
    });

    it("Should revert if first byte is no zero", async () => {
      const compressedDataBytes = encodeData(
        ["bytes32", "bytes32", "bytes32"],
        [generateRandomBytes(32), HASH_WITHOUT_ZERO_FIRST_BYTE, generateRandomBytes(32)],
      );

      await expectRevertWithCustomError(
        lineaRollup,
        lineaRollup.calculateY(compressedDataBytes, expectedX, { gasLimit: 30_000_000 }),
        "FirstByteIsNotZero",
      );
    });

    it("Should revert if bytes length is not a multiple of 32", async () => {
      const compressedDataBytes = generateRandomBytes(56);

      await expectRevertWithCustomError(
        lineaRollup,
        lineaRollup.calculateY(compressedDataBytes, expectedX, { gasLimit: 30_000_000 }),
        "BytesLengthNotMultipleOf32",
      );
    });
  });
});
