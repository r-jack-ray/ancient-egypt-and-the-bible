#!/usr/bin/env node
import { validateRepositoryStore } from "../archive.js";
import { recoverTranscriptTransaction } from "../youtube/transcripts.js";
import { recoverStaleWriterLease } from "../pipeline/lease.js";

const repair = process.argv.slice(2).includes("--repair-transaction");

(repair ? recoverStaleWriterLease().then(() => recoverTranscriptTransaction()) : Promise.resolve("none" as const))
  .then((result) => {
    if (result !== "none") console.log(`Transcript transaction recovery: ${result}.`);
    return validateRepositoryStore();
  })
  .then((result) => {
    console.log(
      `Transcript store valid: episodes=${result.episodeCount} stored=${result.storedCount} unavailable=${result.unavailableCount}.`,
    );
  })
  .catch(fail);

function fail(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
