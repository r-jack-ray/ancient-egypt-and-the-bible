#!/usr/bin/env node
import {
  fetchTranscriptBatch,
  formatTranscriptBatchHandoff,
} from "../youtube/batch.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await fetchTranscriptBatch({
    requestDelayMs: args.delayMs,
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
    ...(args.dryRun ? { dryRun: true } : {}),
    ...(args.language !== undefined ? { language: args.language } : {}),
    logger: (message) => console.error(message),
  });
  console.error(formatTranscriptBatchHandoff(result));
  if (result.blocked) process.exitCode = 2;
  else if (result.failed > 0) process.exitCode = 1;
}

function parseArgs(args: string[]): {
  delayMs: number;
  limit?: number;
  dryRun: boolean;
  language?: string;
} {
  let delayMs = 5_000;
  let limit: number | undefined;
  let dryRun = false;
  let language: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--request-delay-ms") delayMs = integer(required(args[++index], arg), arg);
    else if (arg === "--limit") limit = integer(required(args[++index], arg), arg);
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--language") language = required(args[++index], arg);
    else if (arg === "--force") {
      throw new Error("Batch overwrite is disabled. Valid stored transcripts are always skipped.");
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npm run fetch:transcripts -- [options]

  --limit <count>
  --request-delay-ms <ms>
  --dry-run                 Network-free and canonical-write-free
  --language <code>

Valid stored transcripts are always skipped. Batch-global force is disabled.
Recorded failures remain eligible on ordinary later runs; only known-unavailable records are excluded.
The npm command spaces every outbound transcript request by 60 seconds.
The final handoff lists each new TXT path and every deferred, failed, or pending record.
`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg ?? ""}`);
  }
  return {
    delayMs,
    dryRun,
    ...(limit !== undefined ? { limit } : {}),
    ...(language !== undefined ? { language } : {}),
  };
}
function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing value for ${name}.`);
  return value;
}
function integer(value: string, name: string): number {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0) throw new Error(`${name} must be a non-negative integer.`);
  return result;
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
