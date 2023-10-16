# Linea Operational Scripts
<br />

This document aims to explain how to run the Linea operational scripts. There are several ways the scripts can be executed dependant if you have an environment file (.env) or not. 

Running the script with an .env file set, you will need to make sure that the correct variables are set in the .env file, considering the network that you're deploying on. In this way, when the script is being run, it will take the variables it needs to execute the script from that .env file. 

Running the script without an .env file will require you to place the variables as command-line arguments.
The command-line arguments will create or replace existing .env (only in memory) environment variables. If the variables are provided in the terminal as command-line arguments, they will have priority over the same variables if they are defined in the .env file. These need not exist in the .env file.

<br />

## Network specific variables

Dependant on which network you are using, a specific network private key needs to be used, as well as the corresponding API Key or RPC URL.  The following table highlights which private key variable will be used per network. Please use the variable that pertains to the network. e.g. for `linea_goerli` use `LINEA_GOERLI_PRIVATE_KEY` (`LINEA_GOERLI_PRIVATE_KEY=<key> INFURA_API_KEY=<key>`)  

| Network       | Private key parameter name   | API Key / RPC URL |
| ------------- | ----------------- | ---- | 
| goerli    | GOERLI_PRIVATE_KEY    | INFURA_API_KEY  |
| linea_goerli | LINEA_GOERLI_PRIVATE_KEY   | INFURA_API_KEY  |
| mainnet   | MAINNET_PRIVATE_KEY | INFURA_API_KEY | 
| linea_mainnet | LINEA_MAINNET_PRIVATE_KEY |  INFURA_API_KEY  | 
| custom    | CUSTOM_PRIVATE_KEY | CUSTOM_BLOCKCHAIN_URL | 
| zkevm_dev | PRIVATE_KEY | BLOCKCHAIN_NODE or L2_BLOCKCHAIN_NODE | 


<br />
<br />

### getCurrentFinalizedBlockNumber
<br />
Parameters that should be filled either in .env or passed as CLI arguments:

| Parameter name        | Required | Input Value | Description |
| ------------------ | -------- | ---------- | ----------- |
| \**PRIVATE_KEY* | true     | key | Network-specific private key used when deploying the contract |
| INFURA_API_KEY     | true     | key | Infura API Key |
| CONTRACT_TYPE   | true    | Contract name | Contract name parameter. If ommited in the .env, it must be provided as CLI argument using the `--contract-type` flag |
| PROXY_ADDRESS | true | address | Proxy contract address. If ommited in the .env, it must be provided as CLI argument using the `--proxy-address` flag| 


<br />

Base command:

```shell
npx hardhat getCurrentFinalizedBlockNumber --network goerli
```

Base command with cli arguments:

```shell
GOERLI_PRIVATE_KEY=<key> \
INFURA_API_KEY=<key> \
npx hardhat getCurrentFinalizedBlockNumber \
--contract-type <string> \
--proxy-address <address> \
--network goerli
```

(make sure to replace `<key>` with actual values)

<br />
<br />

### grantContractRoles

<br />
Parameters that should be filled either in .env or passed as CLI arguments:

| Parameter name        | Required | Input Value | Description |
| ------------------ | -------- | ---------- | ----------- |
| \**PRIVATE_KEY* | true     | key | Network-specific private key used when deploying the contract |
| INFURA_API_KEY     | true     | key | Infura API Key |
| CONTRACT_TYPE   | true    | Contract name | Contract name parameter. If ommited in the .env, it must be provided as CLI argument using the `--contract-type` flag |
| PROXY_ADDRESS | true | address | Proxy contract address. If ommited in the .env, it must be provided as CLI argument using the `--proxy-address` flag| 
| ADMIN_ADDRESS | true | address | Admin address to which role will be granted. If ommited in the .env, it must be provided as CLI argument using the `--admin-address` flag| 
| CONTRACT_ROLES | true | bytes | Comma-separated list of bytes32-formatted roles that will be granted to the Admin address. If ommited in the .env, it must be provided as CLI argument using the `--contract-roles` flag| 

