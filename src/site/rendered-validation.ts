import { readdir, readFile, stat } from "node:fs/promises";
import {
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

export interface RenderedSiteValidationOptions {
  publicDir: string;
  expectedBaseUrl: string;
  expectedNoIndexPaths?: readonly string[];
}

export interface RenderedSiteValidationSummary {
  canonicalUrls: {
    renderedPages: number;
    uniqueCanonicals: number;
  };
  metaDescriptions: {
    renderedPages: number;
    indexablePages: number;
    distinctSectionDescriptions: number;
  };
  pageTitles: {
    renderedPages: number;
    uniqueTitles: number;
    siteNameSuffix: string;
  };
  sitemap: {
    renderedPages: number;
    indexablePages: number;
    sitemapPages: number;
    lastmodEntries: number;
  };
  renderedSeo: {
    renderedPages: number;
    internalLinks: number;
    noIndexPages: number;
    jsonLdBlocks: number;
  };
}

interface RenderedHtmlFile {
  fullPath: string;
  relativePath: string;
  html: string;
}

interface RenderedDescription {
  relativePath: string;
  description: string;
  normalizedDescription: string;
  isIndexable: boolean;
}

interface RenderedTitle {
  relativePath: string;
  title: string;
  normalizedTitle: string;
  titleSuffix?: string;
}

interface XmlElement {
  name: string;
  attributes: ReadonlyMap<string, string>;
  namespaces: ReadonlyMap<string, string>;
  children: XmlElement[];
  textParts: string[];
}

const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";
const DEFAULT_NO_INDEX_PATHS = ["search/index.html"] as const;
const NO_INDEX_PATTERN = /(?:^|[\s,])noindex(?:$|[\s,])/iu;
const ATTRIBUTE_VALUE_PATTERN =
  "\\s*=\\s*(?:\"(?<double>[^\"]*)\"|'(?<single>[^']*)'|(?<unquoted>[^\\s>]+))";

export async function validateRenderedSite(
  options: RenderedSiteValidationOptions,
): Promise<RenderedSiteValidationSummary> {
  const publicDir = resolve(options.publicDir);
  await assertDirectory(publicDir);
  const htmlFiles = await readRenderedHtmlFiles(publicDir);

  const canonicalUrls = validateCanonicalUrls(
    htmlFiles,
    normalizeHttpBaseUrl(options.expectedBaseUrl, false),
  );
  const metaDescriptions = validateMetaDescriptions(htmlFiles);
  const pageTitles = validatePageTitles(htmlFiles);
  const deploymentBaseUrl = normalizeHttpBaseUrl(options.expectedBaseUrl, true);
  const sitemap = await validateSitemap(publicDir, htmlFiles, deploymentBaseUrl);
  const renderedSeo = await validateRenderedSeo(
    publicDir,
    htmlFiles,
    deploymentBaseUrl,
    options.expectedNoIndexPaths ?? DEFAULT_NO_INDEX_PATHS,
  );

  return {
    canonicalUrls,
    metaDescriptions,
    pageTitles,
    sitemap,
    renderedSeo,
  };
}

export function printRenderedValidationSummary(
  summary: RenderedSiteValidationSummary,
  writeLine: (line: string) => void = (line) => console.log(line),
): void {
  writeLine("Full-site Hugo canonical URL validation passed.");
  writeLine(
    `Rendered/unique canonicals: ${summary.canonicalUrls.renderedPages}/${summary.canonicalUrls.uniqueCanonicals}`,
  );
  writeLine("Hugo meta description validation passed.");
  writeLine(
    `Rendered/indexable pages: ${summary.metaDescriptions.renderedPages}/${summary.metaDescriptions.indexablePages}`,
  );
  writeLine(
    `Distinct section descriptions: ${summary.metaDescriptions.distinctSectionDescriptions}`,
  );
  writeLine("Hugo page title validation passed.");
  writeLine(
    `Rendered/unique titles: ${summary.pageTitles.renderedPages}/${summary.pageTitles.uniqueTitles}`,
  );
  writeLine(`Site-name suffix: ${summary.pageTitles.siteNameSuffix}`);
  writeLine("Hugo sitemap validation passed.");
  writeLine(
    `Rendered/indexable/sitemap pages: ${summary.sitemap.renderedPages}/${summary.sitemap.indexablePages}/${summary.sitemap.sitemapPages}`,
  );
  writeLine(`Lastmod entries: ${summary.sitemap.lastmodEntries}`);
  writeLine("Rendered SEO regression validation passed.");
  writeLine(
    `Pages/internal links: ${summary.renderedSeo.renderedPages}/${summary.renderedSeo.internalLinks}`,
  );
  writeLine(
    `Noindex pages/JSON-LD blocks: ${summary.renderedSeo.noIndexPages}/${summary.renderedSeo.jsonLdBlocks}`,
  );
}

function validateCanonicalUrls(
  htmlFiles: readonly RenderedHtmlFile[],
  baseUrl: URL,
): RenderedSiteValidationSummary["canonicalUrls"] {
  const canonicalUrls = new Set<string>();
  let renderedPages = 0;

  for (const file of htmlFiles) {
    if (isGoogleVerificationFile(file)) {
      continue;
    }

    renderedPages += 1;
    const canonicalTags = findCanonicalTags(file.html, false);
    if (canonicalTags.length !== 1) {
      throw new Error(
        `Rendered page must contain exactly one canonical link; found ${canonicalTags.length}: ${file.relativePath}`,
      );
    }

    const actualUrl = getHtmlAttributeValue(canonicalTags[0] ?? "", "href");
    if (actualUrl === undefined) {
      throw new Error(`Rendered page canonical link has no href: ${file.relativePath}`);
    }

    const route = getPageRoute(file.relativePath);
    const expectedUrl = new URL(route, baseUrl).href;
    if (
      /localhost|127\.0\.0\.1/iu.test(actualUrl) ||
      /\.md(?:$|[?#])/iu.test(actualUrl)
    ) {
      throw new Error(
        `Rendered page canonical URL is not deployable: ${file.relativePath} -> ${actualUrl}`,
      );
    }
    if (actualUrl !== expectedUrl) {
      throw new Error(
        `Rendered page canonical URL is '${actualUrl}'; expected '${expectedUrl}': ${file.relativePath}`,
      );
    }
    if (canonicalUrls.has(actualUrl)) {
      throw new Error(`Multiple rendered pages use the same canonical URL: ${actualUrl}`);
    }
    canonicalUrls.add(actualUrl);
  }

  if (renderedPages === 0) {
    throw new Error("No Hugo-rendered HTML pages were found under the public directory.");
  }

  return { renderedPages, uniqueCanonicals: canonicalUrls.size };
}

function validateMetaDescriptions(
  htmlFiles: readonly RenderedHtmlFile[],
): RenderedSiteValidationSummary["metaDescriptions"] {
  const renderedPages: RenderedDescription[] = [];

  for (const file of htmlFiles) {
    if (findCanonicalTags(file.html, false).length === 0) {
      continue;
    }

    const metaTags = findHtmlTags(file.html, "meta");
    const descriptionTags = metaTags.filter(
      (tag) => getHtmlAttributeValue(tag, "name")?.toLowerCase() === "description",
    );
    if (descriptionTags.length !== 1) {
      throw new Error(
        `Rendered page must contain exactly one meta description; found ${descriptionTags.length}: ${file.fullPath}`,
      );
    }

    const description = getHtmlAttributeValue(descriptionTags[0] ?? "", "content");
    if (description === undefined || description.trim().length === 0) {
      throw new Error(`Rendered page has an empty meta description: ${file.fullPath}`);
    }

    const robotsTags = metaTags.filter(
      (tag) => getHtmlAttributeValue(tag, "name")?.toLowerCase() === "robots",
    );
    const isIndexable = !robotsTags.some((tag) =>
      NO_INDEX_PATTERN.test(getHtmlAttributeValue(tag, "content") ?? ""),
    );
    const trimmedDescription = description.trim();
    renderedPages.push({
      relativePath: file.relativePath,
      description: trimmedDescription,
      normalizedDescription: trimmedDescription.toLowerCase(),
      isIndexable,
    });
  }

  if (renderedPages.length === 0) {
    throw new Error("No Hugo-rendered HTML pages were found under the public directory.");
  }

  const duplicateDescriptions = duplicateGroups(
    renderedPages.filter((page) => page.isIndexable),
    (page) => page.normalizedDescription,
  );
  if (duplicateDescriptions.length > 0) {
    const paths = duplicateDescriptions
      .map((group) => group.map((page) => page.relativePath).join(", "))
      .join("; ");
    throw new Error(`Found duplicate meta descriptions on indexable pages: ${paths}`);
  }

  const sectionPaths = [
    "index.html",
    "episodes/index.html",
    "questions/index.html",
    "search/index.html",
  ];
  const sectionPages = sectionPaths.map((sectionPath) => {
    const page = renderedPages.find((candidate) => candidate.relativePath === sectionPath);
    if (page === undefined) {
      throw new Error(`Expected rendered section page was not found: ${sectionPath}`);
    }
    return page;
  });
  const distinctSectionDescriptions = new Set(
    sectionPages.map((page) => page.normalizedDescription),
  ).size;
  if (distinctSectionDescriptions !== sectionPages.length) {
    throw new Error(
      "Home, Episodes, Questions, and Question Index must have distinct meta descriptions.",
    );
  }

  return {
    renderedPages: renderedPages.length,
    indexablePages: renderedPages.filter((page) => page.isIndexable).length,
    distinctSectionDescriptions,
  };
}

function validatePageTitles(
  htmlFiles: readonly RenderedHtmlFile[],
): RenderedSiteValidationSummary["pageTitles"] {
  const renderedPages: RenderedTitle[] = [];

  for (const file of htmlFiles) {
    if (findCanonicalTags(file.html, false).length === 0) {
      continue;
    }

    const titleMatches = Array.from(
      file.html.matchAll(/<title\b[^>]*>(?<text>.*?)<\/title>/gisu),
    );
    const h1Matches = Array.from(file.html.matchAll(/<h1\b[^>]*>(?<text>.*?)<\/h1>/gisu));
    if (titleMatches.length !== 1) {
      throw new Error(
        `Rendered page must contain exactly one title; found ${titleMatches.length}: ${file.relativePath}`,
      );
    }
    if (h1Matches.length !== 1) {
      throw new Error(
        `Rendered page must contain exactly one H1; found ${h1Matches.length}: ${file.relativePath}`,
      );
    }

    const title = convertToPlainHtmlText(titleMatches[0]?.groups?.["text"] ?? "");
    const h1 = convertToPlainHtmlText(h1Matches[0]?.groups?.["text"] ?? "");
    if (title.length === 0 || h1.length === 0) {
      throw new Error(`Rendered page has an empty title or H1: ${file.relativePath}`);
    }
    if (/^Questions in Livestream \d+(?:\s*\||$)/iu.test(title)) {
      throw new Error(`Rendered page still uses a generic livestream title: ${file.relativePath}`);
    }

    const numberedH1 = /^#(?<number>\d+):\s+(?<episode>.+)$/u.exec(h1);
    if (numberedH1?.groups !== undefined) {
      const episodeTitle = (numberedH1.groups["episode"] ?? "").trim().replace(/\.+$/u, "");
      const expectedPrefix = `${episodeTitle} - Livestream ${numberedH1.groups["number"] ?? ""} Q&A | `;
      if (!title.startsWith(expectedPrefix)) {
        throw new Error(
          `Numbered episode title does not match its H1 and livestream number: ${file.relativePath}`,
        );
      }
    } else if (file.relativePath !== "index.html" && !title.startsWith(`${h1} | `)) {
      throw new Error(`Rendered title is inconsistent with its H1: ${file.relativePath}`);
    }

    if (file.relativePath !== "index.html" && title === h1) {
      throw new Error(`Non-home title must add useful context beyond its H1: ${file.relativePath}`);
    }

    const suffix = /\|\s*(?<suffix>[^|]+)$/u.exec(title)?.groups?.["suffix"]?.trim();
    renderedPages.push({
      relativePath: file.relativePath,
      title,
      normalizedTitle: title.toLowerCase(),
      ...(suffix !== undefined ? { titleSuffix: suffix } : {}),
    });
  }

  if (renderedPages.length === 0) {
    throw new Error("No Hugo-rendered HTML pages were found under the public directory.");
  }

  const duplicateTitles = duplicateGroups(renderedPages, (page) => page.normalizedTitle);
  if (duplicateTitles.length > 0) {
    const paths = duplicateTitles
      .map((group) => group.map((page) => page.relativePath).join(", "))
      .join("; ");
    throw new Error(`Found duplicate rendered titles: ${paths}`);
  }

  const nonHomePages = renderedPages.filter((page) => page.relativePath !== "index.html");
  const missingSuffixPages = nonHomePages.filter(
    (page) => page.titleSuffix === undefined || page.titleSuffix.trim().length === 0,
  );
  if (missingSuffixPages.length > 0) {
    throw new Error(
      `Found non-home titles without a site-name suffix: ${missingSuffixPages.map((page) => page.relativePath).join(", ")}`,
    );
  }

  const uniqueSuffixes = new Set(nonHomePages.map((page) => page.titleSuffix ?? ""));
  if (uniqueSuffixes.size !== 1) {
    throw new Error("Rendered non-home titles must use one consistent site-name suffix.");
  }

  return {
    renderedPages: renderedPages.length,
    uniqueTitles: renderedPages.length,
    siteNameSuffix: uniqueSuffixes.values().next().value ?? "",
  };
}

async function validateSitemap(
  publicDir: string,
  htmlFiles: readonly RenderedHtmlFile[],
  baseUrl: URL,
): Promise<RenderedSiteValidationSummary["sitemap"]> {
  const sitemapPath = join(publicDir, "sitemap.xml");
  let sitemapText: string;
  try {
    sitemapText = await readFile(sitemapPath, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new Error(`Rendered sitemap was not found: ${sitemapPath}`);
    }
    throw error;
  }

  let sitemapRoot: XmlElement;
  try {
    sitemapRoot = parseXml(sitemapText);
  } catch {
    throw new Error(`Rendered sitemap is not valid XML: ${sitemapPath}`);
  }
  if (
    localXmlName(sitemapRoot.name) !== "urlset" ||
    namespaceUri(sitemapRoot) !== SITEMAP_NAMESPACE
  ) {
    throw new Error("Rendered sitemap must use the standard sitemap urlset namespace.");
  }

  const sitemapUrlElements = sitemapRoot.children.filter(
    (element) =>
      localXmlName(element.name) === "url" && namespaceUri(element) === SITEMAP_NAMESPACE,
  );
  const actualUrls = new Set<string>();
  for (const urlElement of sitemapUrlElements) {
    const locElements = urlElement.children.filter(
      (element) =>
        localXmlName(element.name) === "loc" && namespaceUri(element) === SITEMAP_NAMESPACE,
    );
    if (locElements.length !== 1 || xmlInnerText(locElements[0] ?? emptyXmlElement()).trim().length === 0) {
      throw new Error("Every sitemap URL entry must contain exactly one non-empty loc element.");
    }
    const url = getValidatedDeploymentUrl(
      xmlInnerText(locElements[0] ?? emptyXmlElement()).trim(),
      "Sitemap loc",
      baseUrl,
    );
    if (/\/search\/?$/iu.test(url)) {
      throw new Error(`The noindexed search page must not appear in the sitemap: ${url}`);
    }
    if (actualUrls.has(url)) {
      throw new Error(`Duplicate sitemap URL: ${url}`);
    }
    actualUrls.add(url);
  }

  const expectedUrls = new Set<string>();
  let renderedPages = 0;
  let indexablePages = 0;
  for (const file of htmlFiles) {
    const canonicalTags = findCanonicalTags(file.html, false);
    if (canonicalTags.length === 0) {
      continue;
    }
    renderedPages += 1;
    if (canonicalTags.length !== 1) {
      throw new Error(`Rendered page must contain exactly one canonical link: ${file.fullPath}`);
    }
    const canonicalUrlValue = getHtmlAttributeValue(canonicalTags[0] ?? "", "href");
    if (canonicalUrlValue === undefined || canonicalUrlValue.trim().length === 0) {
      throw new Error(`Rendered page has an empty canonical URL: ${file.fullPath}`);
    }
    const canonicalUrl = getValidatedDeploymentUrl(
      canonicalUrlValue,
      "Canonical URL",
      baseUrl,
    );
    const metaTags = findHtmlTags(file.html, "meta");
    const isNoIndex = metaTags
      .filter((tag) => getHtmlAttributeValue(tag, "name")?.toLowerCase() === "robots")
      .some((tag) => NO_INDEX_PATTERN.test(getHtmlAttributeValue(tag, "content") ?? ""));
    if (!isNoIndex) {
      indexablePages += 1;
      if (expectedUrls.has(canonicalUrl)) {
        throw new Error(`Multiple indexable pages use the same canonical URL: ${canonicalUrl}`);
      }
      expectedUrls.add(canonicalUrl);
    }
  }

  if (renderedPages === 0) {
    throw new Error("No canonical HTML pages were found under the public directory.");
  }
  const missingUrls = Array.from(expectedUrls).filter((url) => !actualUrls.has(url));
  const unexpectedUrls = Array.from(actualUrls).filter((url) => !expectedUrls.has(url));
  if (missingUrls.length > 0 || unexpectedUrls.length > 0) {
    const details: string[] = [];
    if (missingUrls.length > 0) details.push(`missing: ${missingUrls.join(", ")}`);
    if (unexpectedUrls.length > 0) details.push(`unexpected: ${unexpectedUrls.join(", ")}`);
    throw new Error(`Sitemap URLs do not match canonical, indexable HTML pages (${details.join("; ")}).`);
  }

  const lastmodEntries = sitemapUrlElements.reduce(
    (count, element) =>
      count +
      element.children.filter(
        (child) =>
          localXmlName(child.name) === "lastmod" && namespaceUri(child) === SITEMAP_NAMESPACE,
      ).length,
    0,
  );
  return {
    renderedPages,
    indexablePages,
    sitemapPages: actualUrls.size,
    lastmodEntries,
  };
}

async function validateRenderedSeo(
  publicDir: string,
  htmlFiles: readonly RenderedHtmlFile[],
  baseUrl: URL,
  expectedNoIndexPaths: readonly string[],
): Promise<RenderedSiteValidationSummary["renderedSeo"]> {
  if (htmlFiles.length === 0) {
    throw new Error("No Hugo-rendered HTML pages were found under the public directory.");
  }

  const expectedNoIndexSet = new Set(
    expectedNoIndexPaths.map((path) => path.replaceAll("\\", "/").replace(/^\/+/, "")),
  );
  const seenNoIndexSet = new Set<string>();
  const htmlCache = new Map<string, string>();
  const brokenLinks: string[] = [];
  let internalLinks = 0;
  let jsonLdBlocks = 0;
  let renderedPages = 0;

  for (const file of htmlFiles) {
    if (isGoogleVerificationFile(file)) {
      continue;
    }
    renderedPages += 1;
    htmlCache.set(file.fullPath, file.html);

    const titleTags = Array.from(file.html.matchAll(/<title\b[^>]*>.*?<\/title>/gisu));
    const h1Tags = Array.from(file.html.matchAll(/<h1\b[^>]*>.*?<\/h1>/gisu));
    const canonicalTags = findCanonicalTags(file.html, true);
    const metaTags = findHtmlTags(file.html, "meta");
    const descriptionTags = metaTags.filter(
      (tag) => getHtmlAttributeValue(tag, "name")?.toLowerCase() === "description",
    );
    if (
      titleTags.length !== 1 ||
      h1Tags.length !== 1 ||
      canonicalTags.length !== 1 ||
      descriptionTags.length !== 1
    ) {
      throw new Error(
        `Rendered page must contain exactly one title, H1, canonical, and meta description: ${file.relativePath} (title=${titleTags.length}, h1=${h1Tags.length}, canonical=${canonicalTags.length}, description=${descriptionTags.length})`,
      );
    }
    const description = getHtmlAttributeValue(descriptionTags[0] ?? "", "content");
    if (description === undefined || description.trim().length === 0) {
      throw new Error(`Rendered page has an empty meta description: ${file.relativePath}`);
    }

    const robotsTags = metaTags.filter(
      (tag) => getHtmlAttributeValue(tag, "name")?.toLowerCase() === "robots",
    );
    const noIndexTags = robotsTags.filter((tag) =>
      NO_INDEX_PATTERN.test(getHtmlAttributeValue(tag, "content") ?? ""),
    );
    if (expectedNoIndexSet.has(file.relativePath)) {
      if (robotsTags.length !== 1 || noIndexTags.length !== 1) {
        throw new Error(`Expected exactly one noindex robots tag on ${file.relativePath}.`);
      }
      seenNoIndexSet.add(file.relativePath);
    } else if (noIndexTags.length > 0) {
      throw new Error(`Unexpected noindex robots directive on ${file.relativePath}.`);
    }

    const jsonLdMatches = Array.from(
      file.html.matchAll(
        /<script\b(?=[^>]*\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json))[^>]*>(?<json>.*?)<\/script>/gisu,
      ),
    );
    for (const jsonLdMatch of jsonLdMatches) {
      const jsonLd = (jsonLdMatch.groups?.["json"] ?? "").trim();
      if (jsonLd.length === 0) {
        throw new Error(`Rendered page contains an empty JSON-LD block: ${file.relativePath}`);
      }
      try {
        JSON.parse(jsonLd);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Rendered page contains invalid JSON-LD: ${file.relativePath} (${message})`);
      }
      jsonLdBlocks += 1;
    }

    const pageUrl = new URL(getPageRoute(file.relativePath), baseUrl);
    const anchorTags = Array.from(file.html.matchAll(/<(?:a|area)\b[^>]*>/giu), (match) => match[0]);
    for (const anchorTag of anchorTags) {
      const href = getHtmlAttributeValue(anchorTag, "href");
      if (href === undefined || href.trim().length === 0 || href === "#") {
        continue;
      }
      if (/^(?:mailto|tel|javascript|data):/iu.test(href)) {
        continue;
      }

      let targetUrl: URL;
      try {
        targetUrl = new URL(href, pageUrl);
      } catch {
        brokenLinks.push(`${file.relativePath} -> ${href} (invalid URL)`);
        continue;
      }
      if (
        targetUrl.hostname.toLowerCase() !== baseUrl.hostname.toLowerCase() ||
        effectivePort(targetUrl) !== effectivePort(baseUrl)
      ) {
        continue;
      }

      internalLinks += 1;
      const targetFile = await getInternalTargetFile(targetUrl, baseUrl, publicDir);
      if (targetFile === undefined) {
        brokenLinks.push(
          `${file.relativePath} -> ${href} (missing target or outside deployment base)`,
        );
        continue;
      }
      if (targetUrl.hash.length > 0 && extname(targetFile).toLowerCase() === ".html") {
        let targetHtml = htmlCache.get(targetFile);
        if (targetHtml === undefined) {
          targetHtml = await readFile(targetFile, "utf8");
          htmlCache.set(targetFile, targetHtml);
        }
        const fragment = targetUrl.hash.replace(/^#/, "");
        if (!testHtmlFragment(targetHtml, fragment)) {
          brokenLinks.push(`${file.relativePath} -> ${href} (missing fragment)`);
        }
      }
    }
  }

  const missingNoIndexPaths = Array.from(expectedNoIndexSet).filter(
    (path) => !seenNoIndexSet.has(path),
  );
  if (missingNoIndexPaths.length > 0) {
    throw new Error(
      `Expected noindex pages were not found or validated: ${missingNoIndexPaths.join(", ")}`,
    );
  }
  if (brokenLinks.length > 0) {
    const examples = brokenLinks.slice(0, 20);
    const suffix = brokenLinks.length > examples.length ? ` (showing first ${examples.length})` : "";
    throw new Error(
      `Found ${brokenLinks.length} broken internal links${suffix}: ${examples.join("; ")}`,
    );
  }

  return {
    renderedPages,
    internalLinks,
    noIndexPages: seenNoIndexSet.size,
    jsonLdBlocks,
  };
}

async function readRenderedHtmlFiles(publicDir: string): Promise<RenderedHtmlFile[]> {
  const paths = await findFilesRecursively(publicDir, ".html");
  paths.sort((left, right) => left.localeCompare(right, "en"));
  return Promise.all(
    paths.map(async (fullPath) => ({
      fullPath,
      relativePath: relative(publicDir, fullPath).replaceAll("\\", "/"),
      html: await readFile(fullPath, "utf8"),
    })),
  );
}

async function findFilesRecursively(directory: string, extension: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFilesRecursively(path, extension)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
      files.push(path);
    }
  }
  return files;
}

async function assertDirectory(path: string): Promise<void> {
  let details;
  try {
    details = await stat(path);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new Error(`Public directory was not found: ${path}`);
    }
    throw error;
  }
  if (!details.isDirectory()) {
    throw new Error(`Public directory is not a directory: ${path}`);
  }
}

function normalizeHttpBaseUrl(value: string, requireDeployable: boolean): URL {
  let baseUrl: URL;
  try {
    baseUrl = new URL(value);
  } catch {
    throw new Error(`ExpectedBaseUrl must be an absolute URL: ${value}`);
  }
  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new Error(`ExpectedBaseUrl must use HTTP or HTTPS: ${value}`);
  }
  if (
    requireDeployable &&
    (baseUrl.hostname.toLowerCase() === "localhost" || baseUrl.hostname === "127.0.0.1")
  ) {
    throw new Error(`ExpectedBaseUrl must be a deployable HTTP or HTTPS URL: ${value}`);
  }
  return new URL(`${baseUrl.href.replace(/\/+$/u, "")}/`);
}

function getValidatedDeploymentUrl(value: string, label: string, baseUrl: URL): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not an absolute URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must use HTTP or HTTPS: ${value}`);
  }
  if (
    url.hostname.toLowerCase() === "localhost" ||
    url.hostname === "127.0.0.1" ||
    /\.md$/iu.test(url.pathname)
  ) {
    throw new Error(`${label} is not a deployable HTML page URL: ${value}`);
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw new Error(`${label} must not contain a query string or fragment: ${value}`);
  }
  if (!url.href.startsWith(baseUrl.href)) {
    throw new Error(
      `${label} is outside the configured deployment base '${baseUrl.href}': ${value}`,
    );
  }
  return url.href;
}

function findHtmlTags(html: string, tagName: string): string[] {
  const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>`, "giu");
  return Array.from(html.matchAll(pattern), (match) => match[0]);
}

function findCanonicalTags(html: string, allowRelTokenList: boolean): string[] {
  return findHtmlTags(html, "link").filter((tag) => {
    const rel = getHtmlAttributeValue(tag, "rel");
    if (rel === undefined) return false;
    if (!allowRelTokenList) return rel.toLowerCase() === "canonical";
    return rel.split(/\s+/u).some((token) => token.toLowerCase() === "canonical");
  });
}

function getHtmlAttributeValue(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}${ATTRIBUTE_VALUE_PATTERN}`, "iu");
  const match = pattern.exec(tag);
  if (match?.groups === undefined) return undefined;
  const value = match.groups["double"] ?? match.groups["single"] ?? match.groups["unquoted"];
  return value === undefined ? undefined : decodeHtmlEntities(value);
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lt: "<",
    nbsp: "\u00a0",
    ndash: "–",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
  };
  return value.replace(
    /&(?<entity>#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/giu,
    (original, _entity: string, _offset: number, _input: string, groups?: Record<string, string>) => {
      const entity = groups?.["entity"] ?? "";
      if (/^#x/iu.test(entity)) {
        return codePointEntity(original, Number.parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith("#")) {
        return codePointEntity(original, Number.parseInt(entity.slice(1), 10));
      }
      return namedEntities[entity.toLowerCase()] ?? original;
    },
  );
}

function codePointEntity(original: string, codePoint: number): string {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return original;
  }
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return original;
  }
}

function convertToPlainHtmlText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/gu, "")).replace(/\s+/gu, " ").trim();
}

