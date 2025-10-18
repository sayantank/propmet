import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import { HermesClient } from "@pythnetwork/hermes-client";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Strategy } from "./strategy";
import "dotenv/config";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const JUP_MINT = new PublicKey("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN");

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

import dotenv from "dotenv";
dotenv.config();

if (!process.env.SECRET_KEY) {
  throw new Error("SECRET_KEY environment variable is not set.");
}

const secretArray = JSON.parse(process.env.SECRET_KEY);

if (!Array.isArray(secretArray) || secretArray.some((v) => typeof v !== "number")) {
  throw new Error("SECRET_KEY must be a JSON array of numbers.");
}

const userKeypair = Keypair.fromSecretKey(Uint8Array.from(secretArray));

const strategy = new Strategy(connection, dlmm, userKeypair, {
  spread: 30,
  type: StrategyType.BidAsk,
  rebalanceBinThreshold: 6000,
  maxQuoteAmount: 0.15 * 10 ** 9, // 0.15 SOL ~ 25 USD
  maxBaseAmount: Number.MAX_SAFE_INTEGER,
});

// const eventSource = await hermes.getPriceUpdatesStream(
//   [
//     // JUP-USD
//     "0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996",
//     // SOL-USD
//     "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
//   ],
//   {
//     parsed: true,
//   },
// );

// eventSource.onmessage = async (event) => {
//   const jupPrice = Number(JSON.parse(event.data).parsed[0].price.price);
//   const solPrice = Number(JSON.parse(event.data).parsed[1].price.price);

//   const marketPrice = jupPrice / solPrice; // Gives SOL/JUP price

//   await strategy.run(marketPrice);
// };

// eventSource.onerror = (error) => {
// 	console.error("Error receiving updates:", error);
// 	eventSource.close();
// };

// await sleep(10000);

// eventSource.close();

function getBalance() {
  // Returns the JUP and USDC balances for the userKeypair
  // Assumes connection, userKeypair, and token mints are available in scope

  async function getTokenBalance(mint: PublicKey): Promise<number> {
    // Get all the user's SPL token accounts for the given mint
    const tokenAccounts = await connection.getTokenAccountsByOwner(userKeypair.publicKey, {
      mint,
    });

    let balance = 0;
    for (const accountInfo of tokenAccounts.value) {
      const amount = Number(
        (await connection.getParsedAccountInfo(accountInfo.pubkey)).value?.data?.parsed?.info
          ?.tokenAmount?.amount ?? 0,
      );
      balance += amount;
    }

    // Return balance in raw amount (may want to divide by 10**decimals if needed)
    return balance;
  }

  return Promise.all([getTokenBalance(JUP_MINT), getTokenBalance(USDC_MINT)]).then(
    ([jupBalance, usdcBalance]) => {
      return {
        jup: jupBalance,
        usdc: usdcBalance,
      };
    },
  );
}

const d = await getBalance();

console.log(d);