<br />

Base command:
```shell
npx hardhat grantContractRoles --network goerli
```

Base command with cli arguments:

```shell
GOERLI_PRIVATE_KEY=<key> \
INFURA_API_KEY=<key> \
npx hardhat grantContractRoles \
--admin-address <address>  \
--proxy-address <address>  \
--contract-type <string> \
--contract-roles <bytes> \
--network goerli
```


(make sure to replace `<key>` with actual values)

<br />
<br />

### renounceContractRoles

<br />
Parameters that should be filled either in .env or passed as CLI arguments:

| Parameter name        | Required | Input Value | Description |
| ------------------ | -------- | ---------- | ----------- |
| \**PRIVATE_KEY* | true     | key | Network-specific private key used when deploying the contract |
| INFURA_API_KEY     | true     | key | Infura API Key |
| OLD_ADMIN_ADDRESS | true | address | Old admin address. If ommited in the .env, it must be provided as CLI argument using the `--old-admin-address` flag |
| NEW_ADMIN_ADDRESS | true | address | New admin address. If ommited in the .env, it must be provided as CLI argument using the `--new-admin-address` flag |
| PROXY_ADDRESS | true | address | Proxy contract address. If ommited in the .env, it must be provided as CLI argument using the `--proxy-address` flag|
| CONTRACT_TYPE   | true    | Contract name | Contract name parameter. If ommited in the .env, it must be provided as CLI argument using the `--contract-type` flag |
| CONTRACT_ROLES | true | bytes | Comma-separated bytes32-formatted roles that will be renounced from the Old Admin address. New admin will be checked for roles before revoking from Old admin. If ommited in the .env, it must be provided as CLI argument using the `--contract-roles` flag| 
<br />

Base command:
```shell
npx hardhat renounceContractRoles --network goerli
```

Base command with cli arguments:

```shell
GOERLI_PRIVATE_KEY=<key> \
INFURA_API_KEY=<key> \
npx hardhat renounceContractRoles \
--old-admin-address <address>  \
--new-admin-address <address>  \
--proxy-address <address> \
--contract-type <string> \
--contract-roles <bytes> \
--network goerli
```


(make sure to replace `<key>` with actual values)

<br />
<br />

### setRateLimit


This task can be executed on the ZkEvmV2 or L2MessageService contracts.
<br /> 
<br /> 
Parameters that should be filled either in .env or passed as CLI arguments:

<br /> 

| Parameter name        | Required | Input Value | Description |
| ------------------ | -------- | ---------- | ----------- |
| \**PRIVATE_KEY* | true     | key | Network-specific private key used when deploying the contract |
| INFURA_API_KEY     | true     | key | Infura API Key |
| MESSAGE_SERVICE_TYPE | true | contract name | Contract name parameter. If ommited in the .env, it must be provided as CLI argument using the `--message-service-type` flag |
| MESSAGE_SERVICE_ADDRESS | true | address | Proxy contract address. If ommited in the .env, it must be provided as CLI argument using the `--message-service-address` flag|
| WITHDRAW_LIMIT_IN_WEI | true | uint256 | Withdraw limit denominated in wei. If ommited in the .env, it must be provided as CLI argument using the `--withdraw-limit` flag|
<br />

Base command:
```shell
npx hardhat setRateLimit --network linea_goerli
```

Base command with cli arguments:

```shell
LINEA_GOERLI_PRIVATE_KEY=<key> \
INFURA_API_KEY=<key> \
npx hardhat setRateLimit \
--message-service-address <address> \
--message-service-type <string> \
--withdraw-limit <uint256> \
--network linea_goerli
```


(make sure to replace `<key>` with actual values)

<br />
<br />

### setVerifierAddress

<br />
Parameters that should be filled either in .env or passed as CLI arguments:

