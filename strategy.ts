import DLMM, { type LbPosition, type StrategyType } from "@meteora-ag/dlmm";
import {
  Keypair,
  sendAndConfirmTransaction,
  type Connection,
  type PublicKey,
} from "@solana/web3.js";
import { getTokenBalance } from "./solana";
import { BN } from "bn.js";
import { retry } from "./retry";
import { SOL_MINT } from "./const";
import { rebalanceRatio } from "./inventory";

export type StrategyConfig = {
  spread: number; // in basis points
  type: StrategyType;
  rebalanceBinThreshold: number; // in basis points
  maxQuoteAmount: number;
  maxBaseAmount: number;
};

export class Strategy {
  private baseToken: {
    mint: PublicKey;
    decimals: number;
  };
  private quoteToken: {
    mint: PublicKey;
    decimals: number;
  };

  private position: LbPosition | null = null;

  private isAction = false;

  private noThresholdCounter = 0;

  constructor(
    private readonly connection: Connection,
    private readonly dlmm: DLMM,
    private readonly userKeypair: Keypair,
    private readonly config: StrategyConfig,
  ) {
    this.baseToken = {
      mint: dlmm.tokenX.mint.address,
      decimals: dlmm.tokenX.mint.decimals,
    };
    this.quoteToken = {
      mint: dlmm.tokenY.mint.address,
      decimals: dlmm.tokenY.mint.decimals,
    };
  }

  async run(marketPrice: number) {
    if (this.isAction) {
      return;
    }

    await this.getOrCreatePosition(marketPrice);

    if (this.position == null) {
      console.error("Failed to get or create position");
      return;
    }

    // Check if market price bin id has crossed rebalance bin threshold
    const marketPriceBinId = this.dlmm.getBinIdFromPrice(
      Number(
        DLMM.getPricePerLamport(this.baseToken.decimals, this.quoteToken.decimals, marketPrice),
      ),
      false,
    );

    const halfRange = Math.floor(
      (this.position.positionData.upperBinId - this.position.positionData.lowerBinId) / 2,
    );

    // calculate the bin ids for the thresholds
    const positionMidBin = this.position.positionData.lowerBinId + halfRange;

    const numBinsThreshold = Math.floor(halfRange * (this.config.rebalanceBinThreshold / 10000));

    const lowerThresholdBin = positionMidBin - numBinsThreshold;
    const upperThresholdBin = positionMidBin + numBinsThreshold;

    if (
      (marketPriceBinId < lowerThresholdBin || marketPriceBinId > upperThresholdBin) &&
      !this.isAction
    ) {
      console.log("Market price crossed threshold, triggering rebalance");

      const removeLiquidityTxs = await this.dlmm.removeLiquidity({
        user: this.userKeypair.publicKey,
        position: this.position.publicKey,
        fromBinId: this.position.positionData.lowerBinId,
        toBinId: this.position.positionData.upperBinId,
        bps: new BN(10000),
        shouldClaimAndClose: true,
        skipUnwrapSOL: false,
      });

      this.isAction = true;
      console.log("Removing liquidity...", removeLiquidityTxs.length);

      for (const tx of removeLiquidityTxs) {
        await sendAndConfirmTransaction(this.connection, tx, [this.userKeypair], {
          skipPreflight: false,
          commitment: "confirmed",
        });
      }

      this.position = await this.createPosition(marketPrice);

      this.isAction = false;
    } else {
      if (this.noThresholdCounter % 10 === 0) {
        console.log("Threshold not crossed, no action needed", {
          marketPriceBinId,
          shift:
            marketPriceBinId < positionMidBin
              ? (marketPriceBinId - positionMidBin) / halfRange
              : (positionMidBin - marketPriceBinId) / halfRange,
        });
      }
      this.noThresholdCounter++;
    }
  }

  private async getOrCreatePosition(marketPrice: number): Promise<LbPosition | null> {
    if (this.position) {
      return this.position;
    }

    const existingPositions = await this.dlmm.getPositionsByUserAndLbPair(
      this.userKeypair.publicKey,
    );
    if (existingPositions.userPositions.length > 0) {
      console.warn("Found multiple positions for user, using the first one");

      this.position = existingPositions.userPositions[0]!;
      return existingPositions.userPositions[0]!;
    }

    return this.createPosition(marketPrice);
  }

