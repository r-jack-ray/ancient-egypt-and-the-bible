#!/usr/bin/env node
import { recoverInventoryTransaction, validateRepositoryStore } from "../archive.js";
import { recoverTranscriptTransaction } from "../youtube/transcripts.js";
import { recoverStaleWriterLease } from "../pipeline/lease.js";

async function main(): Promise<void> {
  const repair = process.argv.slice(2).includes("--repair-transaction");
  if (repair) {
    await recoverStaleWriterLease();
    const inventoryResult = await recoverInventoryTransaction();
    if (inventoryResult !== "none") {
      console.log(`Inventory transaction recovery: ${inventoryResult}.`);
    }
    const transcriptResult = await recoverTranscriptTransaction();
    if (transcriptResult !== "none") {
      console.log(`Transcript transaction recovery: ${transcriptResult}.`);
    }
  }

  const result = await validateRepositoryStore();
  console.log(
    `Transcript store valid: episodes=${result.episodeCount} stored=${result.storedCount} unavailable=${result.unavailableCount}.`,
  );
}

main().catch(fail);

function fail(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
