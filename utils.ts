import type { Connection, Keypair, PublicKey } from "@solana/web3.js";

export async function getTokenBalance(
	user: Keypair,
	mint: PublicKey,
	connection: Connection,
): Promise<number> {
	const { value: tokenAccounts } =
		await connection.getParsedTokenAccountsByOwner(user.publicKey, { mint });
	if (tokenAccounts.length === 0) return 0;
	const accountInfo = tokenAccounts?.[0]?.account.data.parsed.info;
	return Number(accountInfo.tokenAmount.amount);
}
