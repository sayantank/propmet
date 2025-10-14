import DLMM from "@meteora-ag/dlmm";
import { HermesClient } from "@pythnetwork/hermes-client";
import { Connection, PublicKey } from "@solana/web3.js";
import { sleep } from "bun";

const hermes = new HermesClient("https://hermes.pyth.network", {});

const connection = new Connection("https://api.mainnet-beta.solana.com");

// Create pool instances

// e.g. creating a DLMM pool
// You can get your desired pool address from the API https://dlmm-api.meteora.ag/pair/all
const JUP_USDC_POOL_ADDRESS = new PublicKey(
	"CrJao7TGHGq5BrS46Fn8joZLjTK9pU7ybgSSK4DNvLpC",
);
const dlmmPool = await DLMM.create(connection, JUP_USDC_POOL_ADDRESS);

const eventSource = await hermes.getPriceUpdatesStream(
	["0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996"],
	{
		parsed: true,
	},
);

eventSource.onmessage = async (event) => {
	const oraclePrice = BigInt(JSON.parse(event.data).parsed[0].price.price);
	const activeBin = await dlmmPool.getActiveBin();
	console.log({ activeBin, oraclePrice });
};

eventSource.onerror = (error) => {
	console.error("Error receiving updates:", error);
	eventSource.close();
};

await sleep(10000);

eventSource.close();
