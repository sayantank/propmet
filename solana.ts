import {
  Connection,
  PublicKey,
  type Commitment,
  type Finality,
  type TransactionResponse,
} from "@solana/web3.js";

const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

export class Solana {
  readonly connection: Connection;
  constructor(
    private readonly urls: {
      read: string;
      write: string;
      ws: string;
    },
    readonly commitment: Commitment = "confirmed",
  ) {
    this.connection = new Connection(this.urls.read, {
      wsEndpoint: this.urls.ws,
      commitment,
    });
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

  // Either confirm or throw exception on confirmation
  async confirmTransactions(signatures: string[], _commitment?: Finality): Promise<void> {
    // Confirm transactions using websocket subscription to onSignature
    try {
      const waitForConfirmation = (
        signature: string,
        commitment: Commitment = "confirmed",
      ): Promise<TransactionResponse | null> => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Timeout waiting for confirmation for signature: ${signature}`));
          }, 60_000); // 1 min timeout per tx, adjust as desired

          const subId = this.connection.onSignature(
            signature,
            async (result) => {
              clearTimeout(timeout);
              // remove listener after response
              try {
                await this.connection.removeSignatureListener(subId);
              } catch (e) {
                // ignore
                console.log(e);
              }
              if (result.err) {
                reject(new Error("Transaction failed: " + JSON.stringify(result.err)));
              } else {
                // Fetch and return the full tx info if possible, otherwise just return success
                try {
                  const tx = await this.connection.getTransaction(signature, {
                    commitment: "confirmed",
                  });
                  resolve(null);
                } catch (e) {
                  // Transaction could already be dropped from RPC node, return null as ok
                  reject(e);
                }
              }
            },
            commitment,
          );
        });
      };

      await Promise.all(signatures.map((signature) => waitForConfirmation(signature, "confirmed")));
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
