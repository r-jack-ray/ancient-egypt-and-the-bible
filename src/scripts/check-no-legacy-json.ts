#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const legacyTranscriptPaths = [
  "src/transcripts/json",
  "transcripts/livestreams/json",
] as const;

export function findTrackedLegacyJson(
  repoRoot = resolve(__dirname, "../.."),
): string[] {
  const result = spawnSync("git", ["ls-files", "--", ...legacyTranscriptPaths], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });

  if (result.error !== undefined) {
    throw new Error(`Could not run git ls-files: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(
      `git ls-files failed${result.signal ? ` with signal ${result.signal}` : ` with status ${result.status}`}`
      + (detail ? `: ${detail}` : "."),
    );
  }

  return result.stdout
    .split(/\r?\n/u)
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
}

export function main(): number {
  const trackedPaths = findTrackedLegacyJson();
  if (trackedPaths.length > 0) {
    console.error("Tracked legacy transcript JSON is not allowed:");
    for (const path of trackedPaths) console.error(`  ${path}`);
    return 1;
  }

  console.log("No tracked legacy transcript JSON found.");
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
