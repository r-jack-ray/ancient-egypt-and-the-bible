import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createYoutubeDataApiClient,
  YoutubeDataApiError,
} from "./data-api.js";

const channelFixture = {
  items: [{
    id: "channel-id",
    contentDetails: { relatedPlaylists: { uploads: "uploads-id" } },
  }],
};

const playlistFixture = {
  items: [
    { contentDetails: { videoId: "abcdefghijk" } },
    {},
    { contentDetails: { videoId: "ZYXWVUTSRQP" } },
  ],
  nextPageToken: "next-page",
};

const videosFixture = {
  items: [{
    id: "abcdefghijk",
    snippet: {
      title: "Live Stream #1: Fixture",
      publishedAt: "2026-08-01T00:00:00Z",
      liveBroadcastContent: "none",
    },
    contentDetails: { duration: "PT1H2M3S" },
    status: { privacyStatus: "public", uploadStatus: "processed" },
    liveStreamingDetails: {
      scheduledStartTime: "2026-08-01T00:00:00Z",
      actualStartTime: "2026-08-01T00:01:00Z",
      actualEndTime: "2026-08-01T01:01:00Z",
    },
  }],
};

test("narrow client requests and normalizes the three YouTube API endpoints", async () => {
  const requests: { url: URL; accept: string | null }[] = [];
  const mockFetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, accept: new Headers(init?.headers).get("accept") });
    if (url.pathname.endsWith("/channels")) return jsonResponse(channelFixture);
    if (url.pathname.endsWith("/playlistItems")) return jsonResponse(playlistFixture);
    if (url.pathname.endsWith("/videos")) return jsonResponse(videosFixture);
    return jsonResponse({ error: { message: "Unexpected endpoint." } }, 404);
  }) as typeof fetch;
  const client = createYoutubeDataApiClient({ apiKey: "fixture-key", fetch: mockFetch });

  assert.deepEqual(await client.fetchChannelUploads("fixture-handle"), {
    channelId: "channel-id",
    uploadsPlaylistId: "uploads-id",
  });
  assert.deepEqual(await client.fetchPlaylistVideoPage("uploads-id"), {
    videoIds: ["abcdefghijk", "ZYXWVUTSRQP"],
    nextPageToken: "next-page",
  });
  assert.deepEqual(await client.fetchVideos(["abcdefghijk"]), videosFixture.items);

  assert.deepEqual(requests.map(({ url }) => url.pathname.split("/").at(-1)), [
    "channels",
    "playlistItems",
    "videos",
  ]);
  assert.ok(requests.every(({ url }) => url.searchParams.get("key") === "fixture-key"));
  assert.ok(requests.every(({ accept }) => accept === "application/json"));
  assert.equal(requests[0]?.url.searchParams.get("forHandle"), "fixture-handle");
  assert.equal(requests[1]?.url.searchParams.get("maxResults"), "50");
  assert.equal(requests[2]?.url.searchParams.get("id"), "abcdefghijk");
  assert.equal(
    requests[2]?.url.searchParams.get("part"),
    "snippet,contentDetails,status,liveStreamingDetails",
  );
});

test("partial API resources remain usable while malformed shapes are rejected", async () => {
  const responses = [
    jsonResponse({ items: [{}] }),
    jsonResponse({ items: [{}, { contentDetails: { videoId: null } }] }),
    jsonResponse({ items: [{ snippet: { title: "Partial video" } }] }),
  ];
  const partialFetch = (async () => {
    const response = responses.shift();
    if (response === undefined) throw new Error("Unexpected fixture request.");
    return response;
  }) as typeof fetch;
  const client = createYoutubeDataApiClient({ apiKey: "fixture-key", fetch: partialFetch });

  assert.deepEqual(await client.fetchChannelUploads("fixture-handle"), {});
  assert.deepEqual(await client.fetchPlaylistVideoPage("uploads-id"), { videoIds: [] });
  assert.deepEqual(await client.fetchVideos(["abcdefghijk"]), [{
    snippet: { title: "Partial video" },
  }]);

  const malformedFetch = (async () => jsonResponse({ items: { not: "an array" } })) as typeof fetch;
  const malformedClient = createYoutubeDataApiClient({
    apiKey: "fixture-key",
    fetch: malformedFetch,
  });
  await assert.rejects(
    malformedClient.fetchPlaylistVideoPage("uploads-id"),
    /malformed data at response\.items/u,
  );

  const invalidJsonFetch = (async () => new Response("not json")) as typeof fetch;
  const invalidJsonClient = createYoutubeDataApiClient({
    apiKey: "fixture-key",
    fetch: invalidJsonFetch,
  });
  await assert.rejects(
    invalidJsonClient.fetchVideos(["abcdefghijk"]),
    /malformed data at response/u,
  );
});

test("transient failures retry with bounded exponential spacing", async () => {
  let attempts = 0;
  const sleeps: number[] = [];
  const transientFetch = (async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("Transient transport failure.");
    if (attempts === 2) {
      return jsonResponse({ error: { message: "Temporary service failure." } }, 503);
    }
    return jsonResponse(videosFixture);
  }) as typeof fetch;
  const client = createYoutubeDataApiClient({
    apiKey: "fixture-key",
    fetch: transientFetch,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
  });

  assert.deepEqual(await client.fetchVideos(["abcdefghijk"]), videosFixture.items);
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [100, 200]);
});

test("HTTP and network errors do not expose the API key or request URL", async () => {
  const apiKey = "top-secret-api-key";
  let httpAttempts = 0;
  const httpSleeps: number[] = [];
  const httpFetch = (async () => {
    httpAttempts += 1;
    return jsonResponse({
      error: { message: `Quota exceeded for ${apiKey}.\nRetry later.` },
    }, 403);
  }) as typeof fetch;
  const httpClient = createYoutubeDataApiClient({
    apiKey,
    fetch: httpFetch,
    sleep: async (milliseconds) => {
      httpSleeps.push(milliseconds);
    },
  });
  await assert.rejects(
    httpClient.fetchVideos(["abcdefghijk"]),
    (error: unknown) => {
      assert.ok(error instanceof YoutubeDataApiError);
      assert.equal(error.endpoint, "videos");
      assert.equal(error.status, 403);
      assert.match(error.message, /HTTP 403: Quota exceeded for \[redacted\]\. Retry later\./u);
      assert.doesNotMatch(error.message, new RegExp(apiKey, "u"));
      assert.doesNotMatch(error.message, /googleapis\.com/u);
      return true;
    },
  );
  assert.equal(httpAttempts, 1);
  assert.deepEqual(httpSleeps, []);

  let networkAttempts = 0;
  const networkSleeps: number[] = [];
  const networkFetch = (async () => {
    networkAttempts += 1;
    throw new Error(`Failed URL contained ${apiKey}`);
  }) as typeof fetch;
  const networkClient = createYoutubeDataApiClient({
    apiKey,
    fetch: networkFetch,
    sleep: async (milliseconds) => {
      networkSleeps.push(milliseconds);
    },
  });
  await assert.rejects(
    networkClient.fetchChannelUploads("fixture-handle"),
    (error: unknown) => {
      assert.ok(error instanceof YoutubeDataApiError);
      assert.match(error.message, /failed before receiving a response/u);
      assert.doesNotMatch(error.message, new RegExp(apiKey, "u"));
      return true;
    },
  );
  assert.equal(networkAttempts, 4);
  assert.deepEqual(networkSleeps, [100, 200, 400]);
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
