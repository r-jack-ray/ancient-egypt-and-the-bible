export type YoutubeDataApiEndpoint = "channels" | "playlistItems" | "videos";

const maximumTransientRetries = 3;
const initialRetryDelayMs = 100;

export interface YoutubeChannelUploads {
  channelId?: string;
  uploadsPlaylistId?: string;
}

export interface YoutubePlaylistVideoPage {
  videoIds: string[];
  nextPageToken?: string;
}

export interface YoutubeVideoResource {
  id?: string;
  snippet?: {
    title?: string;
    publishedAt?: string;
    liveBroadcastContent?: string;
  };
  contentDetails?: {
    duration?: string;
  };
  status?: {
    privacyStatus?: string;
    uploadStatus?: string;
  };
  liveStreamingDetails?: {
    scheduledStartTime?: string;
    actualStartTime?: string;
    actualEndTime?: string;
  };
}

export interface YoutubeDataApiClient {
  fetchChannelUploads(handle: string): Promise<YoutubeChannelUploads | undefined>;
  fetchPlaylistVideoPage(
    playlistId: string,
    pageToken?: string,
  ): Promise<YoutubePlaylistVideoPage>;
  fetchVideos(videoIds: readonly string[]): Promise<YoutubeVideoResource[]>;
}

export interface YoutubeDataApiClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class YoutubeDataApiError extends Error {
  readonly status: number | undefined;

  constructor(
    message: string,
    readonly endpoint: YoutubeDataApiEndpoint,
    status?: number,
  ) {
    super(message);
    this.name = "YoutubeDataApiError";
    this.status = status;
  }
}

export function createYoutubeDataApiClient(
  options: YoutubeDataApiClientOptions,
): YoutubeDataApiClient {
  if (!options.apiKey.trim()) {
    throw new Error("YouTube Data API key is empty.");
  }
  const fetchImplementation = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
  );

  return {
    async fetchChannelUploads(handle) {
      const response = await requestJson(
        "channels",
        {
          part: "contentDetails",
          forHandle: handle,
          maxResults: 1,
        },
        options.apiKey,
        fetchImplementation,
        sleep,
      );
      const items = collectionItems(response, "channels");
      const item = items[0];
      if (item === undefined) return undefined;
      const contentDetails = optionalObject(item, "contentDetails", "channels", "items[0]");
      const relatedPlaylists = contentDetails === undefined
        ? undefined
        : optionalObject(contentDetails, "relatedPlaylists", "channels", "items[0].contentDetails");
      const channelId = optionalString(item, "id", "channels", "items[0]");
      const uploadsPlaylistId = relatedPlaylists === undefined
        ? undefined
        : optionalString(
            relatedPlaylists,
            "uploads",
            "channels",
            "items[0].contentDetails.relatedPlaylists",
          );
      return {
        ...(channelId !== undefined ? { channelId } : {}),
        ...(uploadsPlaylistId !== undefined ? { uploadsPlaylistId } : {}),
      };
    },

    async fetchPlaylistVideoPage(playlistId, pageToken) {
      const response = await requestJson(
        "playlistItems",
        {
          part: "contentDetails",
          playlistId,
          maxResults: 50,
          pageToken,
        },
        options.apiKey,
        fetchImplementation,
        sleep,
      );
      const items = collectionItems(response, "playlistItems");
      const videoIds = items.flatMap((item, index) => {
        const path = `items[${index}]`;
        const details = optionalObject(item, "contentDetails", "playlistItems", path);
        if (details === undefined) return [];
        const videoId = optionalString(details, "videoId", "playlistItems", `${path}.contentDetails`);
        return videoId === undefined ? [] : [videoId];
      });
      const nextPageToken = optionalString(response, "nextPageToken", "playlistItems", "response");
      return {
        videoIds,
        ...(nextPageToken !== undefined ? { nextPageToken } : {}),
      };
    },

    async fetchVideos(videoIds) {
      if (videoIds.length === 0) return [];
      if (videoIds.length > 50) {
        throw new Error("YouTube Data API video requests are limited to 50 IDs.");
      }
      const response = await requestJson(
        "videos",
        {
          part: "snippet,contentDetails,status,liveStreamingDetails",
          id: videoIds.join(","),
          maxResults: videoIds.length,
        },
        options.apiKey,
        fetchImplementation,
        sleep,
      );
      return collectionItems(response, "videos").map((item, index) =>
        normalizeVideoResource(item, index)
      );
    },
  };
}

