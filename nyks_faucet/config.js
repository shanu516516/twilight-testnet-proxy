import { stringToPath } from "@cosmjs/crypto";

export default {
  port: 8082, // http port
  db: {
    path: "./db/faucet.db", // save request states
  },
  project: {
    name: "nyks",
    logo: "https://frontend.testnet.twilight.rest/favicon/favicon.svg",
    deployer: `<a href="#">NYKS</a>`,
  },
  blockchain: {
    chainId: "nyks",
    cosmosChainId: "nyks",
    // make sure that CORS is enabled in lcd section in config.toml
    // cors_allowed_origins = ["*"]
    endpoint: "https://lcd.testnet.twilight.rest",
    rpc_endpoint: "https://rpc.testnet.twilight.rest",
  },
  sender: {
    mnemonic:
      "awesome corn uniform spray double intact absorb silly fossil coconut arrest point broom profit bottom across stay upgrade vivid cement hover brown dizzy episode",
    option: {
      hdPaths: "m/44'/60'/0'/0/0",
      prefix: "twilight",
    },
  },
  tx: {
    amount: {
      denom: "nyks",
      amount: "50000",
    },
    fee: {
      amount: [
        {
          amount: "1000",
          denom: "nyks",
        },
      ],
      gas: "200000",
    },
    frequency_in_24h: "10",
  },
  limit: {
    address: 1000000, // wallet address
    ip: 2,
  },
};
