import express from "express";
import * as path from "path";

import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningStargateClient } from "@cosmjs/stargate";
import { FrequencyChecker } from "./checker.js";
// import conf from './config.json' assert {type: 'json'}
import conf from "./config.js";
// let confs = require.context('./chains', false, /\.json$/)
// console.log(confs)

// load config
console.log("loaded config: ", conf);

const app = express();

const checker = new FrequencyChecker(conf);

app.get("/", (req, res) => {
  res.sendFile(path.resolve("./index.html"));
});

app.get("/config.json", (req, res) => {
  res.send(conf.project);
});

app.get("/balance", async (req, res) => {
  try {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
      conf.sender.mnemonic,
      { prefix: conf.sender.option.prefix }
    );

    const [{ address: faucetAddress }] = await wallet.getAccounts();
    const client = await SigningStargateClient.connect(
      conf.blockchain.rpc_endpoint
    );

    // Query the configured denom
    const coin = await client.getBalance(faucetAddress, conf.tx.amount.denom);

    // ← Frontend expects an array here
    res.json({
      status: "ok",
      result: {
        address: faucetAddress,
        balance: [coin],
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: "error",
      message: "Failed to get balance, please contact admin",
    });
  }
});

app.get("/send/:address", async (req, res) => {
  const { address } = req.params;
  console.log("request tokens to ", address, req.ip);
  if (address) {
    try {
      if (address.startsWith(conf.sender.option.prefix)) {
        if (
          (await checker.checkAddress(address)) &&
          (await checker.checkIp(req.ip))
        ) {
          sendTx(address).then((ret) => {
            console.log("sent tokens to ", address);
            checker.update(address);
            checker.update(req.ip); // get ::1 on localhost
            res.send({ result: ret });
          });
        } else {
          res.send({ result: "You requested too often" });
        }
      } else {
        res.send({ result: `Address [${address}] is not supported.` });
      }
    } catch (err) {
      console.error(err);
      res.send({ result: "Failed, Please contact to admin." });
    }
  } else {
    // send result
    res.send({ result: "address is required" });
  }
});

app.listen(conf.port, () => {
  console.log(`Faucet app listening on port ${conf.port}`);
});

async function sendTx(recipient) {
  // const mnemonic = "surround miss nominee dream gap cross assault thank captain prosper drop duty group candy wealth weather scale put";
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
    conf.sender.mnemonic,
    {
      prefix: conf.sender.option.prefix,
    }
  );
  const [firstAccount] = await wallet.getAccounts();

  // console.log("sender", firstAccount);

  const rpcEndpoint = conf.blockchain.rpc_endpoint;
  const client = await SigningStargateClient.connectWithSigner(
    rpcEndpoint,
    wallet
  );

  // const recipient = "cosmos1xv9tklw7d82sezh9haa573wufgy59vmwe6xxe5";
  const amount = conf.tx.amount;
  const fee = conf.tx.fee;
  return client.sendTokens(firstAccount.address, recipient, [amount], fee);
}