async function requestJson(
  endpoint: YoutubeDataApiEndpoint,
  parameters: Record<string, string | number | undefined>,
  apiKey: string,
  fetchImplementation: typeof fetch,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [name, value] of Object.entries(parameters)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  url.searchParams.set("key", apiKey);

  let retryCount = 0;
  while (true) {
    let response: Response;
    try {
      response = await fetchImplementation(url, {
        headers: { accept: "application/json" },
      });
    } catch {
      if (await waitBeforeRetry(retryCount, sleep)) {
        retryCount += 1;
        continue;
      }
      throw new YoutubeDataApiError(
        `YouTube Data API ${endpoint} request failed before receiving a response.`,
        endpoint,
      );
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      if (
        (response.ok || isRetryableHttpStatus(response.status)) &&
        await waitBeforeRetry(retryCount, sleep)
      ) {
        retryCount += 1;
        continue;
      }
      throw new YoutubeDataApiError(
        `YouTube Data API ${endpoint} response could not be read.`,
        endpoint,
        response.status,
      );
    }

    const value = parseJson(text);
    if (!response.ok) {
      if (
        isRetryableHttpStatus(response.status) &&
        await waitBeforeRetry(retryCount, sleep)
      ) {
        retryCount += 1;
        continue;
      }
      const detail = safeApiErrorDetail(value, apiKey);
      throw new YoutubeDataApiError(
        `YouTube Data API ${endpoint} request failed with HTTP ${response.status}${
          detail === undefined ? "." : `: ${detail}`
        }`,
        endpoint,
        response.status,
      );
    }
    if (!isObject(value)) {
      throw malformed(endpoint, "response");
    }
    return value;
  }
}

async function waitBeforeRetry(
  retryCount: number,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<boolean> {
  if (retryCount >= maximumTransientRetries) return false;
  await sleep(initialRetryDelayMs * (2 ** retryCount));
  return true;
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function parseJson(text: string): unknown {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function collectionItems(
  response: Record<string, unknown>,
  endpoint: YoutubeDataApiEndpoint,
): Record<string, unknown>[] {
  const value = response.items;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw malformed(endpoint, "response.items");
  return value.map((item, index) => {
    if (!isObject(item)) throw malformed(endpoint, `response.items[${index}]`);
    return item;
  });
}

function normalizeVideoResource(
  item: Record<string, unknown>,
  index: number,
): YoutubeVideoResource {
  const path = `items[${index}]`;
  const snippet = optionalObject(item, "snippet", "videos", path);
  const contentDetails = optionalObject(item, "contentDetails", "videos", path);
  const status = optionalObject(item, "status", "videos", path);
  const liveStreamingDetails = optionalObject(item, "liveStreamingDetails", "videos", path);
  const id = optionalString(item, "id", "videos", path);
  return {
    ...(id !== undefined ? { id } : {}),
    ...(snippet !== undefined
      ? {
          snippet: optionalStrings(
            snippet,
            ["title", "publishedAt", "liveBroadcastContent"],
            "videos",
            `${path}.snippet`,
          ),
        }
      : {}),
    ...(contentDetails !== undefined
      ? {
          contentDetails: optionalStrings(
            contentDetails,
            ["duration"],
            "videos",
            `${path}.contentDetails`,
          ),
        }
      : {}),
    ...(status !== undefined
      ? {
          status: optionalStrings(
            status,
            ["privacyStatus", "uploadStatus"],
            "videos",
            `${path}.status`,
          ),
        }
      : {}),
    ...(liveStreamingDetails !== undefined
      ? {
          liveStreamingDetails: optionalStrings(
            liveStreamingDetails,
            ["scheduledStartTime", "actualStartTime", "actualEndTime"],
            "videos",
            `${path}.liveStreamingDetails`,
          ),
        }
      : {}),
  };
}

function optionalStrings<K extends string>(
  object: Record<string, unknown>,
  keys: readonly K[],
  endpoint: YoutubeDataApiEndpoint,
  path: string,
): Partial<Record<K, string>> {
  const result: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = optionalString(object, key, endpoint, path);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function optionalObject(
  object: Record<string, unknown>,
  key: string,
  endpoint: YoutubeDataApiEndpoint,
  path: string,
): Record<string, unknown> | undefined {
  const value = object[key];
  if (value === undefined || value === null) return undefined;
  if (!isObject(value)) throw malformed(endpoint, `${path}.${key}`);
  return value;
}

function optionalString(
  object: Record<string, unknown>,
  key: string,
  endpoint: YoutubeDataApiEndpoint,
  path: string,
): string | undefined {
  const value = object[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw malformed(endpoint, `${path}.${key}`);
  return value;
}

function safeApiErrorDetail(value: unknown, apiKey: string): string | undefined {
  const root = isObject(value) ? value : undefined;
  const error = root !== undefined && isObject(root.error) ? root.error : undefined;
  const message = error?.message;
  if (typeof message !== "string") return undefined;
  const safe = message
    .replaceAll(apiKey, "[redacted]")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 300);
  return safe || undefined;
}

function malformed(
  endpoint: YoutubeDataApiEndpoint,
  path: string,
): YoutubeDataApiError {
  return new YoutubeDataApiError(
    `YouTube Data API ${endpoint} returned malformed data at ${path}.`,
    endpoint,
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
