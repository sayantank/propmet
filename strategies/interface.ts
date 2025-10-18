import type { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { PositionLiquidityBins } from "../types";
import type DLMM from "@meteora-ag/dlmm";
import type { HermesClient } from "@pythnetwork/hermes-client";
import type { BinLiquidity, LbPosition } from "@meteora-ag/dlmm";

export interface Strategy {
	bins: PositionLiquidityBins;
	lastRebalanceTimestamp: number;
	isUpdatingPosition: boolean;
	connection: Connection;
	keypair: Keypair;
	tokenX: PublicKey;
	tokenY: PublicKey;
	lastPrice: number;
	dlmmPool: DLMM;
	dlmmPoolAddress: PublicKey;
	hermesClient: HermesClient;

	run(): void;
	setup(): void;
	tryRebalance(
		price: number,
		lastMidPrice: number,
		bins: PositionLiquidityBins,
		binForPrice: number,
		activeBin: BinLiquidity,
		lastRebalance: number,
		currentPosition?: LbPosition,
	): void;
	shouldRebalance(): boolean;
}