| Parameter name        | Required | Input Value | Description |
| ------------------ | -------- | ---------- | ----------- |
| \**PRIVATE_KEY* | true     | key | Network-specific private key used when deploying the contract |
| INFURA_API_KEY     | true     | key | Infura API Key |
| VERIFIER_PROOF_TYPE | true | uint256 | Verifier Proof type ("0" - Full Verifier, "1" - Full-Large Verifier, "2" - Light Verifier). If ommited in the .env, it must be provided as CLI argument using the `--verifier-proof-type` flag| |
| ZKEVMV2_ADDRESS | true | address | Proxy contract address. If ommited in the .env, it must be provided as CLI argument using the `--proxy-address` flag|
| VERIFIER_ADDRESS | true | address | Verifier Address. If ommited in the .env, it must be provided as CLI argument using the `--verifier-address` flag|
| VERIFIER_NAME | true | address | Verifier Name. If ommited in the .env, it must be provided as CLI argument using the `--verifier-name` flag|

<br />

Base command:

```shell
npx hardhat setVerifierAddress --network goerli
```

Base command with cli arguments:

```shell
GOERLI_PRIVATE_KEY=<key> \
INFURA_API_KEY=<key> \
npx hardhat setVerifierAddress \
--verifier-proof-type <uint256> \
--proxy-address <address> \
--verifier-address <address> \
--verifier-name <string> \
--network goerli
```

(make sure to replace `<key>` with actual values)

<br />
<br />

### transferOwnershipAndSetRemoteTokenBridge

<br />
Parameters that should be filled either in .env or passed as CLI arguments:

| Parameter name        | Required | Input Value | Description |
| ------------------ | -------- | ---------- | ----------- |
| \**PRIVATE_KEY* | true     | key | Network-specific private key used when deploying the contract |
| INFURA_API_KEY     | true     | key | Infura API Key |
| REMOTE_TOKEN_BRIDGE_ADDRESS   | true  | address   | Token Bridge address deployed on the `--remote-network`. It must be provided as CLI argument using the `--remote-token-bridge-address` flag. If not found, the script will also check .env. variable `TOKEN_BRIDGE_ADDRESS`. If the .env variable doesn't exist, it will also check the `deployments/<remote-network>` folder and try to use that address. Otherwise it will throw an error.  |
| TOKEN_BRIDGE_ADDRESS  | true  |   address | Token Bridge address deployed on current network. It must be provided as CLI argument using the `--token-bridge-address` flag. If not found, the script will also check .env. variable `TOKEN_BRIDGE_ADDRESS`. If the .env variable doesn't exist, it will also check the `deployments/<network_name>` folder and try to use that address. Otherwise it will throw an error.  |
| --token-bridge-proxy-admin-address    | true  |   address | TokenBridge Proxy Admin address. If not provided as a CLI argument, the script will also check the `deployments/<network_name>` folder and try to use that address if it exists. Otherwise it will throw an error. |
| --safe-address    | true  |   address | Safe address. It must be provided as CLI argument using the `--safe-address` flag  otherwise the script will throw an error. |
| --remote-network  | true  |   string   | Network name. It must be provided as CLI argument using the `--safe-address` flag  otherwise the script will throw an error. |

<br />
<br />

It should be noted that the `--remote-network` and `--network` fields should point to complementary networks.
e.g. `--remote-network linea_goerli --network goerli` or vice-versa.
<br />

Base command:

```shell
npx hardhat transferOwnershipAndSetRemoteTokenBridge --safe-address <address> --remote-network goerli --network linea_goerli
```

Base command with cli arguments:

```shell
GOERLI_PRIVATE_KEY=<key> \
INFURA_API_KEY=<key> \
npx hardhat transferOwnershipAndSetRemoteTokenBridge \
--safe-address <address> \
--remote-token-bridge-address <address> \
--token-bridge-address <address> \
--token-bridge-proxy-admin-address <address> \
--remote-network goerli \
--network linea_goerli
```

(make sure to replace `<key>` with actual values)

<br />
<br />