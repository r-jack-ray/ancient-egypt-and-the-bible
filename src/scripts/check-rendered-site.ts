#!/usr/bin/env node
import {
  printRenderedValidationSummary,
  validateRenderedSite,
} from "../site/rendered-validation.js";

interface CliOptions {
  publicDir: string;
  expectedBaseUrl: string;
  expectedNoIndexPaths?: string[];
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const summary = await validateRenderedSite(options);
  printRenderedValidationSummary(summary);
}

function parseArgs(args: readonly string[]): CliOptions {
  let publicDir: string | undefined;
  let expectedBaseUrl: string | undefined;
  const expectedNoIndexPaths: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--public-dir") {
      publicDir = requiredValue(args[index + 1], argument);
      index += 1;
    } else if (argument === "--expected-base-url") {
      expectedBaseUrl = requiredValue(args[index + 1], argument);
      index += 1;
    } else if (argument === "--expected-no-index-path") {
      expectedNoIndexPaths.push(requiredValue(args[index + 1], argument));
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      console.log(`Usage: tsx src/scripts/check-rendered-site.ts --public-dir DIR --expected-base-url URL [options]

  --expected-no-index-path PATH  Expected noindex HTML path; repeat for multiple paths
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument ?? ""}`);
    }
  }

  if (publicDir === undefined) throw new Error("Missing required --public-dir.");
  if (expectedBaseUrl === undefined) throw new Error("Missing required --expected-base-url.");
  return {
    publicDir,
    expectedBaseUrl,
    ...(expectedNoIndexPaths.length > 0 ? { expectedNoIndexPaths } : {}),
  };
}

function requiredValue(value: string | undefined, argument: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing value for ${argument}.`);
  }
  return value;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
