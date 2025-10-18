/**
 * DLMM Liquidity Optimizer (Integer bins + Initial Price)
 *
 * Computes liquidity distribution per integer bin to achieve target slippage.
 * Includes actual price per bin based on an initial (oracle) price.
 */

type Allocation = {
	binId: number; // integer offset from active bin
	price: number; // price at this bin
	liquidityUsd: number; // allocated liquidity
	cumulativeLiquidity: number;
	estSlippagePct: number; // price deviation from initial price
};

interface Params {
	initialPrice: number; // reference price (e.g., from oracle)
	totalTVL: number; // total liquidity in USD
	tradeSize: number; // target trade size in USD
	binStepPct: number; // % change per bin (e.g., 0.1 for 0.1%)
	targetSlippagePct: number; // e.g., 0.5 for ≤0.5% slippage
}

function computeLiquidityPlan(params: Params): Allocation[] {
	const { initialPrice, totalTVL, tradeSize, binStepPct, targetSlippagePct } =
		params;

	// Determine how many integer bins correspond to target slippage
	let nBins = 1;
	while (
		(Math.pow(1 + binStepPct / 100, nBins) - 1) * 100 <
		targetSlippagePct
	) {
		nBins++;
	}

	const coreBins = Math.max(3, Math.min(nBins, 5)); // bins around active price
	const outerBins = Math.max(0, nBins - coreBins);

	const liquidityCore = totalTVL * 0.8;
	const liquidityOuter = totalTVL * 0.2;

	const perCoreBin = liquidityCore / coreBins;
	const perOuterBin = outerBins > 0 ? liquidityOuter / outerBins : 0;

	const allocations: Allocation[] = [];
	let cumulative = 0;

	const half = Math.floor(coreBins / 2);

	// Core bins centered around active bin
	for (let i = -half; i <= half; i++) {
		const liquidity = perCoreBin;
		cumulative += liquidity;
		const price = initialPrice * Math.pow(1 + binStepPct / 100, i);
		const slippage = (price / initialPrice - 1) * 100;

		allocations.push({
			binId: i,
			price: Number(price.toFixed(6)),
			liquidityUsd: Math.round(liquidity),
			cumulativeLiquidity: Math.round(cumulative),
			estSlippagePct: Number(slippage.toFixed(3)),
		});
	}

	// Outer bins beyond the core range
	for (let j = 1; j <= outerBins; j++) {
		const liquidity = perOuterBin;
		cumulative += liquidity;
		const price = initialPrice * Math.pow(1 + binStepPct / 100, half + j);
		const slippage = (price / initialPrice - 1) * 100;

		allocations.push({
			binId: half + j,
			price: Number(price.toFixed(6)),
			liquidityUsd: Math.round(liquidity),
			cumulativeLiquidity: Math.round(cumulative),
			estSlippagePct: Number(slippage.toFixed(3)),
		});
	}

	return allocations.sort((a, b) => a.binId - b.binId);
}

/** Example usage **/
const plan = computeLiquidityPlan({
	initialPrice: 0.9876, // oracle or reference price
	totalTVL: 100_000, // total liquidity in USD
	tradeSize: 1_000, // simulate $1K trade
	binStepPct: 0.04, // 0.1% per bin
	targetSlippagePct: 0.5, // want ≤0.5% slippage
});

console.table(plan);

const activeLiquidity = plan
	.filter((p) => Math.abs(p.estSlippagePct) <= 0.5)
	.reduce((sum, p) => sum + p.liquidityUsd, 0);

console.log(
	`✅ Allocate ~$${activeLiquidity.toFixed(0)} near price $${plan.find((p) => p.binId === 0)?.price} to stay under 0.5% slippage.`,
);
