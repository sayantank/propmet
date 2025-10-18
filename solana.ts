import { PublicKey, type Connection } from "@solana/web3.js";

const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

export async function getTokenBalance(
  user: PublicKey,
  mint: PublicKey,
  connection: Connection,
): Promise<number> {
  const { value: tokenAccounts } = await connection.getParsedTokenAccountsByOwner(user, { mint });

  const tokenAccountBalance =
    tokenAccounts.length > 0
      ? Number(tokenAccounts[0]?.account.data.parsed.info.tokenAmount.amount)
      : 0;

  if (mint.equals(WSOL_MINT)) {
    const solBalance = await connection.getBalance(user);
    return Number(solBalance) + tokenAccountBalance;
  }

  return tokenAccountBalance;
}
