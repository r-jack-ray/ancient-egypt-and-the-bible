#!/usr/bin/env node
import { readEpisodesStore, readFetchStatus, readManifest } from "../archive.js";

async function main(): Promise<void> {
  const episodes = await readEpisodesStore();
  const manifest = await readManifest();
  const status = await readFetchStatus();
  const stored = new Set(manifest.transcripts.map((record) => record.videoId));
  const missing = episodes.episodes.filter((record) => !stored.has(record.videoId));
  const knownUnavailable = missing.filter(
    (record) => record.transcriptPolicy === "known-unavailable",
  ).length;
  const pending = missing.filter((record) => record.transcriptPolicy === "expected").length;

  console.log(
    `Transcript status: episodes=${episodes.episodes.length} stored=${stored.size} ` +
    `known-unavailable=${knownUnavailable} pending=${pending} ` +
    `recorded-failures=${status.failures.length}.`,
  );
  if (status.failures.length > 0) {
    console.log("Recorded failures:");
    for (const failure of status.failures) {
      console.log(`  ${failure.videoId}\t${failure.classification}\t${failure.message}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
