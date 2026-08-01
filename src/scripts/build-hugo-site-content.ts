#!/usr/bin/env node
import { buildHugoSiteContent } from "../site/build-content.js";

async function main(): Promise<void> {
  const repoRoot = parseArgs(process.argv.slice(2));
  await buildHugoSiteContent(repoRoot === undefined ? {} : { repoRoot });
}

function parseArgs(args: string[]): string | undefined {
  let repoRoot: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--repo-root":
        repoRoot = value(args, ++index, arg);
        break;
      case "--help":
      case "-h":
        console.log(`Usage: npm run build:site-content -- [options]

  --repo-root <path>  Repository root; defaults to the current project
`);
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }
  return repoRoot;
}

function value(args: readonly string[], index: number, name: string): string {
  const result = args[index];
  if (!result) throw new Error(`Missing value for ${name}.`);
  return result;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
