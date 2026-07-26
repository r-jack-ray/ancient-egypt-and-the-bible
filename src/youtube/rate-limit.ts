export interface RateLimiterOptions {
  delayMs: number;
  baseFetch?: typeof fetch;
  logger?: (message: string) => void;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
}

export class YoutubeRequestError extends Error {
  constructor(
    message: string,
    readonly classification: "rate_limited_or_blocked" | "fetch_failed",
    readonly retryAfter?: string,
  ) {
    super(message);
  }
}

export function createRateLimitedFetch(options: RateLimiterOptions): typeof fetch {
  const baseFetch = options.baseFetch ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
  );
  const timeoutMs = options.timeoutMs ?? 30_000;
  let previousStart: number | undefined;
  let chain = Promise.resolve();

  return (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    const run = async (): Promise<Response> => {
      if (previousStart !== undefined) {
        const wait = Math.max(0, previousStart + options.delayMs - now());
        if (wait > 0) {
          options.logger?.(`Waiting ${Math.ceil(wait / 1000)}s before the next YouTube request.`);
          await sleep(wait);
        }
      }
      previousStart = now();
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = init?.signal == null ? timeout : AbortSignal.any([init.signal, timeout]);
      let response: Response;
      try {
        response = await baseFetch(input, { ...init, signal });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Network request failed.";
        throw new YoutubeRequestError(`YouTube request failed: ${message}`, "fetch_failed");
      }
      if (response.status === 429 || response.status === 403) {
        const retryAfter = sanitizeRetryAfter(response.headers.get("retry-after"));
        throw new YoutubeRequestError(
          `YouTube request blocked with HTTP ${response.status}.`,
          "rate_limited_or_blocked",
          retryAfter,
        );
      }
      if (!response.ok) {
        throw new YoutubeRequestError(
          `YouTube request failed with HTTP ${response.status}.`,
          "fetch_failed",
        );
      }
      return response;
    };
    const result = chain.then(run, run);
    chain = result.then(() => undefined, () => undefined);
    return result;
  }) as typeof fetch;
}

function sanitizeRetryAfter(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }
  const trimmed = value.trim().slice(0, 64);
  return /^[0-9]+$|^[A-Za-z]{3},/u.test(trimmed) ? trimmed : undefined;
}
