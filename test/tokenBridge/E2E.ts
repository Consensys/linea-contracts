import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { deployTokenBridgeWithMockMessaging } from "../../scripts/tokenBridge/test/deployTokenBridges";
import { deployTokens } from "../../scripts/tokenBridge/test/deployTokens";

const initialUserBalance = BigNumber.from(10 ** 9);
const RESERVED_STATUS = ethers.utils.getAddress("0x0000000000000000000000000000000000000111");
const NATIVE_STATUS = ethers.utils.getAddress("0x0000000000000000000000000000000000000222");
const DEPLOYED_STATUS = ethers.utils.getAddress("0x0000000000000000000000000000000000000333");
const mockName = "L1 DAI";
const mockSymbol = "L1DAI";
const mockDecimals = 18;

describe("E2E tests", function () {
  async function deployContractsFixture() {
    const [deployer, user] = await ethers.getSigners();

    // Deploy and configure bridges
    const deploymentFixture = await deployTokenBridgeWithMockMessaging();

    // Deploy tokens
    const tokens = await deployTokens();

    // Mint tokens for user and approve bridge
    for (const name in tokens) {
      const token = tokens[name];
      await token.mint(user.address, initialUserBalance);

      let bridgeAddress;
      if ((await token.name()).includes("L1")) {
        bridgeAddress = deploymentFixture.l1TokenBridge.address;
      }
      if ((await token.name()).includes("L2")) {
        bridgeAddress = deploymentFixture.l2TokenBridge.address;
      }

      await token.connect(user).approve(bridgeAddress, ethers.constants.MaxUint256);
    }

    const encodedData = ethers.utils.defaultAbiCoder.encode(
      ["string", "string", "uint8"],
      [mockName, mockSymbol, mockDecimals],
    );

    return { deployer, user, ...deploymentFixture, tokens, encodedData };
  }

  describe("Bridging", function () {
    it("Should have the correct balance and totalSupply on both chains after bridging", async function () {
      const {
        user,
        l1TokenBridge,
        l2TokenBridge,
        tokens: { L1DAI },
      } = await loadFixture(deployContractsFixture);
      const bridgeAmount = 100;

      await l1TokenBridge.connect(user).bridgeToken(L1DAI.address, bridgeAmount, user.address);

      const userBalance = initialUserBalance.toNumber() - bridgeAmount;
      expect(await L1DAI.balanceOf(user.address)).to.be.equal(userBalance);
      expect(await L1DAI.balanceOf(l1TokenBridge.address)).to.be.equal(bridgeAmount);

      const l2TokenAddress = await l2TokenBridge.nativeToBridgedToken(L1DAI.address);
      const BridgedToken = await ethers.getContractFactory("BridgedToken");
      const l2Token = BridgedToken.attach(l2TokenAddress);

      expect(await l2Token.balanceOf(user.address)).to.be.equal(bridgeAmount);
      expect(await l2Token.totalSupply()).to.be.equal(bridgeAmount);
    });

    it("Should have the correct balance and totalSupply on both chains after back and forth bridging", async function () {
      const {
        user,
        l1TokenBridge,
        l2TokenBridge,
        tokens: { L1DAI },
      } = await loadFixture(deployContractsFixture);
      const firstBridgeAmount = 100;
      const secondBridgeAmount = 30;
      const netBridgedAmount = firstBridgeAmount - secondBridgeAmount;

      await l1TokenBridge.connect(user).bridgeToken(L1DAI.address, firstBridgeAmount, user.address);

      const l2TokenAddress = await l2TokenBridge.nativeToBridgedToken(L1DAI.address);
      const BridgedToken = await ethers.getContractFactory("BridgedToken");
      const l2Token = BridgedToken.attach(l2TokenAddress);

      expect(await l2Token.allowance(user.address, l2TokenBridge.address)).to.be.equal(0);
      await expect(
        l2TokenBridge.connect(user).bridgeToken(l2TokenAddress, secondBridgeAmount, user.address),
      ).to.be.revertedWith("ERC20: insufficient allowance");

      await l2Token.connect(user).approve(l2TokenBridge.address, secondBridgeAmount);
      await l2TokenBridge.connect(user).bridgeToken(l2TokenAddress, secondBridgeAmount, user.address);

      const userBalance = initialUserBalance.toNumber() - netBridgedAmount;
      expect(await L1DAI.balanceOf(user.address)).to.be.equal(userBalance);
      expect(await L1DAI.balanceOf(l1TokenBridge.address)).to.be.equal(netBridgedAmount);
      expect(await l2Token.balanceOf(user.address)).to.be.equal(netBridgedAmount);
      expect(await l2Token.totalSupply()).to.be.equal(netBridgedAmount);
    });

    it("Should support fee tokens and set balances correctly", async function () {
      const { user, l1TokenBridge, l2TokenBridge } = await loadFixture(deployContractsFixture);

      const ERC20 = await ethers.getContractFactory("ERC20Fees");

      const feeToken = await ERC20.deploy("Token with fee", "FEE", 200); // 2% fee
      await feeToken.deployed();

      // Mint tokens for user and approve bridge
      await feeToken.mint(user.address, initialUserBalance);
      await feeToken.connect(user).approve(l1TokenBridge.address, ethers.constants.MaxUint256);

      // Transfer some tokens from the user to the contract
      const amountToTransfer = BigNumber.from(100);
      await l1TokenBridge.connect(user).bridgeToken(feeToken.address, amountToTransfer, user.address);

      // Calculate actual transfered amount
      const burnAmount = amountToTransfer.mul(2).div(100); // 2% fee
      const transferredAmount = amountToTransfer.sub(burnAmount);

      // Get bridged token address
      const l2FeeTokenAddress = await l2TokenBridge.nativeToBridgedToken(feeToken.address);
      const l2FeeToken = ERC20.attach(l2FeeTokenAddress);

      // Check balances and total supply
      expect(await feeToken.balanceOf(user.address)).to.be.equal(initialUserBalance.sub(amountToTransfer));
      expect(await feeToken.balanceOf(l1TokenBridge.address)).to.be.equal(transferredAmount);
      expect(await l2FeeToken.balanceOf(user.address)).to.be.equal(transferredAmount);
      expect(await l2FeeToken.totalSupply()).to.be.equal(transferredAmount);
    });

    it("Should not be able to bridge 0 tokens", async function () {
      const {
        user,
        l1TokenBridge,
        tokens: { L1DAI },
      } = await loadFixture(deployContractsFixture);
      const bridgeAmount = 0;

      await expect(
        l1TokenBridge.connect(user).bridgeToken(L1DAI.address, bridgeAmount, user.address),
      ).to.be.revertedWithCustomError(l1TokenBridge, "ZeroAmountNotAllowed");
    });

    it("Should not be able to bridge if token is the 0 address", async function () {
      const { user, l1TokenBridge } = await loadFixture(deployContractsFixture);
      const bridgeAmount = 10;

      await expect(
        l1TokenBridge.connect(user).bridgeToken(ethers.constants.AddressZero, bridgeAmount, user.address),
      ).to.be.revertedWithCustomError(l1TokenBridge, "ZeroAddressNotAllowed");
    });

    describe("BridgedToken deployment", function () {
      it("Should return NO_NAME and NO_SYMBOL when the token does not have them.", async function () {
        const { user, l1TokenBridge, l2TokenBridge } = await loadFixture(deployContractsFixture);

        const ERC20 = await ethers.getContractFactory("MockERC20NoNameMintBurn");
        const noNameToken = await ERC20.deploy();
        await noNameToken.mint(user.address, initialUserBalance);
        await noNameToken.connect(user).approve(l1TokenBridge.address, ethers.constants.MaxUint256);

        const bridgeAmount = 100;

        await l1TokenBridge.connect(user).bridgeToken(noNameToken.address, bridgeAmount, user.address);

        const l2TokenAddress = await l2TokenBridge.nativeToBridgedToken(noNameToken.address);
        const BridgedToken = await ethers.getContractFactory("BridgedToken");
        const l2Token = BridgedToken.attach(l2TokenAddress);

        await l2Token.connect(user).approve(l2TokenBridge.address, bridgeAmount);
        await l2TokenBridge.connect(user).bridgeToken(l2TokenAddress, bridgeAmount, user.address);

        expect(await l2Token.name()).to.be.equal("NO_NAME");
        expect(await l2Token.symbol()).to.be.equal("NO_SYMBOL");
      });
      it("Should return UNKNOWN or create a byte array for weird name and symbol.", async function () {
        const { user, l1TokenBridge, l2TokenBridge } = await loadFixture(deployContractsFixture);

        const ERC20 = await ethers.getContractFactory("MockERC20WeirdNameSymbol");
        const noNameToken = await ERC20.deploy();
        await noNameToken.mint(user.address, initialUserBalance);
        await noNameToken.connect(user).approve(l1TokenBridge.address, ethers.constants.MaxUint256);

        const bridgeAmount = 100;

        await l1TokenBridge.connect(user).bridgeToken(noNameToken.address, bridgeAmount, user.address);

        const l2TokenAddress = await l2TokenBridge.nativeToBridgedToken(noNameToken.address);
        const BridgedToken = await ethers.getContractFactory("BridgedToken");
        const l2Token = BridgedToken.attach(l2TokenAddress);

        await l2Token.connect(user).approve(l2TokenBridge.address, bridgeAmount);
        await l2TokenBridge.connect(user).bridgeToken(l2TokenAddress, bridgeAmount, user.address);

        expect(await l2Token.name()).to.be.equal("UNKNOWN");
        expect(await l2Token.symbol()).to.be.equal("\u0001");
      });

      it("Should revert if a token being bridged exists as a native token on the other layer", async function () {
        const {
          user,
          l1TokenBridge,
          l2TokenBridge,
          tokens: { L1DAI },
        } = await loadFixture(deployContractsFixture);

        // If a contract has been deployed with CREATE2 with the exact same parameters on both layers
        // we will have the exact same address on both layers
        // The token bridge should allow the user to bridge the token from one layer only as a "native" token
        // We can not have 2 "native" tokens with the same address on both layers, it should revert if that happens

        const bridgeAmount = 100;
        await l1TokenBridge.connect(user).bridgeToken(L1DAI.address, bridgeAmount, user.address);

        await L1DAI.connect(user).approve(l2TokenBridge.address, bridgeAmount);
        await expect(
          l2TokenBridge.connect(user).bridgeToken(L1DAI.address, bridgeAmount, user.address),
        ).to.be.revertedWithCustomError(l2TokenBridge, "TokenNativeOnOtherLayer");
      });
    });
  });

  describe("setCustomContract", function () {
    it("Should mint and burn correctly from a target contract", async function () {
      const {
        user,
        l1TokenBridge,
        l2TokenBridge,
        tokens: { L1USDT },
      } = await loadFixture(deployContractsFixture);
      const amountBridged = 100;
      const amountBridgedBack = 100;

      // Deploy custom contract
      const CustomContract = await ethers.getContractFactory("MockERC20MintBurn");
      const customContract = await CustomContract.deploy("CustomContract", "CC");

      // Set custom contract
      await l2TokenBridge.setCustomContract(L1USDT.address, customContract.address);

      // Bridge token (allowance has been set in the fixture)
      await l1TokenBridge.connect(user).bridgeToken(L1USDT.address, amountBridged, user.address);

      expect(await L1USDT.balanceOf(l1TokenBridge.address)).to.be.equal(amountBridged);
      expect(await customContract.balanceOf(user.address)).to.be.equal(amountBridged);
      expect(await customContract.totalSupply()).to.be.equal(amountBridged);

      // Bridge back
      const USDTBalanceBefore = await L1USDT.balanceOf(user.address);
      await l2TokenBridge.connect(user).bridgeToken(customContract.address, amountBridgedBack, user.address);
      const USDTBalanceAfter = await L1USDT.balanceOf(user.address);

      expect(await customContract.balanceOf(user.address)).to.be.equal(amountBridged - amountBridgedBack);
      expect(await customContract.totalSupply()).to.be.equal(amountBridged - amountBridgedBack);
      expect(USDTBalanceAfter - USDTBalanceBefore).to.be.equal(amountBridgedBack);
    });

    it("Should not be able to set a custom contract that is already a bridged token contract or one of the STATUS", async function () {
      const {
        user,
        l1TokenBridge,
        l2TokenBridge,
        tokens: { L1USDT, L2UNI },
      } = await loadFixture(deployContractsFixture);
      const amountBridged = 100;

      await l1TokenBridge.connect(user).bridgeToken(L1USDT.address, amountBridged, user.address);

      const brigedToNativeContract = await l2TokenBridge.nativeToBridgedToken(L1USDT.address);

      // Try to set custom contract with a bridgedTokenContract, should revert
      await expect(
        l2TokenBridge.setCustomContract(L2UNI.address, brigedToNativeContract),
      ).to.be.revertedWithCustomError(l2TokenBridge, "AlreadyBrigedToNativeTokenSet");

      await expect(l2TokenBridge.setCustomContract(L2UNI.address, RESERVED_STATUS)).to.be.revertedWithCustomError(
        l2TokenBridge,
        "StatusAddressNotAllowed",
      );

      await expect(l2TokenBridge.setCustomContract(L2UNI.address, NATIVE_STATUS)).to.be.revertedWithCustomError(
        l2TokenBridge,
        "StatusAddressNotAllowed",
      );

      await expect(l2TokenBridge.setCustomContract(L2UNI.address, DEPLOYED_STATUS)).to.be.revertedWithCustomError(
        l2TokenBridge,
        "StatusAddressNotAllowed",
      );
    });
  });

  describe("Reserved tokens", function () {
    it("Should be possible for the admin to reserve a token", async function () {
      const {
        deployer,
        l1TokenBridge,
        tokens: { L1DAI },
      } = await loadFixture(deployContractsFixture);
      await expect(l1TokenBridge.connect(deployer).setReserved(L1DAI.address)).not.to.be.revertedWith(
        "TokenBridge: token already bridged",
      );
      expect(await l1TokenBridge.nativeToBridgedToken(L1DAI.address)).to.be.equal(RESERVED_STATUS);
    });

    it("Should not be possible to bridge reserved tokens", async function () {
      const {
        deployer,
        user,
        l1TokenBridge,
        tokens: { L1DAI },
      } = await loadFixture(deployContractsFixture);
      await l1TokenBridge.connect(deployer).setReserved(L1DAI.address);
      await expect(
        l1TokenBridge.connect(user).bridgeToken(L1DAI.address, 1, user.address),
      ).to.be.revertedWithCustomError(l1TokenBridge, "ReservedToken");
    });

    it("Should only be possible to reserve a token if it has not been bridged before", async function () {
      const {
        deployer,
        user,
        l1TokenBridge,
        tokens: { L1DAI },
      } = await loadFixture(deployContractsFixture);
      l1TokenBridge.connect(user).bridgeToken(L1DAI.address, 1, user.address);
      await expect(l1TokenBridge.connect(deployer).setReserved(L1DAI.address)).to.be.revertedWithCustomError(
        l1TokenBridge,
        "AlreadyBridgedToken",
      );
    });
  });

  describe("Modifying Message Service", function () {
    it("Should be able to modify the Message Service and bridge properly", async function () {
      const {
        deployer,
        user,
        l1TokenBridge,
        l2TokenBridge,
        tokens: { L1DAI },
      } = await loadFixture(deployContractsFixture);
      // Deploy new Message Service
      const MessageServiceFactory = await ethers.getContractFactory("MockMessageService");
      const messageService = await MessageServiceFactory.deploy();
      await messageService.deployed();

      await l1TokenBridge.connect(deployer).setMessageService(messageService.address);
      await l2TokenBridge.connect(deployer).setMessageService(messageService.address);

      const bridgeAmount = 100;

      await l1TokenBridge.connect(user).bridgeToken(L1DAI.address, bridgeAmount, user.address);

      const userBalance = initialUserBalance.toNumber() - bridgeAmount;
      expect(await L1DAI.balanceOf(user.address)).to.be.equal(userBalance);
      expect(await L1DAI.balanceOf(l1TokenBridge.address)).to.be.equal(bridgeAmount);

      const l2TokenAddress = await l2TokenBridge.nativeToBridgedToken(L1DAI.address);
      const BridgedToken = await ethers.getContractFactory("BridgedToken");
      const l2Token = BridgedToken.attach(l2TokenAddress);

      expect(await l2Token.balanceOf(user.address)).to.be.equal(bridgeAmount);
      expect(await l2Token.totalSupply()).to.be.equal(bridgeAmount);
    });

    it("Should no be able to set Message Service by non-owner caller", async function () {
      const { user, l1TokenBridge } = await loadFixture(deployContractsFixture);
      // Deploy new Message Service
      const MessageServiceFactory = await ethers.getContractFactory("MockMessageService");
      const messageService = await MessageServiceFactory.deploy();
      await messageService.deployed();

      await expect(l1TokenBridge.connect(user).setMessageService(messageService.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("Should emit en event when updating the Message Service", async function () {
      const { l1TokenBridge } = await loadFixture(deployContractsFixture);
      // Deploy new Message Service
      const MessageServiceFactory = await ethers.getContractFactory("MockMessageService");
      const messageService = await MessageServiceFactory.deploy();
      await messageService.deployed();

      const oldMessageService = await l1TokenBridge.messageService();
      await expect(l1TokenBridge.setMessageService(messageService.address))
        .to.emit(l1TokenBridge, "MessageServiceUpdated")
        .withArgs(messageService.address, oldMessageService);
    });
  });

  describe("Token deployment status", function () {
    it("Should set correct deployment status on both chain", async function () {
      const {
        user,
        l1TokenBridge,
        l2TokenBridge,
        tokens: { L1DAI, L1USDT },
      } = await loadFixture(deployContractsFixture);

      const bridgeAmount = 100;
      await l1TokenBridge.connect(user).bridgeToken(L1DAI.address, bridgeAmount, user.address);
      await l1TokenBridge.connect(user).bridgeToken(L1USDT.address, bridgeAmount, user.address);

      expect(await l1TokenBridge.nativeToBridgedToken(L1DAI.address)).to.be.equal(NATIVE_STATUS);
      expect(await l1TokenBridge.nativeToBridgedToken(L1USDT.address)).to.be.equal(NATIVE_STATUS);

      const L2DAIBridgedAddress = await l2TokenBridge.nativeToBridgedToken(L1DAI.address);
      const L2USDTBridgedAddress = await l2TokenBridge.nativeToBridgedToken(L1USDT.address);

      await l2TokenBridge.confirmDeployment([L2DAIBridgedAddress, L2USDTBridgedAddress]);

      expect(await l1TokenBridge.nativeToBridgedToken(L1DAI.address)).to.be.equal(DEPLOYED_STATUS);
      expect(await l1TokenBridge.nativeToBridgedToken(L1USDT.address)).to.be.equal(DEPLOYED_STATUS);

      // Should not revert
      await expect(l1TokenBridge.connect(user).bridgeToken(L1DAI.address, bridgeAmount, user.address)).to.be.not
        .reverted;

      // @TODO: check metadata are not sent for new L1DAI tx
    });

    it("Should revert when trying to change the status of a token that has not been deployed yet", async function () {
      const {
        user,
        l1TokenBridge,
        l2TokenBridge,
        tokens: { L1DAI, L1USDT },
      } = await loadFixture(deployContractsFixture);

      const bridgeAmount = 100;
      await l1TokenBridge.connect(user).bridgeToken(L1DAI.address, bridgeAmount, user.address);

      const L2DAIBridgedAddress = await l2TokenBridge.nativeToBridgedToken(L1DAI.address);
      await expect(
        l2TokenBridge.confirmDeployment([L2DAIBridgedAddress, L1USDT.address]),
      ).to.be.revertedWithCustomError(l2TokenBridge, "TokenNotDeployed");
    });

    it("Should be able to bridge back to the original layer if that token is marked as DEPLOYED", async function () {
      const {
        user,
        l1TokenBridge,
        l2TokenBridge,
        tokens: { L1DAI },
      } = await loadFixture(deployContractsFixture);
      const bridgeAmount = 10;

      const initialAmount = await L1DAI.balanceOf(user.address);
      await l1TokenBridge.connect(user).bridgeToken(L1DAI.address, bridgeAmount, user.address);
      const L2DAIBridgedAddress = await l2TokenBridge.nativeToBridgedToken(L1DAI.address);
      await l2TokenBridge.confirmDeployment([L2DAIBridgedAddress]);

      expect(await L1DAI.balanceOf(user.address)).to.be.equal(initialAmount.sub(bridgeAmount));
      expect(await L1DAI.attach(L2DAIBridgedAddress).balanceOf(user.address)).to.be.equal(bridgeAmount);
      expect(await l1TokenBridge.nativeToBridgedToken(L1DAI.address)).to.be.equal(DEPLOYED_STATUS);

      await L1DAI.attach(L2DAIBridgedAddress).connect(user).approve(l2TokenBridge.address, bridgeAmount);
      await l2TokenBridge.connect(user).bridgeToken(L2DAIBridgedAddress, bridgeAmount, user.address);

      expect(await L1DAI.balanceOf(user.address)).to.be.equal(initialAmount);
    });
  });
});