function getPageRoute(relativePath: string): string {
  if (relativePath === "index.html") return "";
  return relativePath.endsWith("/index.html")
    ? relativePath.slice(0, -"index.html".length)
    : relativePath;
}

function isGoogleVerificationFile(file: RenderedHtmlFile): boolean {
  return (
    /^google[a-z0-9]+\.html$/u.test(file.relativePath) &&
    /^google-site-verification:\s*google[a-z0-9]+\.html$/u.test(file.html.trim())
  );
}

function duplicateGroups<T>(items: readonly T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const itemKey = key(item);
    const group = groups.get(itemKey);
    if (group === undefined) groups.set(itemKey, [item]);
    else group.push(item);
  }
  return Array.from(groups.values()).filter((group) => group.length > 1);
}

async function getInternalTargetFile(
  url: URL,
  baseUrl: URL,
  rootPath: string,
): Promise<string | undefined> {
  const basePath = baseUrl.pathname;
  if (!url.pathname.startsWith(basePath)) return undefined;

  let relativeUrlPath: string;
  try {
    relativeUrlPath = decodeURIComponent(url.pathname.slice(basePath.length));
  } catch {
    return undefined;
  }
  const relativeFilePath = relativeUrlPath.replaceAll("/", sep);
  const candidatePaths: string[] = [];
  if (relativeFilePath.trim().length === 0) {
    candidatePaths.push("index.html");
  } else if (url.pathname.endsWith("/")) {
    candidatePaths.push(join(relativeFilePath, "index.html"));
  } else {
    candidatePaths.push(relativeFilePath);
    if (extname(relativeFilePath).length === 0) {
      candidatePaths.push(join(relativeFilePath, "index.html"));
    }
  }

  for (const candidatePath of candidatePaths) {
    const fullPath = resolve(rootPath, candidatePath);
    if (!pathIsInside(rootPath, fullPath)) continue;
    try {
      if ((await stat(fullPath)).isFile()) return fullPath;
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
  }
  return undefined;
}

function pathIsInside(root: string, candidate: string): boolean {
  const relativePath = relative(resolve(root), resolve(candidate));
  return (
    relativePath.length > 0 &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

function testHtmlFragment(html: string, fragment: string): boolean {
  if (fragment.trim().length === 0 || fragment.startsWith(":~:text=")) return true;
  const target = decodeHtmlEntities(decodeURIComponent(fragment));
  const matches = html.matchAll(
    /\b(?:id|name)\s*=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)'|(?<unquoted>[^\s>]+))/giu,
  );
  for (const match of matches) {
    const value = match.groups?.["double"] ?? match.groups?.["single"] ?? match.groups?.["unquoted"];
    if (value !== undefined && decodeHtmlEntities(value) === target) return true;
  }
  return false;
}

function effectivePort(url: URL): string {
  if (url.port.length > 0) return url.port;
  if (url.protocol === "http:") return "80";
  if (url.protocol === "https:") return "443";
  return "";
}

function parseXml(xml: string): XmlElement {
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  let cursor = 0;

  while (cursor < xml.length) {
    const opening = xml.indexOf("<", cursor);
    if (opening < 0) {
      appendXmlText(stack, xml.slice(cursor), root !== undefined);
      cursor = xml.length;
      break;
    }
    appendXmlText(stack, xml.slice(cursor, opening), root !== undefined);

    if (xml.startsWith("<!--", opening)) {
      const end = xml.indexOf("-->", opening + 4);
      if (end < 0) throw new Error("Unclosed XML comment.");
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", opening)) {
      const end = xml.indexOf("]]>", opening + 9);
      if (end < 0) throw new Error("Unclosed XML CDATA section.");
      if (stack.length === 0) throw new Error("XML CDATA is outside the document element.");
      stack[stack.length - 1]?.textParts.push(xml.slice(opening + 9, end));
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<?", opening)) {
      const end = xml.indexOf("?>", opening + 2);
      if (end < 0) throw new Error("Unclosed XML processing instruction.");
      cursor = end + 2;
      continue;
    }
    if (/^<!DOCTYPE\b/iu.test(xml.slice(opening, opening + 10))) {
      throw new Error("XML doctypes are not supported in rendered sitemaps.");
    }

    const closing = findXmlTagEnd(xml, opening + 1);
    const rawTag = xml.slice(opening + 1, closing).trim();
    if (rawTag.startsWith("/")) {
      const closingName = rawTag.slice(1).trim();
      if (!isXmlName(closingName) || stack.length === 0) {
        throw new Error("Invalid XML closing tag.");
      }
      const element = stack.pop();
      if (element?.name !== closingName) throw new Error("Mismatched XML closing tag.");
    } else {
      const selfClosing = rawTag.endsWith("/");
      const tagBody = selfClosing ? rawTag.slice(0, -1).trimEnd() : rawTag;
      const nameMatch = /^(?<name>[A-Za-z_:][A-Za-z0-9_.:-]*)/u.exec(tagBody);
      const name = nameMatch?.groups?.["name"];
      if (name === undefined) throw new Error("Invalid XML start tag.");
      const attributes = parseXmlAttributes(tagBody.slice(name.length));
      const namespaces = new Map(stack[stack.length - 1]?.namespaces ?? []);
      for (const [attributeName, attributeValue] of attributes) {
        if (attributeName === "xmlns") namespaces.set("", attributeValue);
        else if (attributeName.startsWith("xmlns:")) {
          namespaces.set(attributeName.slice("xmlns:".length), attributeValue);
        }
      }
      const element: XmlElement = {
        name,
        attributes,
        namespaces,
        children: [],
        textParts: [],
      };
      const parent = stack[stack.length - 1];
      if (parent === undefined) {
        if (root !== undefined) throw new Error("XML contains multiple document elements.");
        root = element;
      } else {
        parent.children.push(element);
      }
      if (!selfClosing) stack.push(element);
    }
    cursor = closing + 1;
  }

  if (root === undefined || stack.length !== 0) throw new Error("XML document is incomplete.");
  return root;
}

function findXmlTagEnd(xml: string, start: number): number {
  let quote: '"' | "'" | undefined;
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  throw new Error("Unclosed XML tag.");
}

function parseXmlAttributes(source: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  let cursor = 0;
  while (cursor < source.length) {
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
    if (cursor >= source.length) break;
    const nameMatch = /^[A-Za-z_:][A-Za-z0-9_.:-]*/u.exec(source.slice(cursor));
    if (nameMatch === null) throw new Error("Invalid XML attribute name.");
    const name = nameMatch[0];
    cursor += name.length;
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
    if (source[cursor] !== "=") throw new Error("XML attribute has no equals sign.");
    cursor += 1;
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") throw new Error("XML attribute value is not quoted.");
    cursor += 1;
    const end = source.indexOf(quote, cursor);
    if (end < 0) throw new Error("Unclosed XML attribute value.");
    const value = decodeXmlEntities(source.slice(cursor, end));
    if (attributes.has(name)) throw new Error("Duplicate XML attribute.");
    attributes.set(name, value);
    cursor = end + 1;
  }
  return attributes;
}

function appendXmlText(stack: XmlElement[], text: string, hasRoot: boolean): void {
  if (text.length === 0) return;
  const current = stack[stack.length - 1];
  if (current === undefined) {
    if (text.trim().length > 0 || !hasRoot) {
      if (text.trim().length > 0) throw new Error("XML text is outside the document element.");
    }
    return;
  }
  current.textParts.push(decodeXmlEntities(text));
}

function decodeXmlEntities(value: string): string {
  if (/&(?!amp;|lt;|gt;|apos;|quot;|#\d+;|#x[0-9a-f]+;)/iu.test(value)) {
    throw new Error("Invalid XML entity.");
  }
  return value.replace(
    /&(?<entity>amp|lt|gt|apos|quot|#\d+|#x[0-9a-f]+);/giu,
    (original, _entity: string, _offset: number, _input: string, groups?: Record<string, string>) => {
      const entity = groups?.["entity"] ?? "";
      if (/^#x/iu.test(entity)) return codePointEntity(original, Number.parseInt(entity.slice(2), 16));
      if (entity.startsWith("#")) return codePointEntity(original, Number.parseInt(entity.slice(1), 10));
      return { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' }[entity.toLowerCase()] ?? original;
    },
  );
}

function namespaceUri(element: XmlElement): string | undefined {
  const separator = element.name.indexOf(":");
  const prefix = separator < 0 ? "" : element.name.slice(0, separator);
  return element.namespaces.get(prefix);
}

function localXmlName(name: string): string {
  const separator = name.indexOf(":");
  return separator < 0 ? name : name.slice(separator + 1);
}

function xmlInnerText(element: XmlElement): string {
  return element.textParts.join("") + element.children.map(xmlInnerText).join("");
}

function emptyXmlElement(): XmlElement {
  return {
    name: "",
    attributes: new Map(),
    namespaces: new Map(),
    children: [],
    textParts: [],
  };
}

function isXmlName(value: string): boolean {
  return /^[A-Za-z_:][A-Za-z0-9_.:-]*$/u.test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}
