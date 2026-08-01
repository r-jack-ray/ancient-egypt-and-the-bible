import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  printRenderedValidationSummary,
  validateRenderedSite,
} from "./rendered-validation.js";

const BASE_URL = "https://example.test/archive/";

interface FixtureOptions {
  episodesCanonical?: string;
  episodesDescription?: string;
  episodesTitle?: string;
  homeBody?: string;
  homeJsonLd?: string;
  sitemapRoutes?: readonly string[];
}

test("validates the complete rendered-site contract and preserves summary output", async () => {
  const publicDir = await createRenderedSiteFixture();
  try {
    const summary = await validateRenderedSite({
      publicDir,
      expectedBaseUrl: BASE_URL,
    });
    assert.deepEqual(summary.canonicalUrls, {
      renderedPages: 4,
      uniqueCanonicals: 4,
    });
    assert.deepEqual(summary.metaDescriptions, {
      renderedPages: 4,
      indexablePages: 3,
      distinctSectionDescriptions: 4,
    });
    assert.deepEqual(summary.pageTitles, {
      renderedPages: 4,
      uniqueTitles: 4,
      siteNameSuffix: "Example Site",
    });
    assert.deepEqual(summary.sitemap, {
      renderedPages: 4,
      indexablePages: 3,
      sitemapPages: 3,
      lastmodEntries: 3,
    });
    assert.deepEqual(summary.renderedSeo, {
      renderedPages: 4,
      internalLinks: 3,
      noIndexPages: 1,
      jsonLdBlocks: 1,
    });

    const lines: string[] = [];
    printRenderedValidationSummary(summary, (line) => lines.push(line));
    assert.deepEqual(lines, [
      "Full-site Hugo canonical URL validation passed.",
      "Rendered/unique canonicals: 4/4",
      "Hugo meta description validation passed.",
      "Rendered/indexable pages: 4/3",
      "Distinct section descriptions: 4",
      "Hugo page title validation passed.",
      "Rendered/unique titles: 4/4",
      "Site-name suffix: Example Site",
      "Hugo sitemap validation passed.",
      "Rendered/indexable/sitemap pages: 4/3/3",
      "Lastmod entries: 3",
      "Rendered SEO regression validation passed.",
      "Pages/internal links: 4/3",
      "Noindex pages/JSON-LD blocks: 1/1",
    ]);
  } finally {
    await rm(publicDir, { recursive: true, force: true });
  }
});

test("rejects a canonical URL that does not match its rendered route", async () => {
  const publicDir = await createRenderedSiteFixture({
    episodesCanonical: `${BASE_URL}wrong/`,
  });
  try {
    await assert.rejects(
      validateRenderedSite({ publicDir, expectedBaseUrl: BASE_URL }),
      /canonical URL is .* expected .*episodes\//u,
    );
  } finally {
    await rm(publicDir, { recursive: true, force: true });
  }
});

test("rejects duplicate descriptions on indexable pages", async () => {
  const publicDir = await createRenderedSiteFixture({
    episodesDescription: "Home archive description.",
  });
  try {
    await assert.rejects(
      validateRenderedSite({ publicDir, expectedBaseUrl: BASE_URL }),
      /duplicate meta descriptions on indexable pages/u,
    );
  } finally {
    await rm(publicDir, { recursive: true, force: true });
  }
});

test("rejects a rendered title that is inconsistent with its H1", async () => {
  const publicDir = await createRenderedSiteFixture({
    episodesTitle: "Wrong title | Example Site",
  });
  try {
    await assert.rejects(
      validateRenderedSite({ publicDir, expectedBaseUrl: BASE_URL }),
      /title is inconsistent with its H1/u,
    );
  } finally {
    await rm(publicDir, { recursive: true, force: true });
  }
});

