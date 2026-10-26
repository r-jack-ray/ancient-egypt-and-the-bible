import blocklist from "./blocked-videos.json";

const blockedVideos = new Map<string, string>();
if (blocklist.schemaVersion !== 1) {
  throw new Error("Unsupported video blocklist schema.");
}
for (const {videoId, url, reason} of blocklist.videos) {
  if (
      !/^[A-Za-z0-9_-]{11}$/u.test(videoId) ||
      url !== `https://www.youtube.com/watch?v=${videoId}` ||
      !reason.trim() ||
      blockedVideos.has(videoId)
  ) {
    throw new Error(`Invalid or duplicate video blocklist entry: ${videoId}`);
  }
  blockedVideos.set(videoId, reason);
}

export function isBlockedVideo(videoId: string): boolean {
  return blockedVideos.has(videoId);
}

export function assertVideoNotBlocked(videoId: string): void {
  const reason = blockedVideos.get(videoId);
  if (reason !== undefined) {
    throw new Error(`Video ${videoId} is blocklisted: ${reason}`);
  }
}
