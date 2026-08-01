#!/usr/bin/env node
import { validateHugoSearchAliases } from "../site/search-alias-validation.js";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await validateHugoSearchAliases(options);
}

function parseArgs(args: string[]): {
  repoRoot?: string;
  maxRowsPerAliasGroup?: number;
} {
  const result: { repoRoot?: string; maxRowsPerAliasGroup?: number } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--repo-root":
        result.repoRoot = value(args, ++index, arg);
        break;
      case "--max-rows-per-alias-group":
        result.maxRowsPerAliasGroup = integer(value(args, ++index, arg), arg);
        break;
      case "--help":
      case "-h":
        console.log(`Usage: npm run check:search-aliases -- [options]

  --repo-root <path>
  --max-rows-per-alias-group <count>  Defaults to 1100
`);
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
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
  if (!Number.isInteger(result) || result < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return result;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
