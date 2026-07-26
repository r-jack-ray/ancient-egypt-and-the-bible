#!/usr/bin/env node
import { resolveYoutubeApiKey } from "../youtube/api-key.js";
import { fetchAndStoreVideoMetadata } from "../youtube/metadata.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let apiKeyFile: string | undefined;
  let delayMs = 1_000;
  let limit: number | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--api-key-file") apiKeyFile = required(args[++index], arg);
    else if (arg === "--request-delay-ms") delayMs = number(required(args[++index], arg), arg);
    else if (arg === "--limit") limit = number(required(args[++index], arg), arg);
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: npm run fetch:video-metadata -- [--api-key-file path] [--limit n] [--request-delay-ms ms]");
      return;
    } else throw new Error(`Unknown argument: ${arg ?? ""}`);
  }
  const apiKey = await resolveYoutubeApiKey({ ...(apiKeyFile !== undefined ? { apiKeyFile } : {}) });
  const result = await fetchAndStoreVideoMetadata({
    apiKey,
    delayMs,
    ...(limit !== undefined ? { limit } : {}),
    logger: (message) => console.error(message),
  });
  console.error(`Stored normalized metadata for ${result.videos.length} videos.`);
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing value for ${name}.`);
  return value;
}
function number(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer.`);
  return parsed;
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
