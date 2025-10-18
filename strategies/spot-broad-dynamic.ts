import type { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { Strategy } from "./interface";
import type { HermesClient } from "@pythnetwork/hermes-client";
import type { PositionLiquidityBins } from "../types";
import DLMM, {
	BinLiquidity,
	StrategyType,
	type LbPosition,
} from "@meteora-ag/dlmm";
import { createBalancedPositionAndAddLiquidity } from "../dlmm";
import { getTokenBalance } from "../utils";

export class SpotBroadDynamicStrategy implements Strategy {
	bins: PositionLiquidityBins;
	dynamicBins: PositionLiquidityBins;
	lastRebalanceTimestamp: number;
	isUpdatingPosition: boolean;
	connection: Connection;
	keypair: Keypair;
	tokenX: PublicKey;
	tokenY: PublicKey;
	tokenXDecimals: number;
	lastPrice: number;
	dlmmPool: DLMM;
	dlmmPoolAddress: PublicKey;
	hermesClient: HermesClient;
	eventSource: any;
	oracleId: string;
	volatilityMetadata: {
		priceA: number;
		timestampA: number;
		priceB: number;
		timestampB: number;
	};

	SPOT_PRICE_SPREAD = 2;
	DYNAMIC_PRICE_SPREAD = 1;
	IMPERMANENT_LOSS_THRESHOLD = 2;
	VOLATILITY_THRESHOLD = 3;

	constructor(
		connection: Connection,
		keypair: Keypair,
		tokenX: PublicKey,
		tokenY: PublicKey,
		dlmmPoolAddress: PublicKey,
		hermesClient: HermesClient,
		oracleId: string,
	) {
		this.connection = connection;
		this.keypair = keypair;
		this.tokenX = tokenX;
		this.tokenY = tokenY;
		this.dlmmPoolAddress = dlmmPoolAddress;
		this.hermesClient = hermesClient;
		this.oracleId = oracleId;
		this.isUpdatingPosition = false;
		this.lastRebalanceTimestamp = 0;
		this.tokenXDecimals = 0;
		this.lastPrice = 0;
		// Initialize bins and dlmmPool - you'll need to implement these
		this.bins = {} as PositionLiquidityBins;
		this.dynamicBins = {} as PositionLiquidityBins;
		this.dlmmPool = {} as DLMM;
		this.eventSource = {} as EventSource;
		this.volatilityMetadata = {
			priceA: 0,
			timestampA: 0,
			priceB: 0,
			timestampB: 0,
		};
	}

	run(): void {
		// TODO: Implement strategy run logic
		throw new Error("Method not implemented.");
	}

	async setup(): Promise<void> {
		this.dlmmPool = await DLMM.create(this.connection, this.dlmmPoolAddress);
		this.eventSource = await this.hermesClient.getPriceUpdatesStream(
			[this.oracleId],
			{
				parsed: true,
			},
		);

		this.openInitialPosition();

		this.eventSource.onmessage = async (event) => {
			return;

			console.log("------- PRICE UPDATE --------");
			const parsed = JSON.parse(event.data).parsed[0];

			const price = BigInt(parsed.price.price);
			const expo = parsed.price.expo;
			const oraclePrice = Number(price) * 10 ** expo;

			const [binForPrice, activeBin, dynamicFee, currentPosition] =
				await Promise.all([
					this.dlmmPool.getBinIdFromPrice(oraclePrice, true),
					this.dlmmPool.getActiveBin(),
					this.dlmmPool.getDynamicFee(),
					this.bins.positionAccount != null
						? this.dlmmPool
								.getPosition(this.bins.positionAccount)
								.catch(() => undefined)
						: Promise.resolve(undefined),
				]);

			console.log("DynamicFee", dynamicFee);
			console.log("Oracle Price", oraclePrice);
			console.log("Opening Price", this.bins.openingPrice);
			const drift =
				((oraclePrice - Number(activeBin.price)) / Number(activeBin.price)) *
				100;
			console.log("Price Drift", drift, "%");

			if (!this.isUpdatingPosition) {
				try {
					this.isUpdatingPosition = true;
					const resultPosition = await this.tryRebalance(
						oraclePrice,
						this.lastPrice,
						this.bins,
						binForPrice,
						activeBin,
						this.lastRebalanceTimestamp,
						currentPosition,
					);

					if (resultPosition != null) {
						this.bins = {
							openBin: resultPosition?.openBin,
							leftBin: resultPosition?.leftBin,
							rightBinId: resultPosition?.rightBinId,
							positionAccount: resultPosition?.positionAccount,
							openingPrice: oraclePrice,
						};
					}

					this.lastPrice = oraclePrice;
				} catch (e) {
					console.log(e);
				} finally {
					this.isUpdatingPosition = false;
				}
			}
		};
	}

	tryRebalance(
		price: number,
		lastMidPrice: number,
		bins: PositionLiquidityBins,
		binForPrice: number,
		activeBin: BinLiquidity,
		lastRebalance: number,
		currentPosition?: LbPosition,
	): void {
		// TODO: Implement rebalance logic
		throw new Error("Method not implemented.");
	}

	shouldRebalance(): boolean {
		// TODO: Implement rebalance condition logic
		throw new Error("Method not implemented.");
	}

	async openInitialPosition() {
		const initialPriceUpdate = await this.hermesClient.getLatestPriceUpdates([
			this.oracleId,
		]);

		if (
			initialPriceUpdate.parsed == null ||
			initialPriceUpdate.parsed[0] == null
		) {
			throw new Error("Eror Openining Inital Position");
		}

		const parsedPrice =
			Number(initialPriceUpdate.parsed[0].price.price) *
			10 ** initialPriceUpdate.parsed[0].price.expo;
		console.log(parsedPrice);
		console.log("1a", parsedPrice * (1 - this.SPOT_PRICE_SPREAD / 100));
		console.log("1b", parsedPrice * (1 + this.SPOT_PRICE_SPREAD / 100));
		// Get base values for opening positions
		const [
			minBin,
			maxBin,
			activeBin,
			binForPrice,
			tokenBalance,
			dynamicMinBin,
			dynamicMaxBin,
		] = await Promise.all([
			this.dlmmPool.getBinIdFromPrice(
				parsedPrice * (1 - this.SPOT_PRICE_SPREAD / 100),
				true,
			),
			this.dlmmPool.getBinIdFromPrice(
				parsedPrice * (1 + this.SPOT_PRICE_SPREAD / 100),
				true,
			),
			this.dlmmPool.getActiveBin(),
			this.dlmmPool.getBinIdFromPrice(parsedPrice, true),
			getTokenBalance(this.keypair, this.tokenX, this.connection),
			this.dlmmPool.getBinIdFromPrice(
				parsedPrice * (1 - this.DYNAMIC_PRICE_SPREAD / 100),
				true,
			),
			this.dlmmPool.getBinIdFromPrice(
				parsedPrice * (1 + this.DYNAMIC_PRICE_SPREAD / 100),
				true,
			),
		]);
		console.log("params");
		console.log(
			minBin,
			maxBin,
			activeBin,
			binForPrice,
			tokenBalance,
			dynamicMinBin,
			dynamicMaxBin,
		);
		const result = await createBalancedPositionAndAddLiquidity(
			binForPrice,
			activeBin,
			this.dlmmPool,
			this.keypair,
			this.connection,
			StrategyType.Spot,
			minBin,
			maxBin,
			// Base strategy has 0.7 of assets
			tokenBalance * 0.7,
			this.tokenXDecimals,
		);

		if (result == null) {
			throw new Error("Error creating initial position");
		}

		console.log(
			"Created initial position for token",
			this.tokenX,
			result.positionAccount?.toBase58(),
		);
		this.bins = result;

		// Balance updated after position created
		const newBalance = await getTokenBalance(
			this.keypair,
			this.tokenX,
			this.connection,
		);

		console.log("ACive bibn", activeBin);
		console.log("min bibn", dynamicMinBin);
		console.log("max bibn", dynamicMaxBin);

		console.log("New balance", newBalance);
		const dynamicResult = await createBalancedPositionAndAddLiquidity(
			binForPrice,
			activeBin,
			this.dlmmPool,
			this.keypair,
			this.connection,
			StrategyType.Curve,
			dynamicMinBin,
			dynamicMaxBin,
			// Base strategy has 0.7 of assets
			newBalance,
			this.tokenXDecimals,
		);

		if (dynamicResult == null) {
			throw new Error("Error creating dynamic initial position");
		}

		console.log(
			"Created dynamic initial position for token",
			this.tokenX,
			dynamicResult.positionAccount,
		);
		this.dynamicBins = dynamicResult;
	}
}
