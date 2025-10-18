// valueTokenX -> Value of token X in base
// valueTokenY -> Value of token Y in base

import type { Keypair, PublicKey } from "@solana/web3.js";
import { executeJupUltraOrder, getJupUltraOrder } from "./jup-utils";

export async function rebalanceRatio(
  totalValueTokenX: number,
  tokenXMint: PublicKey,
  tokenXBaseValue: number,
  totalValueTokenY: number,
  tokenYMint: PublicKey,
  tokenYBaseValue: number,
  keypair: Keypair,
  discrepancy: number,
) {
  // Check ratio for inventory assets
  const difference = Math.abs(1 - totalValueTokenX / totalValueTokenY);
  if (difference > discrepancy) {
    console.log(`Discrepancy of ${difference} found`);
    if (totalValueTokenX > totalValueTokenY) {
      const valueNeeded = totalValueTokenY - totalValueTokenX;
      // Covert back value of token X in base to the number of tokens needed for rebalancing
      const inputAmount = valueNeeded / tokenXBaseValue;
      const jupUltraOrder = await getJupUltraOrder(
        tokenXMint,
        tokenYMint,
        inputAmount,
        keypair.publicKey,
      );

      await executeJupUltraOrder(jupUltraOrder.transaction, jupUltraOrder.requestId, keypair);
      console.log(`Successfully rebalance ${tokenXMint} to ${tokenYMint}`);
    } else {
      const valueNeeded = totalValueTokenX - totalValueTokenY;
      // Covert back value of token Y in base to the number of tokens needed for rebalancing
      const inputAmount = valueNeeded / tokenYBaseValue;
      const jupUltraOrder = await getJupUltraOrder(
        tokenYMint,
        tokenXMint,
        inputAmount,
        keypair.publicKey,
      );

      await executeJupUltraOrder(jupUltraOrder.transaction, jupUltraOrder.requestId, keypair);
      console.log(`Successfully rebalance ${tokenYMint} to ${tokenXMint}`);
    }
  }
}
