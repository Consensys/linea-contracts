import { deployUpgradableFromFactory, requireEnv } from "../hardhat/utils";

async function main() {
  // L2 MESSAGE SERVICE DEPLOYED AS UPGRADEABLE PROXY
  const L2MessageService_securityCouncil = requireEnv("L2MSGSERVICE_SECURITY_COUNCIL");
  const L2MessageService_l1l2MessageSetter = requireEnv("L2MSGSERVICE_L1L2_MESSAGE_SETTER");
  const L2MessageService_rateLimitPeriod = requireEnv("L2MSGSERVICE_RATE_LIMIT_PERIOD");
  const L2MessageService_rateLimitAmount = requireEnv("L2MSGSERVICE_RATE_LIMIT_AMOUNT");

  const L2implementation = await deployUpgradableFromFactory(
    "L2MessageService",
    [
      L2MessageService_securityCouncil,
      L2MessageService_l1l2MessageSetter,
      L2MessageService_rateLimitPeriod,
      L2MessageService_rateLimitAmount,
    ],
    {
      initializer: "initialize(address,address,uint256,uint256)",
      unsafeAllow: ["constructor"],
    },
  );
  console.log(`L2MessageService deployed at ${L2implementation.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
