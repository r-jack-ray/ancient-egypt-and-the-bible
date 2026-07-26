import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { resolveYoutubeApiKey } from "./api-key.js";

test("API key precedence is explicit file, environment, default file", async () => {
  const root = await mkdtemp(join(tmpdir(), "aeb-key-"));
  try {
    const explicit = join(root, "explicit.txt");
    const fallback = join(root, "fallback.txt");
    await writeFile(explicit, "\uFEFF explicit-key \n", "utf8");
    await writeFile(fallback, "fallback-key\n", "utf8");
    assert.equal(
      await resolveYoutubeApiKey({
        apiKeyFile: explicit,
        environment: { YOUTUBE_API_KEY: "environment-key" },
        defaultFile: fallback,
      }),
      "explicit-key",
    );
    assert.equal(
      await resolveYoutubeApiKey({
        environment: { YOUTUBE_API_KEY: " environment-key " },
        defaultFile: fallback,
      }),
      "environment-key",
    );
    assert.equal(
      await resolveYoutubeApiKey({ environment: {}, defaultFile: fallback }),
      "fallback-key",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("empty key fails without exposing a value", async () => {
  await assert.rejects(
    resolveYoutubeApiKey({ environment: { YOUTUBE_API_KEY: " \n " } }),
    /YOUTUBE_API_KEY is empty/u,
  );
});