test("rejects a sitemap that omits an indexable canonical page", async () => {
  const publicDir = await createRenderedSiteFixture({
    sitemapRoutes: ["", "episodes/"],
  });
  try {
    await assert.rejects(
      validateRenderedSite({ publicDir, expectedBaseUrl: BASE_URL }),
      /Sitemap URLs do not match canonical, indexable HTML pages \(missing:/u,
    );
  } finally {
    await rm(publicDir, { recursive: true, force: true });
  }
});

test("rejects invalid JSON-LD during the consolidated SEO pass", async () => {
  const publicDir = await createRenderedSiteFixture({ homeJsonLd: "{not-json}" });
  try {
    await assert.rejects(
      validateRenderedSite({ publicDir, expectedBaseUrl: BASE_URL }),
      /contains invalid JSON-LD: index\.html/u,
    );
  } finally {
    await rm(publicDir, { recursive: true, force: true });
  }
});

test("rejects missing internal targets and fragments", async () => {
  const publicDir = await createRenderedSiteFixture({
    homeBody: '<a href="episodes/#missing">Missing fragment</a><a href="missing/">Missing page</a>',
  });
  try {
    await assert.rejects(
      validateRenderedSite({ publicDir, expectedBaseUrl: BASE_URL }),
      /Found 2 broken internal links/u,
    );
  } finally {
    await rm(publicDir, { recursive: true, force: true });
  }
});

async function createRenderedSiteFixture(options: FixtureOptions = {}): Promise<string> {
  const publicDir = await mkdtemp(join(tmpdir(), "aeb-rendered-site-"));
  const homeJsonLd = options.homeJsonLd ?? '{"@context":"https://schema.org","@type":"WebSite"}';
  const homeBody = options.homeBody ?? '<a href="episodes/#overview">Episodes</a>';

  await writePage(
    publicDir,
    "index.html",
    pageHtml({
      title: "Example Site",
      h1: "Ancient Egypt archive",
      canonical: BASE_URL,
      description: "Home archive description.",
      body: homeBody,
      jsonLd: homeJsonLd,
    }),
  );
  await writePage(
    publicDir,
    "episodes/index.html",
    pageHtml({
      title: options.episodesTitle ?? "Episodes &amp; More | Example Site",
      h1: "Episodes &amp; More",
      h1Attributes: ' id="overview"',
      canonical: options.episodesCanonical ?? `${BASE_URL}episodes/`,
      description: options.episodesDescription ?? "Episode archive description.",
    }),
  );
  await writePage(
    publicDir,
    "questions/index.html",
    pageHtml({
      title: "Questions | Example Site",
      h1: "Questions",
      canonical: `${BASE_URL}questions/`,
      description: "Question index description.",
      body: `<a href="${BASE_URL}">Home</a>`,
    }),
  );
  await writePage(
    publicDir,
    "search/index.html",
    pageHtml({
      title: "Search | Example Site",
      h1: "Search",
      canonical: `${BASE_URL}search/`,
      description: "Search page description.",
      robots: "noindex, follow",
      body: '<a href="../questions/">Questions</a>',
    }),
  );

  const sitemapRoutes = options.sitemapRoutes ?? ["", "episodes/", "questions/"];
  const sitemapEntries = sitemapRoutes
    .map(
      (route) =>
        `  <url><loc>${BASE_URL}${route}</loc><lastmod>2026-08-01</lastmod></url>`,
    )
    .join("\n");
  await writeFile(
    join(publicDir, "sitemap.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</urlset>
`,
    "utf8",
  );
  return publicDir;
}

function pageHtml(options: {
  title: string;
  h1: string;
  canonical: string;
  description: string;
  body?: string;
  robots?: string;
  jsonLd?: string;
  h1Attributes?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <title>${options.title}</title>
  <link rel="canonical" href="${options.canonical}">
  <meta name="description" content="${options.description}">
  ${options.robots === undefined ? "" : `<meta name="robots" content="${options.robots}">`}
  ${options.jsonLd === undefined ? "" : `<script type="application/ld+json">${options.jsonLd}</script>`}
</head>
<body>
  <h1${options.h1Attributes ?? ""}>${options.h1}</h1>
  ${options.body ?? ""}
</body>
</html>
`;
}

async function writePage(root: string, relativePath: string, contents: string): Promise<void> {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}
