import assert from "node:assert/strict";
import { test } from "node:test";

import { YoutubeRequestError } from "./rate-limit.js";
import { classifyFetchError, cleanCaptionText, extractJson3Segments, fetchVideoTranscript, orderTranscriptRecords, transcriptToText, type VideoTranscript, } from "./transcripts.js";

test("direct transcript renderer preserves the repository TXT contract", () => {
  const transcript: VideoTranscript = {
    videoId: "abcdefghijk",
    source: "watch-page-captions",
    fetchedAt: "2026-07-25T00:00:00Z",
    selectedLanguage: "en",
    availableLanguages: ["en"],
    captionKind: "manual",
    segments: [
      {startSeconds: 1.9, durationSeconds: 2, text: " first\tsegment "},
      {startSeconds: 3_723.8, durationSeconds: 1, text: "second\nsegment"},
    ],
  };
  assert.equal(
      transcriptToText(transcript),
      "[0] 0:01\tfirst segment\n[1] 1:02:03\tsecond segment\n",
  );
});

test("json3 captions are parsed in memory without a JSON payload writer", () => {
  assert.deepEqual(
      extractJson3Segments({
        events: [
          {tStartMs: 1_500, dDurationMs: 2_000, segs: [{utf8: "Hello "}, {utf8: "world"}]},
        ],
      }),
      [{startSeconds: 1.5, durationSeconds: 2, text: "Hello world"}],
  );
});

test("caption cleanup removes markup, tabs, and line breaks", () => {
  assert.equal(cleanCaptionText("<b>A&amp;B</b>\r\nnext\tword"), "A&B next word");
});

test("blocklisted composites reject direct transcript fetching before any network request", async () => {
  let requests = 0;
  await assert.rejects(
      fetchVideoTranscript({
        videoId: "hJ_9yHtzflc",
        requestDelayMs: 0,
        fetch: (async () => {
          requests += 1;
          return new Response("Unexpected request");
        }) as typeof fetch,
      }),
      /hJ_9yHtzflc is blocklisted/u,
  );
  assert.equal(requests, 0);
});

test("primary CAPTCHA evidence trips the circuit breaker without a fallback request", async () => {
  let requests = 0;
  await assert.rejects(
      fetchVideoTranscript({
        videoId: "abcdefghijk",
        requestDelayMs: 0,
        fetch: (async () => {
          requests += 1;
          return new Response('<div class="g-recaptcha">blocked</div>');
        }) as typeof fetch,
      }),
      (error: unknown) =>
          error instanceof YoutubeRequestError &&
          error.classification === "rate_limited_or_blocked",
  );
  assert.equal(requests, 1);
});

test("the primary provider selects English by default and respects an explicit language", async (context) => {
  for (const {language, english, selected} of [
    {english: "en", selected: "en"},
    {english: "en-GB", selected: "en-GB"},
    {language: "ar", english: "en", selected: "ar"},
  ]) {
    await context.test(selected, async () => {
      const selectedTrack = captionTrack(selected);
      const player = playerWithTracks(captionTrack("ar"), captionTrack(english));
      const transcript = await fetchVideoTranscript({
        videoId: "abcdefghijk",
        requestDelayMs: 0,
        ...(language !== undefined ? {language} : {}),
        fetch: async (input, init) => {
          const url = new URL(String(input));
          if (url.pathname === "/watch") {
            return new Response('"INNERTUBE_API_KEY":"example"');
          }
          if (url.pathname === "/youtubei/v1/player") {
            return Response.json(player);
          }
          assert.equal(url.href, selectedTrack.baseUrl);
          assert.equal(new Headers(init?.headers).get("accept-language"), selected);
          return new Response('<text start="0" dur="1">Selected track</text>');
        },
      });
      assert.equal(transcript.source, "youtube-transcript-plus");
      assert.equal(transcript.selectedLanguage, selected);
      assert.equal(transcript.segments[0]?.text, "Selected track");
    });
  }
});

test("the watch-page fallback tries manual English before automatic English", async () => {
  const manual = captionTrack("en-GB");
  const automatic = captionTrack("en", "asr");
  const player = playerWithTracks(captionTrack("ar"), automatic, manual);
  const requests: string[] = [];
  const transcript = await fetchVideoTranscript({
    videoId: "abcdefghijk",
    requestDelayMs: 0,
    fetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/watch") {
        return new Response(`var ytInitialPlayerResponse = ${JSON.stringify(player)};`);
      }
      requests.push(url.href);
      if (url.href === `${manual.baseUrl}?fmt=json3`) {
        return new Response("");
      }
      assert.equal(url.href, `${automatic.baseUrl}?fmt=json3`);
      return Response.json({events: [{tStartMs: 0, segs: [{utf8: "Automatic English"}]}]});
    },
  });

  assert.deepEqual(requests, [manual, automatic].map((track) => `${track.baseUrl}?fmt=json3`));
  assert.equal(transcript.source, "watch-page-captions");
  assert.equal(transcript.selectedLanguage, "en");
  assert.equal(transcript.captionKind, "automatic");
  assert.deepEqual(transcript.availableLanguages, ["ar", "en", "en-GB"]);
});

test("the primary provider's available languages survive a watch page with no tracks", async () => {
  await assert.rejects(
      fetchVideoTranscript({
        videoId: "abcdefghijk",
        requestDelayMs: 0,
        fetch: async (input) => {
          const url = new URL(String(input));
          if (url.pathname === "/watch") {
            return new Response('"INNERTUBE_API_KEY":"example"');
          }
          assert.equal(url.pathname, "/youtubei/v1/player");
          return Response.json(playerWithTracks(captionTrack("ar")));
        },
      }),
      (error: unknown) =>
          classifyFetchError(error) === "language_unavailable" &&
          error instanceof Error &&
          /English captions.*No caption tracks found.*Available languages: ar\./u.test(error.message),
  );
});

function captionTrack(languageCode: string, kind?: "asr") {
  return {
    baseUrl: `https://www.youtube.com/api/timedtext/${languageCode}${kind === undefined ? "" : `-${kind}`}`,
    languageCode,
    ...(kind === undefined ? {} : {kind}),
  };
}

function playerWithTracks(...captionTracks: ReturnType<typeof captionTrack>[]) {
  return {captions: {playerCaptionsTracklistRenderer: {captionTracks}}};
}

test("manifest records retain canonical episode order after replacement", () => {
  const record = (videoId: string) => ({
    videoId,
    fileStem: videoId,
    path: `txt/${videoId}.txt`,
    source: "youtube-transcript-plus" as const,
    contentSha256: "0".repeat(64),
    canonicalByteLength: 1,
    segmentCount: 1,
    firstStartSeconds: 0,
    lastStartSeconds: 0,
  });
  const episode = (videoId: string, order: number) => ({
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    linkText: videoId,
    displayTitle: videoId,
    slug: videoId,
    fileStem: videoId,
    order,
    transcriptPolicy: "expected" as const,
  });

  assert.deepEqual(
      orderTranscriptRecords(
          [record("episode-b"), record("episode-a"), record("unregistered")],
          [episode("episode-a", 1), episode("episode-b", 2)],
      ).map((item) => item.videoId),
      ["episode-a", "episode-b", "unregistered"],
  );
});
