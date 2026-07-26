import { readFile } from "node:fs/promises";

import { errorCode } from "../pipeline/files.js";

export const defaultApiKeyFile = "reports/youtube-api-key.txt";

export interface ApiKeyOptions {
  apiKeyFile?: string;
  environment?: NodeJS.ProcessEnv;
  defaultFile?: string;
}

export async function resolveYoutubeApiKey(options: ApiKeyOptions = {}): Promise<string> {
  if (options.apiKeyFile !== undefined) {
    return readKeyFile(options.apiKeyFile);
  }
  const environmentValue = options.environment === undefined
    ? process.env.YOUTUBE_API_KEY
    : options.environment.YOUTUBE_API_KEY;
  if (environmentValue !== undefined) {
    return normalizeKey(environmentValue, "YOUTUBE_API_KEY");
  }
  const path = options.defaultFile ?? defaultApiKeyFile;
  try {
    return await readKeyFile(path);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new Error(
        `YouTube API key not found. Use --api-key-file, YOUTUBE_API_KEY, or ${defaultApiKeyFile}.`,
      );
    }
    throw error;
  }
}

async function readKeyFile(path: string): Promise<string> {
  return normalizeKey(await readFile(path, "utf8"), `API key file ${path}`);
}

function normalizeKey(value: string, source: string): string {
  const key = value.replace(/^\uFEFF/u, "").trim();
  if (!key) {
    throw new Error(`${source} is empty.`);
  }
  return key;
}
