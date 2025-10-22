import { PublicKey, type Connection } from "@solana/web3.js";

const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

export async function getTokenBalance(
  user: PublicKey,
  mint: PublicKey,
  connection: Connection,
  minContextSlot?: number,
): Promise<number> {
  const response = await fetch(connection.rpcEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        user.toString(),
        { mint: mint.toString() },
        {
          commitment: "confirmed",
          encoding: "jsonParsed",
          minContextSlot: minContextSlot,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get token balance: ${response.statusText}`);
  }

  const data: any = await response.json();
  if (data.result == null) {
    throw new Error(`Failed to get token balance: ${data.error.message}`);
  }

  const tokenAccountBalance =
    data.result.value.length > 0
      ? Number(data.result.value[0].account.data.parsed.info.tokenAmount.amount)
      : 0;

  if (mint.equals(WSOL_MINT)) {
    const response = await fetch(connection.rpcEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [user.toString(), { commitment: "confirmed", minContextSlot: minContextSlot }],
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to get sol balance: ${response.statusText}`);
    }

    const data: any = await response.json();

    if (data.result == null) {
      throw new Error(`Failed to get sol balance: ${data.error.message}`);
    }

    const solBalance = Number(data.result.value);

    return Number(solBalance) + tokenAccountBalance;
  }

  return tokenAccountBalance;
}
