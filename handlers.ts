import type { HermesClient } from "@pythnetwork/hermes-client";
import type { Strategy } from "./strategy";
import type { PublicKey } from "@solana/web3.js";
import type { ErrorEvent } from "eventsource";
import { retry } from "./retry";

export async function onMessage(event: MessageEvent<any>, strategy: Strategy) {
  try {
    const eventData = JSON.parse(event.data).parsed;

    // NOTE: We have to make sure the `[0]` is the base token and `[1]` is the quote token
    const marketPrice =
      eventData.length > 1
        ? eventData[0].price.price / eventData[1].price.price
        : eventData[0].price.price / 10 ** (-1 * eventData[0].price.expo);

    await strategy.run(marketPrice);
  } catch (error) {
    console.error("Error parsing event data:", error);
  }
}

export async function onError(
  error: ErrorEvent,
  eventSource: any,
  hermes: HermesClient,
  selectedPool: { priceFeeds: string[]; poolAddress: PublicKey },
  strategy: Strategy,
) {
  console.error("Error receiving updates:", error);
  const reconnectDelay = 3000; // ms

  // Attempt to reconnect after a short delay
  await retry(
    async () => {
      console.log(`Attempting to reconnect in ${reconnectDelay / 1000} seconds...`);

      // Remove previous listeners to prevent duplicating messages/reconnects
      eventSource.onmessage = null;
      eventSource.onerror = null;
      eventSource.close();

      try {
        const newEventSource = await hermes.getPriceUpdatesStream(selectedPool.priceFeeds, {
          parsed: true,
        });

        newEventSource.onmessage = async (event: MessageEvent<any>) => onMessage(event, strategy);

        newEventSource.onerror = async (error: ErrorEvent) =>
          onError(error, newEventSource, hermes, selectedPool, strategy);

        console.log("Reconnected to price update stream.");
        return newEventSource;
      } catch (reconnectError) {
        console.error("Failed to reconnect to price updates:", reconnectError);
      }
    },
    {
      initialDelay: reconnectDelay,
      maxRetries: 3,
      maxDelay: 12000,
    },
  );
}
