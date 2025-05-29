// lib/fetchWithPQueue.ts
import PQueue from "p-queue";
import pRetry from "p-retry";

// ─── Queue configuration ───────────────────────────────────────────────
//   • at most 1 000 tasks started per 60 000 ms
//   • up to 40 tasks running in parallel
//   • carryoverConcurrencyCount allows leftover rate slots to “carry”
//     into the next interval
const queue = new PQueue({
  intervalCap: 1000,
  interval: 60_000,
  concurrency: 40,
  carryoverConcurrencyCount: true,
});

// ─── Exported helper ──────────────────────────────────────────────────
// Accepts ANY promise-returning function, retries up to 3× on HTTP 429
export const rateLimiter = async <T>(
  fn: () => Promise<T>,
): Promise<void | T> => {
  try {
    return await queue.add(() =>
      pRetry(fn, {
        retries: 3,
        factor: 2,
        minTimeout: 5_000, // 5s → 10s → 20s
        maxTimeout: 60_000, // cap at 1 min
        onFailedAttempt: (err) => {
          console.error(
            `Attempt ${err.attemptNumber} failed; ${err.retriesLeft} retries left.`,
            err,
          );
        },
      }),
    );
  } catch (err) {
    console.error("fetchWithPQueue final error:", err);
    throw err;
  }
};
