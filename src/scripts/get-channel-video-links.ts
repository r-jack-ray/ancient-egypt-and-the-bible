#!/usr/bin/env node
import { resolveYoutubeApiKey } from "../youtube/api-key.js";
import {
  applyInventoryCandidate,
  fetchInventoryCandidate,
  latestNumberedAddition,
  writeInventoryReport,
} from "../youtube/inventory.js";

const defaultReportPath = "reports/stream-inventory-candidate.json";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) return;
  const apiKey = await resolveYoutubeApiKey({
    ...(args.apiKeyFile !== undefined ? { apiKeyFile: args.apiKeyFile } : {}),
  });
  const candidate = await fetchInventoryCandidate({
    apiKey,
    delayMs: args.delayMs,
    ...(args.maxPages !== undefined ? { maxPages: args.maxPages } : {}),
    logger: (message) => console.error(message),
  });
  const reportPath = args.output ?? (args.reviewOnly ? defaultReportPath : undefined);
  if (reportPath !== undefined) {
    await writeInventoryReport(reportPath, candidate);
  }
  console.error(
    `Inventory candidate: complete=${candidate.complete} additions=${candidate.additions.length} ` +
      `omitted-baseline=${candidate.omittedBaselineVideoIds.length}` +
      (reportPath === undefined ? "" : ` report=${reportPath}`),
  );
  if (!args.reviewOnly) {
    const acceptedAdditionIds = [...args.acceptedAdditionIds];
    if (args.acceptLatest || acceptedAdditionIds.length === 0) {
      const latest = latestNumberedAddition(candidate.additions);
      if (latest === undefined) {
        if (acceptedAdditionIds.length === 0) {
          console.error("No new numbered livestream is available; canonical inventory is unchanged.");
          return;
        }
      } else if (!acceptedAdditionIds.includes(latest.videoId)) {
        acceptedAdditionIds.push(latest.videoId);
        console.error(`Selected latest numbered livestream: ${latest.videoId} (${latest.linkText}).`);
      }
    }
    await applyInventoryCandidate(candidate, {
      acceptSource: true,
      acceptedAdditionIds,
    });
    console.error("Applied selected additions to canonical episode inventory and metadata.");
  } else {
    console.error("Explicit review-only run; canonical inventory is unchanged.");
  }
}

export function parseArgs(args: readonly string[]): {
  apiKeyFile?: string;
  output?: string;
  delayMs: number;
  maxPages?: number;
  reviewOnly: boolean;
  acceptLatest: boolean;
  acceptedAdditionIds: string[];
} | null {
  const result: {
    apiKeyFile?: string;
    output?: string;
    delayMs: number;
    maxPages?: number;
    reviewOnly: boolean;
    acceptLatest: boolean;
    acceptedAdditionIds: string[];
  } = {
    delayMs: 1_000,
    reviewOnly: false,
    acceptLatest: false,
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
      case "--review-only":
        result.reviewOnly = true;
        break;
      case "--accept-latest":
        result.acceptLatest = true;
        break;
      case "--accept-addition":
        result.acceptedAdditionIds.push(value(args, ++index, arg));
        break;
      case "--help":
      case "-h":
        console.log(`Usage: npm run fetch:livestreams -- [options]

By default, discovery registers the newest numbered livestream, pins the
resolved channel source when needed, and updates canonical metadata. Unselected
special broadcasts are not added. Use --review-only for an explicit diagnostic
run that writes reports/stream-inventory-candidate.json without canonical
changes. The API key precedence is --api-key-file, YOUTUBE_API_KEY, then
.local/youtube-api-key.txt. Literal command-line keys are not accepted.

  --api-key-file <path>
  --output <path>               Write the concise inventory delta here
  --request-delay-ms <ms>
  --max-pages <count>           Partial probe; requires --review-only
  --review-only                Do not update canonical files
  --accept-latest              Also accept the newest numbered livestream
  --accept-addition <videoId>  Accept one proposed addition; repeat as needed
`);
        return null;
      default:
        throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }
  if (result.maxPages !== undefined && !result.reviewOnly) {
    throw new Error("--max-pages requires --review-only because a partial inventory cannot be applied.");
  }
  return result;
}

function value(args: readonly string[], index: number, name: string): string {
  const result = args[index];
  if (!result) throw new Error(`Missing value for ${name}.`);
  return result;
}

function integer(input: string, name: string): number {
  const result = Number(input);
  if (!Number.isInteger(result) || result < 0) throw new Error(`${name} must be a non-negative integer.`);
  return result;
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
