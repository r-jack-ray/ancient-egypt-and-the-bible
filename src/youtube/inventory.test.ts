import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { type EpisodeRecord, inventoryJournalPath, readEpisodesStore } from "../archive.js";
import {
  applyInventoryCandidate,
  buildAcceptedInventoryEpisodes,
  defaultInventoryAdditions,
  episodeFromVideoMetadata,
  fetchInventoryCandidate,
  type InventoryCandidate,
  latestNumberedAddition,
  writeInventoryReport,
} from "./inventory.js";
import { resolveVideoReadiness, type VideoMetadataRecord } from "./metadata.js";

const baseline: EpisodeRecord = {
  videoId: "abcdefghijk",
  url: "https://www.youtube.com/watch?v=abcdefghijk",
  linkText: "Live Stream #271: Existing",
  displayTitle: "Existing",
  episodeNumber: 271,
  slug: "271-existing",
  fileStem: "271-existing",
  order: 1,
  transcriptPolicy: "expected",
};

async function writeDiscoveryFixture(repoRoot: string): Promise<void> {
  await mkdir(join(repoRoot, "src/channel"), {recursive: true});
  await writeFile(
      join(repoRoot, "src/channel/episodes.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        channel: {
          handleUrl: "https://www.youtube.com/@ancientegyptandthebible",
          channelId: "fixture-channel",
          uploadsPlaylistId: "fixture-uploads",
        },
        episodes: [baseline],
      }, null, 2)}\n`,
      "utf8",
  );
}

test("inventory discovery uses injected fetch for channel lookup and paginated uploads", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "inventory-discovery-"));
  t.after(() => rm(repoRoot, {recursive: true, force: true}));
  await writeDiscoveryFixture(repoRoot);
  const current = await readEpisodesStore(join(repoRoot, "src/channel/episodes.json"));
  const channelId = current.channel.channelId;
  const uploadsPlaylistId = current.channel.uploadsPlaylistId;
  const existing = current.episodes[0];
  assert.ok(channelId);
  assert.ok(uploadsPlaylistId);
  assert.ok(existing);
  const newStreamId = "NEWSTREAM01";
  const ordinaryId = "ORDINARY001";
  const requests: URL[] = [];
  const sleeps: number[] = [];
  const logs: string[] = [];
  const mockFetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname.endsWith("/channels")) {
      return jsonResponse({
        items: [{
          id: channelId,
          contentDetails: {relatedPlaylists: {uploads: uploadsPlaylistId}},
        }],
      });
    }
    if (url.pathname.endsWith("/playlistItems")) {
      if (url.searchParams.get("pageToken") === null) {
        return jsonResponse({
          items: [
            {contentDetails: {videoId: newStreamId}},
            {contentDetails: {videoId: ordinaryId}},
          ],
          nextPageToken: "page-2",
        });
      }
      assert.equal(url.searchParams.get("pageToken"), "page-2");
      return jsonResponse({
        items: [
          {contentDetails: {videoId: existing.videoId}},
          {contentDetails: {videoId: newStreamId}},
        ],
      });
    }
    if (url.pathname.endsWith("/videos")) {
      const ids = url.searchParams.get("id")?.split(",") ?? [];
      return jsonResponse({
        items: ids.map((videoId) => {
          if (videoId === newStreamId) {
            return {
              id: videoId,
              snippet: {title: "Live Stream #999: Fixture discovery"},
              contentDetails: {duration: "PT1H"},
              status: {privacyStatus: "public", uploadStatus: "processed"},
              liveStreamingDetails: {
                actualStartTime: "2026-08-01T00:00:00Z",
                actualEndTime: "2026-08-01T01:00:00Z",
              },
            };
          }
          if (videoId === ordinaryId) {
            return {
              id: videoId,
              snippet: {title: "Ordinary upload", liveBroadcastContent: "none"},
              contentDetails: {duration: "PT10M"},
              status: {privacyStatus: "public", uploadStatus: "processed"},
            };
          }
          return {
            id: videoId,
            snippet: {title: existing.linkText},
            contentDetails: {duration: "PT1H"},
            status: {privacyStatus: "public", uploadStatus: "processed"},
            liveStreamingDetails: {
              actualStartTime: "2026-07-31T00:00:00Z",
              actualEndTime: "2026-07-31T01:00:00Z",
            },
          };
        }),
      });
    }
    return jsonResponse({error: {message: "Unexpected endpoint."}}, 404);
  }) as typeof fetch;

  const candidate = await fetchInventoryCandidate({
    repoRoot,
    apiKey: "fixture-key",
    delayMs: 250,
    fetch: mockFetch,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
    now: () => new Date("2026-08-01T12:34:56Z"),
    logger: (message) => logs.push(message),
  });

  assert.deepEqual(requests.map((url) => url.pathname.split("/").at(-1)), [
    "channels",
    "playlistItems",
    "playlistItems",
    "videos",
  ]);
  assert.equal(requests[0]?.searchParams.get("forHandle"), "ancientegyptandthebible");
  assert.equal(requests[3]?.searchParams.get("id"), `${newStreamId},${ordinaryId},${existing.videoId}`);
  assert.deepEqual(sleeps, [250]);
  assert.deepEqual(candidate.additions.map((record) => record.videoId), [newStreamId]);
  assert.deepEqual(candidate.excludedOrdinaryUploadIds, [ordinaryId]);
  assert.equal(candidate.complete, true);
  assert.equal(candidate.source.channelId, channelId);
  assert.equal(candidate.source.uploadsPlaylistId, uploadsPlaylistId);
  assert.equal(candidate.metadata[0]?.fetchedAt, "2026-08-01T12:34:56.000Z");
  assert.ok(logs.includes("Fetched uploads page 2; videos=3."));
});

test("inventory discovery reports a channel response with missing uploads fields", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "inventory-discovery-"));
  t.after(() => rm(repoRoot, {recursive: true, force: true}));
  await writeDiscoveryFixture(repoRoot);
  const current = await readEpisodesStore(join(repoRoot, "src/channel/episodes.json"));
  const mockFetch = (async () => jsonResponse({
    items: [{id: current.channel.channelId, contentDetails: {relatedPlaylists: {}}}],
  })) as typeof fetch;
  await assert.rejects(
      fetchInventoryCandidate({
        repoRoot,
        apiKey: "fixture-key",
        delayMs: 0,
        fetch: mockFetch,
      }),
      /did not resolve to an uploads playlist/u,
  );
});

test("inventory discovery fixtures cover no additions and multiple additions", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "inventory-discovery-"));
  try {
    await writeDiscoveryFixture(repoRoot);

    const noAdditionRequests: URL[] = [];
    const noAdditions = await fetchInventoryCandidate({
      apiKey: "fixture-key",
      delayMs: 0,
      repoRoot,
      fetch: inventoryFixtureFetch(
          [baseline.videoId],
          new Map([[baseline.videoId, baseline.linkText]]),
          noAdditionRequests,
      ),
      now: () => new Date("2026-08-01T12:34:56Z"),
    });
    assert.deepEqual(noAdditions.additions, []);
    assert.deepEqual(noAdditions.omittedBaselineVideoIds, []);
    assert.deepEqual(noAdditions.titleChanges, []);
    assert.equal(
        noAdditionRequests.filter((url) => url.pathname.endsWith("/videos")).length,
        1,
    );

    const firstAddition = "NEWSTREAM01";
    const secondAddition = "NEWSTREAM02";
    const multipleRequests: URL[] = [];
    const multipleAdditions = await fetchInventoryCandidate({
      apiKey: "fixture-key",
      delayMs: 0,
      repoRoot,
      fetch: inventoryFixtureFetch(
          [firstAddition, secondAddition, baseline.videoId],
          new Map([
            [firstAddition, "Live Stream #272: First fixture addition"],
            [secondAddition, "Live Stream #273: Second fixture addition"],
            [baseline.videoId, baseline.linkText],
          ]),
          multipleRequests,
      ),
      now: () => new Date("2026-08-01T12:34:56Z"),
    });
    assert.deepEqual(
        multipleAdditions.additions.map((record) => record.videoId),
        [firstAddition, secondAddition],
    );
    assert.deepEqual(
        multipleAdditions.additions.map((record) => record.episodeNumber),
        [272, 273],
    );
    assert.equal(
        multipleRequests.filter((url) => url.pathname.endsWith("/videos")).length,
        1,
    );
  } finally {
    await rm(repoRoot, {recursive: true, force: true});
  }
});

test("numbered inventory additions use the established archive identity shape", () => {
  const episode = episodeFromVideoMetadata({
    videoId: "8bF8Hm5NpR8",
    fetchedAt: "2026-08-01T16:45:58Z",
    title: "Live Stream #272: The Oppression Pharaoh, We Are Legion",
    uploadStatus: "processed",
  }, 2);
  assert.equal(episode.displayTitle, "The Oppression Pharaoh, We Are Legion");
  assert.equal(episode.episodeNumber, 272);
  assert.equal(episode.fileStem, "272-the-oppression-pharaoh-we-are-legion");
});

test("inventory apply includes only explicitly selected additions", () => {
  const latest = episodeFromVideoMetadata({
    videoId: "8bF8Hm5NpR8",
    fetchedAt: "2026-08-01T16:45:58Z",
    title: "Live Stream #272: Latest",
  }, 2);
  const unrelated = episodeFromVideoMetadata({
    videoId: "ZYXWVUTSRQP",
    fetchedAt: "2026-08-01T16:45:58Z",
    title: "Unrelated broadcast",
  }, 3);
  const episodes = buildAcceptedInventoryEpisodes(
      [baseline],
      [latest, unrelated],
      [latest.videoId],
  );
  assert.deepEqual(episodes.map((record) => record.videoId), [latest.videoId, baseline.videoId]);
  assert.deepEqual(episodes.map((record) => record.order), [1, 2]);
  assert.equal(episodes[1]?.slug, baseline.slug);
});

test("latest selection skips non-numbered broadcasts", () => {
  const unrelated = episodeFromVideoMetadata({
    videoId: "ZYXWVUTSRQP",
    fetchedAt: "2026-08-01T16:45:58Z",
    title: "Unrelated broadcast",
  }, 2);
  const latest = episodeFromVideoMetadata({
    videoId: "8bF8Hm5NpR8",
    fetchedAt: "2026-08-01T16:45:58Z",
    title: "Live Stream #272: Latest",
  }, 3);
  assert.equal(latestNumberedAddition([unrelated, latest])?.videoId, latest.videoId);
});

test("default selection includes numbered and special livestreams", () => {
  const latest = episodeFromVideoMetadata({
    videoId: "8bF8Hm5NpR8",
    fetchedAt: "2026-08-01T16:45:58Z",
    title: "Live Stream #272: Latest",
  }, 2);
  const special = episodeFromVideoMetadata({
    videoId: "bxrBgOpzJPg",
    fetchedAt: "2026-08-01T16:45:58Z",
    title: "Special Live Stream: \"Lord of Steel and Sky\" Q&A",
  }, 3);
  const unrelated = episodeFromVideoMetadata({
    videoId: "ZYXWVUTSRQP",
    fetchedAt: "2026-08-01T16:45:58Z",
    title: "An Egyptologist reacts to another video",
  }, 4);
  assert.deepEqual(
      defaultInventoryAdditions([latest, special, unrelated]).map((record) => record.videoId),
      [latest.videoId, special.videoId],
  );
});

test("inventory review reports contain the human delta without internal metadata", async () => {
  const reportRoot = await mkdtemp(join(tmpdir(), "inventory-report-"));
  try {
    const additionMetadata = {
      videoId: "8bF8Hm5NpR8",
      fetchedAt: "2026-08-01T16:45:58Z",
      title: "Live Stream #272: Latest",
    };
    const addition = episodeFromVideoMetadata(additionMetadata, 2);
    const candidate: InventoryCandidate = {
      schemaVersion: 1,
      complete: true,
      source: {
        handleUrl: "https://www.youtube.com/@ancientegyptandthebible",
        channelId: "channel-id",
        uploadsPlaylistId: "uploads-id",
      },
      additions: [addition],
      omittedBaselineVideoIds: [baseline.videoId],
      titleChanges: [{
        videoId: baseline.videoId,
        established: baseline.linkText,
        latestApiTitle: "Live Stream #271: Renamed",
      }],
      excludedOrdinaryUploadIds: ["ORDINARY001"],
      metadata: [additionMetadata],
    };
    const reportPath = join(reportRoot, "stream-inventory-candidate.json");

    await writeInventoryReport(
        reportPath,
        candidate,
        new Date("2026-08-02T12:34:56Z"),
    );

    const text = await readFile(reportPath, "utf8");
    const report = JSON.parse(text) as {
      generatedAt: string;
      additions: { count: number; videos: { videoId: string; title: string }[] };
      omissions: { count: number; baselineVideoIds: string[] };
      titleChanges: { count: number };
      excludedUploads: { count: number; videoIds: string[] };
      metadata?: unknown;
    };
    assert.equal(report.generatedAt, "2026-08-02T12:34:56.000Z");
    assert.equal(report.additions.count, 1);
    assert.deepEqual(report.additions.videos, [{
      videoId: addition.videoId,
      url: addition.url,
      title: addition.linkText,
      fileStem: addition.fileStem,
      episodeNumber: addition.episodeNumber,
    }]);
    assert.deepEqual(report.omissions, {
      count: 1,
      baselineVideoIds: [baseline.videoId],
    });
    assert.equal(report.titleChanges.count, 1);
    assert.deepEqual(report.excludedUploads, {
      count: 1,
      videoIds: ["ORDINARY001"],
    });
    assert.equal(report.metadata, undefined);
    assert.doesNotMatch(text, /fetchedAt/u);
  } finally {
    await rm(reportRoot, {recursive: true, force: true});
  }
});

test("inventory apply rejects empty and unknown selections", () => {
  const latest = episodeFromVideoMetadata({
    videoId: "8bF8Hm5NpR8",
    fetchedAt: "2026-08-01T16:45:58Z",
    title: "Live Stream #272: Latest",
  }, 2);
  assert.throws(
      () => buildAcceptedInventoryEpisodes([baseline], [latest], []),
      /requires at least one/u,
  );
  assert.throws(
      () => buildAcceptedInventoryEpisodes([baseline], [latest], ["ZYXWVUTSRQP"]),
      /not proposed additions/u,
  );
  assert.deepEqual(
      buildAcceptedInventoryEpisodes(
          [baseline],
          [latest],
          [],
          {allowEmptySelection: true},
      ),
      [baseline],
  );
});

test("inventory apply atomically updates only canonical episodes and metadata", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "inventory-apply-"));
  try {
    await mkdir(join(repoRoot, "src/channel"), {recursive: true});
    const currentStore = {
      schemaVersion: 1,
      channel: {
        handleUrl: "https://www.youtube.com/@ancientegyptandthebible",
        channelId: "channel-id",
        uploadsPlaylistId: "uploads-id",
      },
      episodes: [baseline],
    } as const;
    await writeFile(
        join(repoRoot, "src/channel/episodes.json"),
        `${JSON.stringify(currentStore, null, 2)}\n`,
        "utf8",
    );
    await writeFile(
        join(repoRoot, "src/channel/video-metadata.json"),
        `${JSON.stringify({schemaVersion: 1, source: {api: "youtube-data-api-v3"}, videos: []}, null, 2)}\n`,
        "utf8",
    );

    const additionMetadata = {
      videoId: "8bF8Hm5NpR8",
      fetchedAt: "2026-08-01T16:45:58Z",
      title: "Live Stream #272: Latest",
    };
    const baselineMetadata = {
      videoId: baseline.videoId,
      fetchedAt: "2026-08-01T16:45:58Z",
      title: baseline.linkText,
    };
    const addition = episodeFromVideoMetadata(additionMetadata, 2);
    const candidate: InventoryCandidate = {
      schemaVersion: 1,
      complete: true,
      source: {
        handleUrl: currentStore.channel.handleUrl,
        channelId: currentStore.channel.channelId,
        uploadsPlaylistId: currentStore.channel.uploadsPlaylistId,
      },
      additions: [addition],
      omittedBaselineVideoIds: [],
      titleChanges: [],
      excludedOrdinaryUploadIds: [],
      metadata: [additionMetadata, baselineMetadata],
    };

    await applyInventoryCandidate(candidate, {
      acceptSource: false,
      acceptedAdditionIds: [addition.videoId],
      repoRoot,
    });

    const episodes = JSON.parse(
        await readFile(join(repoRoot, "src/channel/episodes.json"), "utf8"),
    ) as { episodes: EpisodeRecord[] };
    const metadata = JSON.parse(
        await readFile(join(repoRoot, "src/channel/video-metadata.json"), "utf8"),
    ) as { videos: { videoId: string }[] };
    assert.deepEqual(episodes.episodes.map((episode) => episode.videoId), [addition.videoId, baseline.videoId]);
    assert.deepEqual(episodes.episodes.map((episode) => episode.order), [1, 2]);
    assert.ok(episodes.episodes.every((episode) => !("lifecycle" in episode)));
    assert.deepEqual(metadata.videos.map((record) => record.videoId), [addition.videoId, baseline.videoId]);
    await assert.rejects(readFile(join(repoRoot, inventoryJournalPath), "utf8"), /ENOENT/u);

    const appliedEpisodes = await readFile(join(repoRoot, "src/channel/episodes.json"), "utf8");
    const appliedMetadata = await readFile(join(repoRoot, "src/channel/video-metadata.json"), "utf8");
    await applyInventoryCandidate({...candidate, additions: []}, {
      acceptSource: false,
      acceptedAdditionIds: [],
      repoRoot,
    });
    assert.equal(
        await readFile(join(repoRoot, "src/channel/episodes.json"), "utf8"),
        appliedEpisodes,
    );
    assert.equal(
        await readFile(join(repoRoot, "src/channel/video-metadata.json"), "utf8"),
        appliedMetadata,
    );
  } finally {
    await rm(repoRoot, {recursive: true, force: true});
  }
});

test("inventory apply refreshes stale metadata when there are no episode additions", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "inventory-metadata-refresh-"));
  try {
    await mkdir(join(repoRoot, "src/channel"), {recursive: true});
    const currentStore = {
      schemaVersion: 1,
      channel: {
        handleUrl: "https://www.youtube.com/@ancientegyptandthebible",
        channelId: "channel-id",
        uploadsPlaylistId: "uploads-id",
      },
      episodes: [baseline],
    } as const;
    const staleMetadata: VideoMetadataRecord = {
      videoId: baseline.videoId,
      fetchedAt: "2026-08-13T13:22:44.984Z",
      title: baseline.linkText,
      durationSeconds: 0,
      liveBroadcastContent: "upcoming",
      scheduledStartAt: "2026-08-15T03:00:00Z",
      privacyStatus: "public",
      uploadStatus: "uploaded",
    };
    const readyMetadata: VideoMetadataRecord = {
      ...staleMetadata,
      fetchedAt: "2026-08-15T06:00:00.000Z",
      durationSeconds: 10_800,
      liveBroadcastContent: "none",
      actualStartAt: "2026-08-15T03:05:00Z",
      actualEndAt: "2026-08-15T06:00:00Z",
      uploadStatus: "processed",
    };
    const unselectedMetadata: VideoMetadataRecord = {
      videoId: "ZYXWVUTSRQP",
      fetchedAt: "2026-08-15T06:00:00.000Z",
      title: "An unnumbered side-series livestream",
      durationSeconds: 3_600,
      liveBroadcastContent: "none",
      scheduledStartAt: "2026-08-14T03:00:00Z",
      actualStartAt: "2026-08-14T03:05:00Z",
      actualEndAt: "2026-08-14T04:05:00Z",
      privacyStatus: "public",
      uploadStatus: "processed",
    };
    await writeFile(
        join(repoRoot, "src/channel/episodes.json"),
        `${JSON.stringify(currentStore, null, 2)}\n`,
        "utf8",
    );
    await writeFile(
        join(repoRoot, "src/channel/video-metadata.json"),
        `${JSON.stringify({
          schemaVersion: 1,
          source: {api: "youtube-data-api-v3"},
          videos: [staleMetadata],
        }, null, 2)}\n`,
        "utf8",
    );
    const candidate: InventoryCandidate = {
      schemaVersion: 1,
      complete: true,
      source: {
        handleUrl: currentStore.channel.handleUrl,
        channelId: currentStore.channel.channelId,
        uploadsPlaylistId: currentStore.channel.uploadsPlaylistId,
      },
      additions: [episodeFromVideoMetadata(unselectedMetadata, 2)],
      omittedBaselineVideoIds: [],
      titleChanges: [],
      excludedOrdinaryUploadIds: [],
      metadata: [unselectedMetadata, readyMetadata],
    };

    await applyInventoryCandidate(candidate, {
      acceptSource: false,
      acceptedAdditionIds: [],
      allowEmptySelection: true,
      repoRoot,
    });

    const episodes = JSON.parse(
        await readFile(join(repoRoot, "src/channel/episodes.json"), "utf8"),
    ) as { episodes: EpisodeRecord[] };
    const metadata = JSON.parse(
        await readFile(join(repoRoot, "src/channel/video-metadata.json"), "utf8"),
    ) as { videos: VideoMetadataRecord[] };
    assert.deepEqual(episodes.episodes, [baseline]);
    assert.deepEqual(metadata.videos, [readyMetadata]);
    assert.deepEqual(resolveVideoReadiness(metadata.videos[0]), {state: "ready"});
  } finally {
    await rm(repoRoot, {recursive: true, force: true});
  }
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {"content-type": "application/json"},
  });
}

function inventoryFixtureFetch(
    uploadIds: readonly string[],
    titles: ReadonlyMap<string, string>,
    requests: URL[],
): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname.endsWith("/channels")) {
      return jsonResponse({
        items: [{
          id: "fixture-channel",
          contentDetails: {relatedPlaylists: {uploads: "fixture-uploads"}},
        }],
      });
    }
    if (url.pathname.endsWith("/playlistItems")) {
      return jsonResponse({
        items: uploadIds.map((videoId) => ({contentDetails: {videoId}})),
      });
    }
    if (url.pathname.endsWith("/videos")) {
      const requestedIds = url.searchParams.get("id")?.split(",") ?? [];
      return jsonResponse({
        items: requestedIds.map((videoId) => ({
          id: videoId,
          snippet: {
            title: titles.get(videoId),
            liveBroadcastContent: "none",
          },
          contentDetails: {duration: "PT1H"},
          status: {privacyStatus: "public", uploadStatus: "processed"},
          liveStreamingDetails: {
            actualStartTime: "2026-08-01T00:00:00Z",
            actualEndTime: "2026-08-01T01:00:00Z",
          },
        })),
      });
    }
    return jsonResponse({error: {message: "Unexpected endpoint."}}, 404);
  }) as typeof fetch;
}
