import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import { HermesClient } from "@pythnetwork/hermes-client";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Strategy } from "./strategy";

const hermes = new HermesClient("https://hermes.pyth.network", {});
const connection = new Connection(
  "https://mainnet.helius-rpc.com/?api-key=4529a1d6-1946-4721-8962-354fd77260c8",
);

// Create pool instances

// e.g. creating a DLMM pool
// You can get your desired pool address from the API https://dlmm-api.meteora.ag/pair/all
const JUP_SOL_POOL_ADDRESS = new PublicKey("FpjYwNjCStVE2Rvk9yVZsV46YwgNTFjp7ktJUDcZdyyk");
const dlmm = await DLMM.create(connection, JUP_SOL_POOL_ADDRESS);

const userKeypair = Keypair.fromSecretKey(
  Uint8Array.from([
    86, 221, 198, 199, 169, 88, 199, 37, 56, 174, 119, 57, 126, 165, 192, 167, 146, 28, 236, 199,
    123, 187, 237, 89, 219, 134, 42, 151, 91, 201, 186, 50, 199, 241, 163, 61, 154, 33, 118, 24, 81,
    64, 184, 239, 83, 192, 70, 182, 215, 161, 111, 152, 68, 240, 185, 114, 153, 209, 200, 24, 138,
    170, 212, 125,
  ]),
);

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

// eventSource.onerror = (error) => {
// 	console.error("Error receiving updates:", error);
// 	eventSource.close();
// };

// await sleep(10000);

// eventSource.close();
