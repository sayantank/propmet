import DLMM, { type BinLiquidity } from "@meteora-ag/dlmm";

import { HermesClient } from "@pythnetwork/hermes-client";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import "dotenv/config";
import type { PositionLiquidityBins } from "./types";
import {
	createBalancedPositionAndAddLiquidity,
	removeLiquidityAndClosePosition,
} from "./dlmm";
import { sleep } from "bun";

const COOLDOWN_MS = 600;
const BINS_TO_CREATE = 6;
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const JUP_MINT = new PublicKey("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN");

if (process.env.SECRET_KEY == null) {
	throw new Error("Secret key for wallet missing");
}

if (process.env.RPC_URL == null) {
	throw new Error("RPC URL for missing");
}

let bins: PositionLiquidityBins = {
	openBin: -1,
	leftBin: -1,
	rightBinId: -1,
};

let lastPrice = 0;
let lastRebalanceTimestamp = 0;

let isUpdatingPosition = false; //Can be opening, closing or managing inventory

const hermes = new HermesClient("https://hermes.pyth.network", {});

const secretKey = Uint8Array.from(
	process.env.SECRET_KEY.split(",").map((v) => Number(v.trim())),
);

const connection = new Connection(process.env.RPC_URL);

const user = Keypair.fromSecretKey(secretKey);

// Create pool instances

// e.g. creating a DLMM pool
// You can get your desired pool address from the API https://dlmm-api.meteora.ag/pair/all
const JUP_USDC_POOL_ADDRESS = new PublicKey(
	"BhQEFZCRnWKQ21LEt4DUby7fKynfmLVJcNjfHNqjEF61",
);

const dlmmPool = await DLMM.create(connection, JUP_USDC_POOL_ADDRESS);

const eventSource = await hermes.getPriceUpdatesStream(
	["0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996"],
	{
		parsed: true,
	},
);

eventSource.onmessage = async (event) => {
	if (isUpdatingPosition) return;

	console.log("------- PRICE UPDATE --------");
	const parsed = JSON.parse(event.data).parsed[0];

	const price = BigInt(parsed.price.price);
	const expo = parsed.price.expo;
	const oraclePrice = Number(price) * 10 ** expo;

	const [activeBin] = await Promise.all([
		dlmmPool.getActiveBin(),
		// Use this for opening position just on the bin according to the price ??
		// dlmmPool.getBinIdFromPrice(oraclePrice, true),
		// How tf do i get the user positions just for jup/usdc pool, the types don't have shit smh
		// dlmmPool.getPositionsByUserAndLbPair(user.publicKey),
	]);

	console.log(
		"Discrepancy between bin price and oracle price",
		oraclePrice - Number(activeBin.price) / Number(activeBin.price),
	);

	if (!isUpdatingPosition) {
		try {
			isUpdatingPosition = true;
			const resultPosition = await tryRebalance(
				oraclePrice,
				lastPrice,
				bins,
				activeBin,
				lastRebalanceTimestamp,
			);

			if (resultPosition != null) {
				bins = {
					openBin: resultPosition?.openBin,
					leftBin: resultPosition?.leftBin,
					rightBinId: resultPosition?.rightBinId,
					positionAccount: resultPosition?.positionAccount,
				};
			}

			lastPrice = oraclePrice;

			console.log(
				"Last Rebalance at ",
				new Date(lastRebalanceTimestamp).toISOString(),
			);
		} catch (e) {
			console.log(e);
		} finally {
			isUpdatingPosition = false;
		}
	}
};

eventSource.onerror = (error) => {
	console.error("Error receiving updates:", error);
	eventSource.close();
};

async function tryRebalance(
	price: number,
	lastMidPrice: number,
	bins: PositionLiquidityBins,
	activeBin: BinLiquidity,
	lastRebalance: number,
) {
	const pctDrift =
		lastMidPrice !== 0
			? Math.abs(price - lastMidPrice) / Math.abs(lastMidPrice)
			: 0;

	const outsideBand = shouldRebalanceBins(activeBin, bins.openBin);

	const shouldRebalance =
		(outsideBand || pctDrift >= 1) && Date.now() - lastRebalance > COOLDOWN_MS;

	console.log("Should Rebalance? ", shouldRebalance);
	console.log("Outside band? ", outsideBand);
	console.log("Price drift ", pctDrift);

	let positionBins: PositionLiquidityBins | undefined;

	if (shouldRebalance) {
		let positionRemoved = true;

		if (bins.positionAccount != null) {
			positionRemoved = await removeLiquidityAndClosePosition(
				bins,
				dlmmPool,
				user,
				connection,
			);
		}
		if (positionRemoved) {
			// Always create a new position after closing (or if no position existed)
			positionBins = await createBalancedPositionAndAddLiquidity(
				activeBin,
				dlmmPool,
				user,
				connection,
			);
			if (positionBins != null) {
				lastRebalanceTimestamp = Date.now();
			} else {
				console.error("Error creating position");
			}
		}
	}
	return positionBins;
}

function shouldRebalanceBins(activeBin: BinLiquidity, openingBinIndex: number) {
	// Bin displacement strategy.
	// If the bin has displaced more than +-(BIN_THRESHOLD/2), rebalance
	// This trigger -> This keeps your liquidity centered around the market but doesn’t overreact.

	// Idea, also rebalance based on time ??
	// Idea, also rebalance based on liquidity-weight drift? See how much quote and base inventory has deviated from target balance -> Can help correct asymetric fills and avoid one side to be drained due to trends -> Might incur impermanent loss
	// Idea, also rebalance based on volatility to protect from short-term shocks? -> Keep track of last X prices and add a volatility index

	return Math.abs(activeBin.binId - openingBinIndex) >= BINS_TO_CREATE / 2;
}

async function shouldRebalanceInventory(user: Keypair, connection: Connection) {
	// Fetch balance of USDC and JUP tokens for the given user.
	// Assumes connection and correct USDC/JUP mint addresses are available in scope.

	const usdcBalance = await getTokenBalance(user, USDC_MINT, connection);
	const jupBalance = await getTokenBalance(user, JUP_MINT, connection);

	console.log(`USDC balance for user: ${usdcBalance}`);
	console.log(`JUP balance for user: ${jupBalance}`);

	return { usdcBalance, jupBalance };
}

async function getTokenBalance(
	user: Keypair,
	mint: PublicKey,
	connection: Connection,
): Promise<number> {
	const { value: tokenAccounts } =
		await connection.getParsedTokenAccountsByOwner(user.publicKey, { mint });
	if (tokenAccounts.length === 0) return 0;
	const accountInfo = tokenAccounts?.[0]?.account.data.parsed.info;
	return Number(accountInfo.tokenAmount.amount);
}

async function main() {
	await shouldRebalanceInventory(user, connection);
	console.log("Positions", bins);
	await sleep(2000);
}

main().catch((e) => console.log(e));
