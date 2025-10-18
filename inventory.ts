// valueTokenX -> Value of token X in base
// valueTokenY -> Value of token Y in base

import type { Keypair, PublicKey } from "@solana/web3.js";
import { executeJupUltraOrder, getJupUltraOrder } from "./jup-utils";

export async function rebalanceRatio(
  totalValueTokenBase: number,
  tokenBaseMint: PublicKey,
  tokenBaseDecimals: number,
  totalValueTokenQuote: number,
  tokenQuoteMint: PublicKey,
  tokenQuoteDecimals: number,
  keypair: Keypair,
  discrepancy: number,
  marketPrice: number,
) {
  // Check ratio for inventory assets
  const difference = Math.abs(1 - totalValueTokenBase / totalValueTokenQuote);
  if (difference > discrepancy) {
    console.log(`Discrepancy of ${difference} found`);
    console.log(`base greater than Quote? ${totalValueTokenBase > totalValueTokenQuote}`);
    console.log(`Quote greater than Base? ${totalValueTokenQuote > totalValueTokenBase}`);
    console.log(`totalValueTokenQuote ${totalValueTokenQuote}`);
    console.log(`totalValueTokenBase ${totalValueTokenBase}`);

    if (totalValueTokenBase > totalValueTokenQuote) {
      const valueNeeded = (totalValueTokenBase - totalValueTokenQuote) / 2;
      console.log(
        `I need ${valueNeeded} value of token Quote - ${tokenQuoteMint} and need to aswap token base`,
      );

      // Covert back value of token X in base to the number of tokens needed for rebalancing
      const inputAmount = valueNeeded * marketPrice;
      console.log(`Swapping ${inputAmount} of token base ${tokenBaseMint} for token quote`);

      const jupUltraOrder = await getJupUltraOrder(
        tokenBaseMint,
        tokenQuoteMint,
        inputAmount * 10 ** tokenBaseDecimals,
        keypair.publicKey,
      );

      await executeJupUltraOrder(jupUltraOrder.transaction, jupUltraOrder.requestId, keypair);
      console.log(`Successfully rebalance ${tokenBaseMint} to ${tokenQuoteMint}`);
    } else {
      const valueNeeded = (totalValueTokenQuote - totalValueTokenBase) / 2;
      console.log(
        `I need $${valueNeeded} of token Base - ${tokenBaseMint} for the value o f token quote `,
      );
      // Covert back value of token Y in base to the number of tokens needed for rebalancing
      console.log(`Swapping  ${valueNeeded} of token quote ${tokenQuoteMint}`);
      const jupUltraOrder = await getJupUltraOrder(
        tokenQuoteMint,
        tokenBaseMint,
        valueNeeded * 10 ** tokenQuoteDecimals,
        keypair.publicKey,
      );

      await executeJupUltraOrder(jupUltraOrder.transaction, jupUltraOrder.requestId, keypair);
      console.log(`Swapping rebalance ${tokenQuoteMint} to ${tokenBaseMint}`);
    }
  }
}
