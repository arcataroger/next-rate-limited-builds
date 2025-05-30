import PQueue from "p-queue";

const REQUESTS_PER_MINUTE_MAX = 1000;
const SAFETY_FACTOR = 0.9;

const queue = new PQueue({
  intervalCap: 1,
  interval: (REQUESTS_PER_MINUTE_MAX * SAFETY_FACTOR) / 60000,
  carryoverConcurrencyCount: false,
});

// Shared rate limit state
let globalTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let globalTimeoutEnd = 0;

function scheduleGlobalPause(waitMs: number) {
  const now = Date.now();
  const newTimeoutEnd = now + waitMs;

  if (newTimeoutEnd > globalTimeoutEnd) {
    globalTimeoutEnd = newTimeoutEnd;

    if (globalTimeoutHandle) {
      clearTimeout(globalTimeoutHandle);
    }

    if (!queue.isPaused) {
      queue.pause();
    }

    globalTimeoutHandle = setTimeout(() => {
      queue.start();
      globalTimeoutHandle = null;
      globalTimeoutEnd = 0;
    }, waitMs);
  }
}

export async function fetchWithRateLimit(
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  const result = await queue.add<Response>(async (): Promise<Response> => {
    const res = await fetch(input, init);

    if (res.ok) {
      return res;
    }

    if (res.status === 429) {
      const resetHeader = res.headers.get("x-ratelimit-reset");
      const delaySeconds = resetHeader ? Number(resetHeader) : 3;
      const waitMs = delaySeconds * 1000;

      scheduleGlobalPause(waitMs);

      // Retry after some delay
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return fetchWithRateLimit(input, init);
    }

    throw new Error(`HTTP ${res.status}`, { cause: res });
  });

  if (!(result instanceof Response)) {
    throw new Error("Unhandled response type", { cause: result });
  }

  return result;
}
