import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import { HermesClient } from "@pythnetwork/hermes-client";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Strategy } from "./strategy";
import "dotenv/config";
import { Solana } from "./solana";

const hermes = new HermesClient("https://hermes.pyth.network", {});

if (!process.env.READ_RPC_URL) {
  throw new Error("READ_RPC_URL environment variable is not set.");
}

if (!process.env.WRITE_RPC_URL) {
  throw new Error("WRITE_RPC_URL environment variable is not set.");
}

if (!process.env.SECRET_KEY) {
  throw new Error("SECRET_KEY environment variable is not set.");
}

if (!process.env.POOL) {
  throw new Error("POOL environment variable is not set.");
}

const secretKey = Uint8Array.from(process.env.SECRET_KEY.split(",").map((v) => Number(v.trim())));

const userKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));

const solana = new Solana({
  read: process.env.READ_RPC_URL!,
  write: process.env.WRITE_RPC_URL!,
});

// You can get your desired pool address from the API https://dlmm-api.meteora.ag/pair/all
const JUP_SOL_POOL_ADDRESS = new PublicKey("FpjYwNjCStVE2Rvk9yVZsV46YwgNTFjp7ktJUDcZdyyk");
const JUP_USDC_POOL_ADDRESS = new PublicKey("BhQEFZCRnWKQ21LEt4DUby7fKynfmLVJcNjfHNqjEF61");
const MET_USDC_POOL_ADDRESS = new PublicKey("5hbf9JP8k5zdrZp9pokPypFQoBse5mGCmW6nqodurGcd");

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

const MET_USDC_PRICE_FEEDS = [
  // MET-USD
  "0x0292e0f405bcd4a496d34e48307f6787349ad2bcd8505c3d3a9f77d81a67a682",
];

const POOL_CONFIGS: Record<string, { priceFeeds: string[]; poolAddress: PublicKey }> = {
  "jup/sol": {
    priceFeeds: JUP_SOL_PRICE_FEEDS,
    poolAddress: JUP_SOL_POOL_ADDRESS,
  },
  "jup/usdc": {
    priceFeeds: JUP_USDC_PRICE_FEEDS,
    poolAddress: JUP_USDC_POOL_ADDRESS,
  },
  "met/usdc": {
    priceFeeds: MET_USDC_PRICE_FEEDS,
    poolAddress: MET_USDC_POOL_ADDRESS,
  },
};

const selectedPool = POOL_CONFIGS[process.env.POOL!];
if (!selectedPool) {
  throw new Error(
    `Pool ${process.env.POOL} not found. Available pools are: ${Object.keys(POOL_CONFIGS).join(", ")}`,
  );
}

const dlmm = await DLMM.create(solana.connection, selectedPool.poolAddress);

const strategy = new Strategy(solana, dlmm, userKeypair, {
  spread: 300, // determines how many bins around active_bin to put liquidity in
  acceptableDelta: 2000, // Determines when to rebalance the inventory. If the difference between the base and quote tokens is greater than this threshold, the inventory will be rebalanced.
  type: StrategyType.Curve, //Concentrate liquidity around oracle price
  rebalanceBinThreshold: 1000, // Determines when to rebalance the position. If the market price is more than this threshold away from the center of our position, the position will be rebalanced.
});

const eventSource = await hermes.getPriceUpdatesStream(selectedPool.priceFeeds, {
  parsed: true,
});

eventSource.onmessage = async (event) => {
  try {
    const eventData = JSON.parse(event.data).parsed;

    // NOTE: We have to make sure the `[0]` is the base token and `[1]` is the quote token
    const marketPrice =
      eventData.length > 1
        ? eventData[0].price.price / eventData[1].price.price
        : eventData[0].price.price / 10 ** (-1 * eventData[0].price.expo);

    await strategy.run(marketPrice);
  } catch (error) {
    console.error("Error parsing event data:", error);
    throw error;
  }
};

eventSource.onerror = (error) => {
  console.error("Error receiving updates:", error);
  eventSource.close();
};

// await sleep(10000);

// eventSource.close();
