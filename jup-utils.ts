import {
	Connection,
	PublicKey,
	sendAndConfirmTransaction,
	Transaction,
	type Keypair,
} from "@solana/web3.js";
import axios from "axios";
import type BN from "bn.js";

export const SLIPPAGE_BPS = 100;

interface JupiterQuoteParams {
	inputMint: string;
	outputMint: string;
	amount: string | number;
	slippageBps?: number;
}

export async function getJupiterQuote({
	inputMint,
	outputMint,
	amount,
	slippageBps = SLIPPAGE_BPS,
}: JupiterQuoteParams) {
	try {
		const response = await axios.get("https://lite-api.jup.ag/swap/v1/quote", {
			params: {
				inputMint,
				outputMint,
				amount,
				slippageBps,
				restrictIntermediateTokens: true,
				maxAccounts: 32,
			},
		});
		return response.data;
	} catch (error: unknown) {
		if (axios.isAxiosError(error)) {
			console.error(
				"Error fetching Jupiter quote:",
				error.response?.data || error.message,
			);
		} else {
			console.error("Error fetching Jupiter quote:", error);
		}
		throw error;
	}
}

interface JupiterSwapInstructionsParams {
	quoteResponse: unknown;
	userPublicKey: string;
}

export async function getJupiterSwapInstructions({
	quoteResponse,
	userPublicKey,
}: JupiterSwapInstructionsParams) {
	try {
		const response = await axios.post(
			"https://lite-api.jup.ag/swap/v1/swap-instructions",
			{
				quoteResponse,
				userPublicKey,
			},
			{
				headers: { "Content-Type": "application/json" },
			},
		);

		if (response.data?.error) {
			throw new Error(
				`Failed to get swap instructions: ${response.data.error}`,
			);
		}

		return response.data;
	} catch (error: unknown) {
		if (axios.isAxiosError(error)) {
			console.error(
				"Error getting swap instructions:",
				error.response?.data || error.message,
			);
		} else {
			console.error("Error getting swap instructions:", error);
		}
		throw error;
	}
}

export async function getJupiterSwapTransaction({
	quoteResponse,
	userPublicKey,
}: JupiterSwapInstructionsParams): Promise<{
	swapTransaction: string;
	lastValidBlockHeight: number;
	prioritizationFeeLamports: number;
}> {
	try {
		const response = await axios.post(
			"https://lite-api.jup.ag/swap/v1/swap-instructions",
			{
				quoteResponse,
				userPublicKey,
			},
			{
				headers: { "Content-Type": "application/json" },
			},
		);

		if (response.data?.error) {
			throw new Error(
				`Failed to get swap instructions: ${response.data.error}`,
			);
		}

		return response.data;
	} catch (error: unknown) {
		if (axios.isAxiosError(error)) {
			console.error(
				"Error getting swap instructions:",
				error.response?.data || error.message,
			);
		} else {
			console.error("Error getting swap instructions:", error);
		}
		throw error;
	}
}

export async function swapToken(
	inputToken: PublicKey,
	outputToken: PublicKey,
	amount: BN,
	signer: Keypair,
	connection: Connection,
) {
	const quoteResponse = await getJupiterQuote({
		inputMint: inputToken.toString(),
		outputMint: outputToken.toString(),
		amount: amount.toString(),
		slippageBps: SLIPPAGE_BPS,
	});

	const swapTxResponse = await getJupiterSwapTransaction({
		quoteResponse,
		userPublicKey: signer.publicKey.toBase58(),
	});

	const allTxBuf = Buffer.from(swapTxResponse.swapTransaction, "base64");

	const swapTx = Transaction.from(allTxBuf);

	const swapTxHash = await sendAndConfirmTransaction(
		connection,
		swapTx,
		[signer],
		{ skipPreflight: false },
	);

	console.log("Swapped inventory");
}
