#!/usr/bin/env node
import { readEpisodesStore, readFetchStatus, readManifest } from "../archive.js";

async function main(): Promise<void> {
  const episodes = await readEpisodesStore();
  const manifest = await readManifest();
  const status = await readFetchStatus();
  const stored = new Set(manifest.transcripts.map((record) => record.videoId));
  const missing = episodes.episodes.filter((record) => !stored.has(record.videoId));
  console.log(`Stored transcripts: ${stored.size}/${episodes.episodes.length}`);
  console.log(`Known unavailable: ${missing.filter((record) => record.transcriptPolicy === "known-unavailable").length}`);
  console.log(`Pending: ${missing.filter((record) => record.transcriptPolicy === "expected").length}`);
  console.log(`Recorded failures: ${status.failures.length}`);
  for (const failure of status.failures) {
    console.log(`${failure.videoId}\t${failure.classification}\t${failure.message}`);
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
