import type { PublicKey } from "@solana/web3.js";

export type PositionLiquidityBins = {
	openBin: number;
	leftBin: number;
	rightBinId: number;
	positionAccount?: PublicKey;
	// Convert to string or bignit ??
	openingPrice?: number;
};
