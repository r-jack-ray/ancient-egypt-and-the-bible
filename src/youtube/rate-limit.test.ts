import assert from "node:assert/strict";
import { test } from "node:test";

import { createRateLimitedFetch, YoutubeRequestError } from "./rate-limit.js";

test("rate limiter spaces every outbound request", async () => {
  let clock = 1_000;
  const waits: number[] = [];
  const starts: number[] = [];
  const limited = createRateLimitedFetch({
    delayMs: 500,
    now: () => clock,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
      clock += milliseconds;
    },
    baseFetch: async () => {
      starts.push(clock);
      return new Response("ok");
    },
  });
  await limited("https://example.test/one");
  clock += 100;
  await limited("https://example.test/two");
  assert.deepEqual(waits, [400]);
  assert.deepEqual(starts, [1_000, 1_500]);
});

test("429 is classified as blocking and exposes only sanitized Retry-After", async () => {
  const limited = createRateLimitedFetch({
    delayMs: 0,
    baseFetch: async () =>
      new Response("", { status: 429, headers: { "retry-after": "120" } }),
  });
  await assert.rejects(
    limited("https://example.test"),
    (error: unknown) =>
      error instanceof YoutubeRequestError &&
      error.classification === "rate_limited_or_blocked" &&
      error.retryAfter === "120",
  );
});
