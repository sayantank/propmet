export interface RetryOptions {
  maxRetries: number;
  initialDelay?: number; // in milliseconds
  maxDelay?: number; // in milliseconds
  backoffMultiplier?: number; // default is 2 for exponential backoff
}

/**
 * Retry a callback function with exponential backoff
 * @param callback - The function to retry (can be sync or async)
 * @param options - Retry configuration options
 * @returns The result of the callback function
 * @throws The last error if all retries fail
 */
export async function retry<T>(callback: () => T | Promise<T>, options: RetryOptions): Promise<T> {
  const { maxRetries, initialDelay = 100, maxDelay = 30000, backoffMultiplier = 2 } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await callback();
      return result;
    } catch (error) {
      console.log("Retry failed...");
      lastError = error;

      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Wait before retrying with exponential backoff
      await sleep(Math.min(delay, maxDelay));

      // Increase delay exponentially for next retry
      delay *= backoffMultiplier;
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Helper function to sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
