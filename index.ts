import { HermesClient } from "@pythnetwork/hermes-client";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import "dotenv/config";
import { SpotBroadDynamicStrategy } from "./strategies/spot-broad-dynamic";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const JUP_MINT = new PublicKey("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN");

if (process.env.SECRET_KEY == null) {
	throw new Error("Secret key for wallet missing");
}

if (process.env.RPC_URL == null) {
	throw new Error("RPC URL for missing");
}

const hermesClient = new HermesClient("https://hermes.pyth.network", {});

const secretKey = Uint8Array.from(
	process.env.SECRET_KEY.split(",").map((v) => Number(v.trim())),
);

const connection = new Connection(process.env.RPC_URL);

const user = Keypair.fromSecretKey(secretKey);

// Create pool instances

// e.g. creating a DLMM pool
// You can get your desired pool address from the API https://dlmm-api.meteora.ag/pair/all
const JUP_USDC_POOL_ADDRESS = new PublicKey(
	"BhQEFZCRnWKQ21LEt4DUby7fKynfmLVJcNjfHNqjEF61",
);

async function main() {
	const strategy = new SpotBroadDynamicStrategy(
		connection,
		user,
		JUP_MINT,
		USDC_MINT,
		JUP_USDC_POOL_ADDRESS,
		hermesClient,
		"0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996",
	);

	strategy.setup();
}

main().catch((e) => console.log(e));
