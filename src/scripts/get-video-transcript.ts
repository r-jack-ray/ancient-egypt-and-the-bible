#!/usr/bin/env node
import { isAbsolute, relative, resolve } from "node:path";

import { atomicWriteText } from "../pipeline/files.js";
import {
  fetchVideoTranscript,
  findStoredTranscript,
  storeTranscript,
  transcriptToText,
} from "../youtube/transcripts.js";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.txtOutput === undefined) {
    const stored = await findStoredTranscript(options.videoId);
    if (stored !== undefined && !options.force) {
      console.error(`Transcript already stored: src/transcripts/${stored.path}`);
      console.error("No YouTube requests made.");
      return;
    }
  }
  const transcript = await fetchVideoTranscript({
    videoId: options.videoId,
    requestDelayMs: options.delayMs,
    ...(options.language !== undefined ? { language: options.language } : {}),
    logger: (message) => console.error(message),
  });
  if (options.txtOutput !== undefined) {
    const output = resolve(options.txtOutput);
    const reportRelative = relative(resolve("reports"), output);
    if (
      !reportRelative ||
      reportRelative === ".." ||
      reportRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
      isAbsolute(reportRelative)
    ) {
      throw new Error("--txt-output is a canary/diagnostic path and must remain under ignored reports/.");
    }
    await atomicWriteText(output, transcriptToText(transcript));
    console.error(`Wrote TXT-only canary: ${options.txtOutput}`);
    return;
  }
  const record = await storeTranscript(transcript, {
    force: options.force,
    ...(options.expectedCurrentHash !== undefined
      ? { expectedCurrentHash: options.expectedCurrentHash }
      : {}),
  });
  console.error(`Stored TXT transcript: src/transcripts/${record.path}`);
}

function parseArgs(args: string[]): {
  videoId: string;
  delayMs: number;
  language?: string;
  txtOutput?: string;
  force: boolean;
  expectedCurrentHash?: string;
} {
  let videoId: string | undefined;
  let delayMs = 5_000;
  let language: string | undefined;
  let txtOutput: string | undefined;
  let force = false;
  let expectedCurrentHash: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--video-id") videoId = required(args[++index], arg);
    else if (arg === "--request-delay-ms") delayMs = integer(required(args[++index], arg), arg);
    else if (arg === "--language") language = required(args[++index], arg);
    else if (arg === "--txt-output") txtOutput = required(args[++index], arg);
    else if (arg === "--force") force = true;
    else if (arg === "--expected-current-hash") expectedCurrentHash = required(args[++index], arg);
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npm run fetch:transcript -- --video-id ID [options]

  --language <code>
  --request-delay-ms <ms>
  --txt-output reports/<file>.txt  TXT-only canary; never updates canonical state
  --force                          Scoped replacement for this video only
  --expected-current-hash <sha256> Required with --force for stored transcripts
`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg ?? ""}`);
  }
  if (!videoId) throw new Error("Missing required --video-id.");
  return {
    videoId,
    delayMs,
    force,
    ...(language !== undefined ? { language } : {}),
    ...(txtOutput !== undefined ? { txtOutput } : {}),
    ...(expectedCurrentHash !== undefined ? { expectedCurrentHash } : {}),
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
