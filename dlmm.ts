import {
	autoFillYByStrategy,
	BinLiquidity,
	StrategyType,
} from "@meteora-ag/dlmm";
import type DLMM from "@meteora-ag/dlmm";

import type { PositionLiquidityBins } from "./types";
import { BN } from "bn.js";
import type { Connection } from "@solana/web3.js";
import { Keypair, sendAndConfirmTransaction } from "@solana/web3.js";

const COOLDOWN_MS = 600;
const JUP_DECIMALS = 6;
const BINS_TO_CREATE = 6;

// TODO: update this to work with different strategies - This is just spot
export async function createBalancedPositionAndAddLiquidity(
	binForPrice: number,
	activeBin: BinLiquidity,
	dlmmPool: DLMM,
	user: Keypair,
	connection: Connection,
): Promise<PositionLiquidityBins | undefined> {
	console.log("Open position");
	const TOTAL_RANGE_INTERVAL = BINS_TO_CREATE / 2; // 3 bins on each side of the active bin
	const minBinId = binForPrice - TOTAL_RANGE_INTERVAL;
	const maxBinId = binForPrice + TOTAL_RANGE_INTERVAL;

	const totalXAmount = new BN(10 * 10 ** JUP_DECIMALS);
	const totalYAmount = autoFillYByStrategy(
		binForPrice,
		dlmmPool.lbPair.binStep,
		totalXAmount,
		activeBin.xAmount,
		activeBin.yAmount,
		minBinId,
		maxBinId,
		StrategyType.Spot, // can be StrategyType.Spot, StrategyType.BidAsk, StrategyType.Curve
	);

	const newBalancePosition = new Keypair();

	console.log("totalXAmount ", Number(totalXAmount));
	console.log("totalYAmount ", Number(totalYAmount));
	console.log({
		strategy: {
			maxBinId,
			minBinId,
			strategyType: StrategyType.Spot, // can be StrategyType.Spot, StrategyType.BidAsk, StrategyType.Curve
		},
	});

	try {
		// Create Position
		const createPositionTx =
			await dlmmPool.initializePositionAndAddLiquidityByStrategy({
				positionPubKey: newBalancePosition.publicKey,
				user: user.publicKey,
				totalXAmount,
				totalYAmount,
				strategy: {
					maxBinId,
					minBinId,
					strategyType: StrategyType.Spot, // can be StrategyType.Spot, StrategyType.BidAsk, StrategyType.Curve
				},
				slippage: 5,
			});

		const createBalancePositionTxHash = await sendAndConfirmTransaction(
			connection,
			createPositionTx,
			[user, newBalancePosition],
			{ skipPreflight: false },
		);

		console.log("Opened position", createBalancePositionTxHash);
		return {
			openBin: activeBin.binId,
			leftBin: minBinId,
			rightBinId: maxBinId,
			positionAccount: newBalancePosition.publicKey,
		};
	} catch (error) {
		console.log(error);
	}
}

export async function removeLiquidityAndClosePosition(
	bins: PositionLiquidityBins,
	dlmmPool: DLMM,
	user: Keypair,
	connection: Connection,
) {
	if (bins.positionAccount == null) {
		return true;
	}
	const closePositionTx = await dlmmPool.removeLiquidity({
		user: user.publicKey,
		// We don't need the whole position here, just the public key
		position: bins.positionAccount,
		fromBinId: bins.leftBin,
		toBinId: bins.rightBinId,
		bps: new BN(10000),
		shouldClaimAndClose: true,
	});

	try {
		console.log("Closing position for user....");
		console.log("Transactions in tx", closePositionTx.length);
		if (closePositionTx[0] != null) {
			const closePositionTxHash = await sendAndConfirmTransaction(
				connection,
				closePositionTx[0],
				[user],
				{ skipPreflight: false },
			);
			console.log(
				`Closed position ${bins.positionAccount.toBase58()} - ${closePositionTxHash}`,
			);
			return true;
		}
	} catch (error) {
		console.log("Error closing position");
		console.log(error);
		return false;
	}
	return false;
}