  private async createPosition(marketPrice: number): Promise<LbPosition | null> {
    if (this.isAction) {
      return null;
    }

    this.isAction = true;
    console.log("Checking if rebalance is needed...");
    console.log(marketPrice);
    await this.shouldRebalance(marketPrice);

    console.log("Creating position...");

    // Get the inventory value
    const { baseBalance, quoteBalance } = await this.getInventory(marketPrice);

    const basePositionAmount = Math.min(baseBalance, this.config.maxBaseAmount);
    const quotePositionAmount = Math.min(quoteBalance, this.config.maxQuoteAmount);

    const basePositionValue = (basePositionAmount / 10 ** this.baseToken.decimals) * marketPrice;
    const quotePositionValue = quotePositionAmount / 10 ** this.quoteToken.decimals;

    // Shouldn't happen but checking just in case
    if (basePositionAmount > baseBalance || quotePositionAmount > quoteBalance) {
      console.log({
        basePositionAmount,
        baseBalance,
        quotePositionAmount,
        quoteBalance,
      });
      throw new Error("Not enough balance to position");
    }

    const minBinPrice = marketPrice * (1 - this.config.spread / 10000);
    const maxBinPrice = marketPrice * (1 + this.config.spread / 10000);

    const minBinId = this.dlmm.getBinIdFromPrice(
      Number(
        DLMM.getPricePerLamport(this.baseToken.decimals, this.quoteToken.decimals, minBinPrice),
      ),
      false,
    );
    const maxBinId = this.dlmm.getBinIdFromPrice(
      Number(
        DLMM.getPricePerLamport(this.baseToken.decimals, this.quoteToken.decimals, maxBinPrice),
      ),
      false,
    );

    // Check if market price bin id has crossed rebalance bin threshold
    const marketPriceBinId = this.dlmm.getBinIdFromPrice(
      Number(
        DLMM.getPricePerLamport(this.baseToken.decimals, this.quoteToken.decimals, marketPrice),
      ),
      false,
    );

    console.log({
      positionRatio: basePositionValue / quotePositionValue,
      minBinId,
      maxBinId,
      marketPriceBinId,
      totalRange: maxBinId - minBinId,
      lowerRange: marketPriceBinId - minBinId,
      upperRange: maxBinId - marketPriceBinId,
      minBinPrice,
      maxBinPrice,
      strategy: {
        minBinId,
        maxBinId,
        strategyType: this.config.type,
        singleSidedX: false,
      },
      totalXAmount: basePositionAmount,
      totalYAmount: quotePositionAmount,
    });

    const positionKeypair = Keypair.generate();

    const createPositionTx = await this.dlmm.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: positionKeypair.publicKey,
      strategy: {
        minBinId,
        maxBinId,
        strategyType: this.config.type,
        singleSidedX: false,
      },
      totalXAmount: new BN(basePositionAmount),
      totalYAmount: new BN(quotePositionAmount),
      user: this.userKeypair.publicKey,
    });
    const createBalancePositionTxHash = await sendAndConfirmTransaction(
      this.connection,
      createPositionTx,
      [this.userKeypair, positionKeypair],
      { skipPreflight: false, commitment: "confirmed" },
    );

    console.log("Opened position", createBalancePositionTxHash);

    const newPosition = await retry(
      async () => {
        const newPositions = await this.dlmm.getPositionsByUserAndLbPair(
          this.userKeypair.publicKey,
        );
        if (newPositions.userPositions.length === 0) {
          throw new Error("Position not found");
        }
        return newPositions.userPositions[0]!;
      },
      {
        initialDelay: 1000,
        maxRetries: 5,
        maxDelay: 5000,
      },
    );

    this.isAction = false;
    this.position = newPosition;

    return newPosition;
  }

  // Price is in terms of quote/base
  private async getInventory(price: number) {
    const [baseBalance, quoteBalance] = await Promise.all([
      getTokenBalance(this.userKeypair.publicKey, this.baseToken.mint, this.connection),
      getTokenBalance(this.userKeypair.publicKey, this.quoteToken.mint, this.connection),
    ]);

    console.log("Base mint", this.baseToken.mint.toBase58());
    console.log("quote mint", this.quoteToken.mint.toBase58());

    // Substract 0.05 of rent
    const baseBalanceNoRent =
      this.baseToken.mint === SOL_MINT ? baseBalance - 50000000 : baseBalance;

    const quoteBalanceNoRent = this.quoteToken.mint.equals(SOL_MINT)
      ? quoteBalance - 50000000
      : quoteBalance;
    const baseValue = (baseBalanceNoRent / 10 ** this.baseToken.decimals) * price; // Value of base tokens in terms of quote token
    const quoteValue = quoteBalanceNoRent / 10 ** this.quoteToken.decimals;

    return {
      baseBalance,
      quoteBalance,
      baseValue,
      quoteValue,
    };
  }

  // TokenX and tokenY base price should be expressed in USD
  async shouldRebalance(marketPrice: number) {
    const balances = await this.getInventory(marketPrice);

    await rebalanceRatio(
      balances.baseValue,
      this.baseToken.mint,
      this.baseToken.decimals,
      balances.quoteValue,
      this.quoteToken.mint,
      this.quoteToken.decimals,
      this.userKeypair,
      0.2,
      marketPrice,
    );
  }
}
