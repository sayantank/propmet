import DLMM, { type StrategyType, type LbPosition } from "@meteora-ag/dlmm";
import {
  Keypair,
  sendAndConfirmTransaction,
  type Connection,
  type PublicKey,
} from "@solana/web3.js";
import { getTokenBalance } from "./solana";
import { BN } from "bn.js";
import { SOL_MINT } from "./const";
import { executeJupUltraOrder, getJupUltraOrder } from "./jup-utils";
import { retry } from "./retry";

export type StrategyConfig = {
  spread: number; // in basis points
  acceptableDelta: number; // in basis points
  type: StrategyType;
  rebalanceBinThreshold: number; // in basis points
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
  private positionFetched = false;

  private isBusy = false;

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
    // Skip if already processing
    if (this.isBusy) {
      return;
    }

    // Ensure we have a position (fetch it if needed, but don't create yet)
    if (!this.positionFetched) {
      await this.fetchExistingPosition();
    }

    // If no position exists, create one
    if (this.position == null) {
      await this.safeExecute(async () => {
        this.position = await this.createPosition(marketPrice);
        if (this.position == null) {
          console.error("Failed to create position");
        }
      });
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

    if (marketPriceBinId < lowerThresholdBin || marketPriceBinId > upperThresholdBin) {
      console.log("Market price crossed threshold, triggering rebalance");

      await this.safeExecute(async () => {
        await this.rebalancePosition(marketPrice);
      });
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

  private async fetchExistingPosition(): Promise<void> {
    if (this.positionFetched) {
      return;
    }

    await this.safeExecute(async () => {
      const existingPositions = await this.dlmm.getPositionsByUserAndLbPair(
        this.userKeypair.publicKey,
      );

      if (existingPositions.userPositions.length > 0) {
        if (existingPositions.userPositions.length > 1) {
          console.warn("Found multiple positions for user, using the first one");
        }
        this.position = existingPositions.userPositions[0]!;
      }

      this.positionFetched = true;
    });
  }

  private async rebalancePosition(marketPrice: number): Promise<void> {
    if (!this.position) {
      console.error("Cannot rebalance: no position exists");
      return;
    }

    console.log("Removing liquidity...");

    const removeLiquidityTxs = await this.dlmm.removeLiquidity({
      user: this.userKeypair.publicKey,
      position: this.position.publicKey,
      fromBinId: this.position.positionData.lowerBinId,
      toBinId: this.position.positionData.upperBinId,
      bps: new BN(10000),
      shouldClaimAndClose: true,
      skipUnwrapSOL: false,
    });

    for (const tx of removeLiquidityTxs) {
      await sendAndConfirmTransaction(this.connection, tx, [this.userKeypair], {
        skipPreflight: false,
        commitment: "confirmed",
      });
    }

    this.position = null;
    this.position = await this.createPosition(marketPrice);
  }

  private async createPosition(marketPrice: number): Promise<LbPosition | null> {
    console.log("Creating position...");

    const inventory = await this.tryRebalanceInventory({
      marketPrice,
    });

    const { baseBalance, quoteBalance } = inventory;

    const basePositionValue = (baseBalance / 10 ** this.baseToken.decimals) * marketPrice;
    const quotePositionValue = quoteBalance / 10 ** this.quoteToken.decimals;

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
      totalBaseAmount: baseBalance,
      totalQuoteAmount: quoteBalance,
    });

    const positionKeypair = Keypair.generate();

    //For the record, if >26 bins are created for the bin spread we would have multiple txs
    const createPositionTx = await this.dlmm.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: positionKeypair.publicKey,
      strategy: {
        minBinId,
        maxBinId,
        strategyType: this.config.type,
        singleSidedX: false,
      },
      totalXAmount: new BN(baseBalance),
      totalYAmount: new BN(quoteBalance),
      user: this.userKeypair.publicKey,
      slippage: 500, // Liquiditidy slippage when adding liquidity to
    });

    const createBalancePositionTxHash = await sendAndConfirmTransaction(
      this.connection,
      createPositionTx,
      [this.userKeypair, positionKeypair],
      { skipPreflight: false, commitment: "confirmed" },
    );

    console.log(
      "Opened position",
      positionKeypair.publicKey.toBase58(),
      createBalancePositionTxHash,
    );

    const newPosition = await retry(
      async () => {
        const newPositions = await this.dlmm.getPositionsByUserAndLbPair(
          this.userKeypair.publicKey,
        );
        if (newPositions.userPositions.length === 0) {
          throw new Error("Position not found");
        }
        return newPositions.userPositions.find((position) =>
          position.publicKey.equals(positionKeypair.publicKey),
        )!;
      },
      {
        initialDelay: 1000,
        maxRetries: 5,
        maxDelay: 5000,
      },
    );

    return newPosition;
  }

  // Price is in terms of quote/base
  private async getInventory(price: number, _minContextSlot?: number) {
    const [baseBalance, quoteBalance] = await Promise.all([
      getTokenBalance(this.userKeypair.publicKey, this.baseToken.mint, this.connection),
      getTokenBalance(this.userKeypair.publicKey, this.quoteToken.mint, this.connection),
    ]);

    // Substract 0.05 of rent
    const baseBalanceNoRent =
      this.baseToken.mint === SOL_MINT ? baseBalance - 50000000 : baseBalance;

    const quoteBalanceNoRent = this.quoteToken.mint.equals(SOL_MINT)
      ? quoteBalance - 100000000
      : quoteBalance;
    const baseValue = (baseBalanceNoRent / 10 ** this.baseToken.decimals) * price; // Value of base tokens in terms of quote token
    const quoteValue = quoteBalanceNoRent / 10 ** this.quoteToken.decimals;

    return {
      baseBalance: baseBalanceNoRent,
      quoteBalance: quoteBalanceNoRent,
      baseValue,
      quoteValue,
    };
  }

  async tryRebalanceInventory(args: {
    marketPrice: number; // in terms of quote per base (quote/base)
  }) {
    const inventory = await this.getInventory(args.marketPrice);

    const { marketPrice } = args;
    const { baseValue, quoteValue } = inventory;

    // Check ratio for inventory assets
    const difference = Math.abs(1 - baseValue / quoteValue);

    if (difference > this.config.acceptableDelta / 10000) {
      console.log(`Discrepancy of ${difference} found, rebalancing...`);

      const { inputMint, outputMint, inputDecimals } =
        baseValue > quoteValue
          ? {
              inputMint: this.baseToken.mint,
              inputDecimals: this.baseToken.decimals,
              outputMint: this.quoteToken.mint,
            }
          : {
              inputMint: this.quoteToken.mint,
              inputDecimals: this.quoteToken.decimals,
              outputMint: this.baseToken.mint,
            };

      const swapValue = Math.abs(baseValue - quoteValue) / 2; // this is in terms of quote token

      /**
       * If inputMint is base, we need to convert the swapValue to the number of inputMint tokens
       * `swapValue` here is in terms of quote token, and marketPrice is in terms of quote/base
       * Thus, inputAmount = swapValue(quote) / marketPrice(quote/base) = base
       *
       * Whereas, if inputMint is quote, inputAmount is simply swapValue as it is already in terms of quote token
       */
      const inputAmount = inputMint === this.baseToken.mint ? swapValue / marketPrice : swapValue; // this is in terms of inputMint token

      console.log(`Swapping ${inputAmount} of token ${inputMint} for token ${outputMint}`);

      const jupUltraOrder = await getJupUltraOrder(
        inputMint,
        outputMint,
        inputAmount * 10 ** inputDecimals, // converting to raw token amount
        this.userKeypair.publicKey,
      );

      const executeResult = await executeJupUltraOrder(
        jupUltraOrder.transaction,
        jupUltraOrder.requestId,
        this.userKeypair,
      );

      const updatedInventory = await this.getInventory(marketPrice, Number(executeResult.slot));
      console.log("Successfully rebalanced inventory...", {
        rebalanceStats: {
          baseChange: updatedInventory.baseBalance - inventory.baseBalance,
          quoteChange: updatedInventory.quoteBalance - inventory.quoteBalance,
        },
      });
      return updatedInventory;
    }

    return inventory;
  }

  private async safeExecute<T>(callback: () => T | Promise<T>): Promise<T | null> {
    if (this.isBusy) {
      return null;
    }

    this.isBusy = true;

    try {
      const result = await callback();
      return result;
    } catch (error) {
      console.error("Error during strategy execution:", error);
      throw error;
    } finally {
      this.isBusy = false;
    }
  }
}
