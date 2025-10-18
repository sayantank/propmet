/**
 * DLMM Liquidity Optimizer (Symmetric Slippage)
 *
 * Computes a symmetric liquidity distribution around the initial price
 * with integer bins, ensuring balanced buy/sell slippage.
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
  tradeSize: number; // trade size in USD
  binStepPct: number; // % per bin (e.g., 0.1 = 0.1%)
  targetSlippagePct: number; // max desired slippage (e.g., 0.5)
}

function computeSymmetricLiquidityPlan(params: Params): Allocation[] {
  const { initialPrice, totalTVL, binStepPct, targetSlippagePct } = params;

  // number of bins required for ± target slippage
  let nBins = 1;
  while (((1 + binStepPct / 100) ** nBins - 1) * 100 < targetSlippagePct) {
    nBins++;
  }

  const halfBins = Math.max(2, nBins);
  const totalBins = halfBins * 2 + 1; // symmetric bins around 0
  const perBinLiquidity = totalTVL / totalBins;

  const allocations: Allocation[] = [];
  let cumulative = 0;

  for (let i = -halfBins; i <= halfBins; i++) {
    const price = initialPrice * (1 + binStepPct / 100) ** i;
    const slippage = (price / initialPrice - 1) * 100;
    cumulative += perBinLiquidity;

    allocations.push({
      binId: i,
      price: Number(price.toFixed(6)),
      liquidityUsd: Math.round(perBinLiquidity),
      cumulativeLiquidity: Math.round(cumulative),
      estSlippagePct: Number(slippage.toFixed(3)),
    });
  }

  return allocations;
}

/** Example usage **/
const plan: Allocation[] = computeSymmetricLiquidityPlan({
  initialPrice: 0.9876, // oracle price
  totalTVL: 100_000, // $100K TVL
  tradeSize: 1_000, // $1K trade
  binStepPct: 0.1, // 0.1% step
  targetSlippagePct: 0.5, // ±0.5% range
});

if (Array.isArray(plan)) {
  console.table(plan);

  const activeLiquidity = plan
    .filter((p) => Math.abs(p.estSlippagePct) <= 0.5)
    .reduce((sum, p) => sum + p.liquidityUsd, 0);

  console.log(
    `✅ Allocate ~$${activeLiquidity.toFixed(0)} symmetrically around $${plan.find((p) => p.binId === 0)?.price} to stay within ±0.5% slippage.`,
  );
} else {
  console.error("❌ computeSymmetricLiquidityPlan did not return an array");
}
