#!/usr/bin/env node
import { resolveYoutubeApiKey } from "../youtube/api-key.js";
import {
  applyInventoryCandidate,
  fetchInventoryCandidate,
  writeInventoryReport,
} from "../youtube/inventory.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = await resolveYoutubeApiKey({
    ...(args.apiKeyFile !== undefined ? { apiKeyFile: args.apiKeyFile } : {}),
  });
  const candidate = await fetchInventoryCandidate({
    apiKey,
    delayMs: args.delayMs,
    ...(args.maxPages !== undefined ? { maxPages: args.maxPages } : {}),
    logger: (message) => console.error(message),
  });
  await writeInventoryReport(args.output, candidate);
  console.error(
    `Inventory candidate: complete=${candidate.complete} additions=${candidate.additions.length} ` +
      `omitted-baseline=${candidate.omittedBaselineVideoIds.length} report=${args.output}`,
  );
  if (args.apply) {
    await applyInventoryCandidate(candidate, {
      acceptSource: args.acceptSource,
      acceptedAdditionIds: args.acceptedAdditionIds,
    });
    console.error("Applied accepted complete inventory and regenerated src/live-stream-list.md.");
  }
}

function parseArgs(args: string[]): {
  apiKeyFile?: string;
  output: string;
  delayMs: number;
  maxPages?: number;
  apply: boolean;
  acceptSource: boolean;
  acceptedAdditionIds: string[];
} {
  const result: {
    apiKeyFile?: string;
    output: string;
    delayMs: number;
    maxPages?: number;
    apply: boolean;
    acceptSource: boolean;
    acceptedAdditionIds: string[];
  } = {
    output: "reports/stream-inventory-candidate.json",
    delayMs: 1_000,
    apply: false,
    acceptSource: false,
    acceptedAdditionIds: [],
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--api-key-file":
        result.apiKeyFile = value(args, ++index, arg);
        break;
      case "--output":
        result.output = value(args, ++index, arg);
        break;
      case "--request-delay-ms":
        result.delayMs = integer(value(args, ++index, arg), arg);
        break;
      case "--max-pages":
        result.maxPages = integer(value(args, ++index, arg), arg);
        break;
      case "--apply":
        result.apply = true;
        break;
      case "--accept-source":
        result.acceptSource = true;
        break;
      case "--accept-addition":
        result.acceptedAdditionIds.push(value(args, ++index, arg));
        break;
      case "--help":
      case "-h":
        console.log(`Usage: npm run fetch:video-links -- [options]

Default behavior writes a review-only candidate to reports and does not change
canonical inventory. The API key precedence is --api-key-file, YOUTUBE_API_KEY,
then reports/youtube-api-key.txt. Literal command-line keys are not accepted.

  --api-key-file <path>
  --output <path>
  --request-delay-ms <ms>
  --max-pages <count>          Partial report-only probe
  --apply                      Apply a complete, accepted candidate
  --accept-source              Pin the first resolved channel/playlist
  --accept-addition <videoId>  Repeat for every proposed addition
`);
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }
  return result;
}

function value(args: string[], index: number, name: string): string {
  const result = args[index];
  if (!result) throw new Error(`Missing value for ${name}.`);
  return result;
}

function integer(input: string, name: string): number {
  const result = Number(input);
  if (!Number.isInteger(result) || result < 0) throw new Error(`${name} must be a non-negative integer.`);
  return result;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
