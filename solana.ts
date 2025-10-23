import {
  Connection,
  PublicKey,
  type Commitment,
  type Finality,
  type TransactionResponse,
} from "@solana/web3.js";
import { retry } from "./retry";

const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

export class Solana {
  readonly connection: Connection;
  constructor(
    private readonly urls: {
      read: string;
      write: string;
    },
    readonly commitment: Commitment = "confirmed",
  ) {
    this.connection = new Connection(this.urls.read, commitment);
  }

  async sendTransaction(transaction: string, commitment?: Commitment): Promise<string> {
    const response = await fetch(this.urls.write, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: [
          transaction,
          {
            skipPreflight: false,
            commitment: commitment ?? this.commitment,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`Failed to send transaction: ${response.statusText}`);
      throw new Error(`Failed to send transaction: ${response.statusText}`);
    }

    const data: any = await response.json();
    if (data.result == null) {
      console.error(`Error sending transaction: ${data}`);
      throw new Error(`Error sending transaction: ${data}`);
    }

    return data.result;
  }

  async confirmTransactions(
    signatures: string[],
    _commitment?: Finality,
  ): Promise<TransactionResponse[] | null> {
    try {
      const transactions = await retry(
        async () => {
          const txs = await this.connection.getTransactions(signatures, {
            commitment: "confirmed",
          });

          if (txs.length !== signatures.length) {
            throw new Error("Transaction not found");
          }

          const confirmedTxs = txs.map((tx) => tx).filter((t) => t != null);

          return confirmedTxs;
        },
        {
          maxRetries: 5,
          initialDelay: 400,
          maxDelay: 5000,
        },
      );

      return transactions;
    } catch (error) {
      console.error(`Error confirming transaction: ${error}`);
      return null;
    }
  }
}

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
