#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import {
  canonicalText,
  readEpisodesStore,
  renderStreamIndex,
  streamIndexPath,
} from "../archive.js";
import { recoverStaleWriterLease } from "../pipeline/lease.js";
import { fileExists } from "../pipeline/files.js";
import { inventoryJournalPath, recoverInventoryTransaction } from "../youtube/inventory.js";

async function main(): Promise<void> {
  const repair = process.argv.slice(2).includes("--repair-transaction");
  if (repair) {
    await recoverStaleWriterLease();
    const result = await recoverInventoryTransaction();
    if (result !== "none") console.log(`Inventory transaction recovery: ${result}.`);
  } else if (await fileExists(inventoryJournalPath)) {
    throw new Error(
      "Unfinished inventory transaction found. Run check:stream-index with --repair-transaction.",
    );
  }
  const store = await readEpisodesStore();
  const actual = canonicalText(await readFile(streamIndexPath, "utf8"));
  const expected = renderStreamIndex(store.episodes);
  if (actual !== expected) {
    throw new Error(`${streamIndexPath} differs from the deterministic episodes.json projection.`);
  }
  console.log(`Stream index valid: ${store.episodes.length} episodes.`);
}

main().catch(fail);

function fail(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
