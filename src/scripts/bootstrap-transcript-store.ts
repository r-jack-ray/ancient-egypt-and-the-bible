#!/usr/bin/env node
import { writeBootstrapStore } from "../archive.js";

writeBootstrapStore()
  .then(() => {
    console.log("Bootstrapped episodes, metadata, manifest, and fetch status without rewriting TXT files.");
  })
  .catch(fail);

function fail(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
