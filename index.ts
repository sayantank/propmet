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
const JUP_SOL_POOL_ADDRESS = new PublicKey("FpjYwNjCStVE2Rvk9yVZsV46YwgNTFjp7ktJUDcZdyyk");
const dlmm = await DLMM.create(connection, JUP_SOL_POOL_ADDRESS);

if (!process.env.SECRET_KEY) {
  throw new Error("SECRET_KEY environment variable is not set.");
}

const secretKey = Uint8Array.from(process.env.SECRET_KEY.split(",").map((v) => Number(v.trim())));

const userKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));

const strategy = new Strategy(connection, dlmm, userKeypair, {
  spread: 30,
  type: StrategyType.BidAsk,
  rebalanceBinThreshold: 6000,
  maxQuoteAmount: 0.15 * 10 ** 9, // 0.15 SOL ~ 25 USD
  maxBaseAmount: Number.MAX_SAFE_INTEGER,
});

const eventSource = await hermes.getPriceUpdatesStream(
  [
    // JUP-USD
    "0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996",
    // SOL-USD
    "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  ],
  {
    parsed: true,
  },
);

eventSource.onmessage = async (event) => {
  const jupPrice = Number(JSON.parse(event.data).parsed[0].price.price);
  const solPrice = Number(JSON.parse(event.data).parsed[1].price.price);

  const marketPrice = jupPrice / solPrice; // Gives SOL/JUP price
  await strategy.run(marketPrice);
};

eventSource.onerror = (error) => {
  console.error("Error receiving updates:", error);
  eventSource.close();
};

// await sleep(10000);

// eventSource.close();
