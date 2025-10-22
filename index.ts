import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import { HermesClient } from "@pythnetwork/hermes-client";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Strategy } from "./strategy";
import "dotenv/config";

const hermes = new HermesClient("https://hermes.pyth.network", {});

if (!process.env.RPC_URL) {
  throw new Error("RPC_URL environment variable is not set.");
}

const connection = new Connection(process.env.RPC_URL);

// Create pool instances

// e.g. creating a DLMM pool
// You can get your desired pool address from the API https://dlmm-api.meteora.ag/pair/all
// const JUP_SOL_POOL_ADDRESS = new PublicKey("FpjYwNjCStVE2Rvk9yVZsV46YwgNTFjp7ktJUDcZdyyk");
const JUP_USDC_POOL_ADDRESS = new PublicKey("BhQEFZCRnWKQ21LEt4DUby7fKynfmLVJcNjfHNqjEF61");
const dlmm = await DLMM.create(connection, JUP_USDC_POOL_ADDRESS);

if (!process.env.SECRET_KEY) {
  throw new Error("SECRET_KEY environment variable is not set.");
}

const secretKey = Uint8Array.from(process.env.SECRET_KEY.split(",").map((v) => Number(v.trim())));

const userKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));

const strategy = new Strategy(connection, dlmm, userKeypair, {
  spread: 20, // determines how many bins around active_bin to put liquidity in
  acceptableDelta: 2000, // Discrepancy between inventory tokens
  type: StrategyType.BidAsk, //Concentrate liquidity around oracle price
  rebalanceBinThreshold: 3000,
});

const JUP_SOL_PRICE_FEEDS = [
  // JUP-USD
  "0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996",
  // SOL-USD
  "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
];
const JUP_USDC_PRICE_FEEDS = [
  // JUP-USD
  "0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996",
  // USDC-USD
  "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
];

const PRICE_FEEDS = {
  "jup/sol": JUP_SOL_PRICE_FEEDS,
  "jup/usdc": JUP_USDC_PRICE_FEEDS,
};

const eventSource = await hermes.getPriceUpdatesStream(PRICE_FEEDS["jup/sol"], {
  parsed: true,
});

eventSource.onmessage = async (event) => {
  try {
    const eventData = JSON.parse(event.data).parsed;

    // NOTE: We have to make sure the `[0]` is the base token and `[1]` is the quote token
    const marketPrice =
      eventData.length > 1
        ? eventData[0].price.price / eventData[1].price.price
        : eventData[0].price.price;

    await strategy.run(marketPrice);
  } catch (error) {
    console.error("Error parsing event data:", error);
    return;
  }
};

eventSource.onerror = (error) => {
  console.error("Error receiving updates:", error);
  eventSource.close();
};

// await sleep(10000);

// eventSource.close();
