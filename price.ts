import type { PublicKey } from "@solana/web3.js";

export async function getPrice(mint: PublicKey): Promise<number> {
  const url = new URL("https://lite-api.jup.ag/price/v3");
  url.searchParams.set("ids", mint.toString());

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`[getPrice] HTTP ${res.status} for mint ${mint}`);
  }

  const json: any = await res.json();

  const entry = json?.[mint.toString()];
  if (entry == null || entry.usdPrice == null) {
    throw new Error(`[getPrice] no price field for mint ${mint}`);
  }

  return entry.usdPrice as number;
}
