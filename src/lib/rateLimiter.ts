import PQueue from "p-queue";
import pRetry, { FailedAttemptError } from "p-retry";

const REQUESTS_PER_MINUTE_MAX = 1000; // DatoCMS CDA limit https://www.datocms.com/docs/content-delivery-api/technical-limits#cda-rate-limits
const SAFETY_FACTOR = 0.9; // Just to account for network jitter

// Create a queue to space out our requests as evenly ass possible
const queue = new PQueue({
  intervalCap: 1,
  interval: (REQUESTS_PER_MINUTE_MAX * SAFETY_FACTOR) / 60000,
  carryoverConcurrencyCount: true,
});

export async function fetchWithRateLimit(
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  const fetchWithRetryHandler = () =>
    pRetry(
      async () => {
        const response = await fetch(input, init);

        if (!response?.ok) {
          // throw to trigger retry logic
          throw new Error("Fetch error inside rate limiter", {
            cause: response,
          });
        }

        return response;
      },
      {
        retries: 10,
        factor: 2,
        minTimeout: 1_000,
        maxTimeout: 60_000,
        onFailedAttempt(err: FailedAttemptError) {
          if (isRateLimitError(err)) {
            console.warn(
              `429 rate limited, will auto-retry ${err.retriesLeft} more times`,
              err,
            );
          } else {
            throw new Error("Non rate-limit error detected, aborting fetch", {
              cause: err,
            });
          }
        },
        shouldRetry(err: FailedAttemptError) {
          return isRateLimitError(err);
        },
      },
    );

  const result = await queue.add(fetchWithRetryHandler);

  if (!(result instanceof Response)) {
    throw new Error(
      `fetchWithRateLimit: Unexpected result (${typeof result}), expected Response`,
    );
  }

  return result;
}

const isRateLimitError = (err: FailedAttemptError): boolean =>
  err.cause instanceof Response && err.cause.status === 429;
