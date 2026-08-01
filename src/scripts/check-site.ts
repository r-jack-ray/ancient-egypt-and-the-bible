#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

import { buildHugoSiteContent } from "../site/build-content.js";
import {
  printRenderedValidationSummary,
  validateRenderedSite,
} from "../site/rendered-validation.js";
import { validateHugoSearchAliases } from "../site/search-alias-validation.js";
import {
  printStaticSiteValidationSummary,
  validateStaticSite,
} from "../site/static-validation.js";

interface Options {
  repoRoot: string;
  skipHugo: boolean;
  expectedBaseUrl?: string;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await buildHugoSiteContent({ repoRoot: options.repoRoot });
  console.log("Validating Hugo search aliases...");
  await validateHugoSearchAliases({ repoRoot: options.repoRoot });
  const staticSummary = await validateStaticSite({ repoRoot: options.repoRoot });

  if (!options.skipHugo) {
    const expectedBaseUrl = normalizeBaseUrl(
      options.expectedBaseUrl ?? (await readConfiguredBaseUrl(options.repoRoot)),
    );
    await runHugo(options.repoRoot, expectedBaseUrl);
    const renderedSummary = await validateRenderedSite({
      publicDir: resolve(options.repoRoot, "site/public"),
      expectedBaseUrl,
    });
    printRenderedValidationSummary(renderedSummary);
  }

  printStaticSiteValidationSummary(staticSummary);
}

function parseArgs(args: string[]): Options {
  let repoRoot = resolve(".");
  let skipHugo = false;
  let expectedBaseUrl: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--repo-root") repoRoot = resolve(required(args[++index], argument));
    else if (argument === "--skip-hugo") skipHugo = true;
    else if (argument === "--expected-base-url") {
      expectedBaseUrl = required(args[++index], argument);
    } else if (argument === "--help" || argument === "-h") {
      console.log(`Usage: npm run check:site -- [options]

  --repo-root <path>         Repository root (default: current directory)
  --skip-hugo               Validate generated content without rendering Hugo
  --expected-base-url <url> Override site/hugo.yaml baseURL for the render
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument ?? ""}`);
    }
  }

  return {
    repoRoot,
    skipHugo,
    ...(expectedBaseUrl !== undefined ? { expectedBaseUrl } : {}),
  };
}

async function readConfiguredBaseUrl(repoRoot: string): Promise<string> {
  const configPath = resolve(repoRoot, "site/hugo.yaml");
  const config = await readFile(configPath, "utf8");
  const match = /^baseURL:\s*["']?(?<url>[^"'\r\n]+)["']?\s*$/m.exec(config);
  const value = match?.groups?.url?.trim();
  if (!value) {
    throw new Error(`Could not determine baseURL from ${configPath}. Pass --expected-base-url explicitly.`);
  }
  return value;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Expected an HTTP(S) base URL, received: ${value}`);
  }
  return `${url.href.replace(/\/+$/, "")}/`;
}

async function runHugo(repoRoot: string, expectedBaseUrl: string): Promise<void> {
  const siteRoot = resolve(repoRoot, "site");
  await new Promise<void>((resolveProcess, rejectProcess) => {
    const child = spawn("hugo", ["--source", siteRoot, "--baseURL", expectedBaseUrl], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        rejectProcess(
          new Error(
            "Hugo is not installed or not on PATH. Install Hugo, then run npm run check:site.",
          ),
        );
      } else {
        rejectProcess(error);
      }
    });
    child.on("exit", (code, signal) => {
      if (signal) rejectProcess(new Error(`Hugo was terminated by signal ${signal}.`));
      else if (code !== 0) rejectProcess(new Error(`Hugo build failed with exit code ${code}.`));
      else resolveProcess();
    });
  });
}

function required(value: string | undefined, option: string): string {
  if (!value) throw new Error(`Missing value for ${option}.`);
  return value;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
