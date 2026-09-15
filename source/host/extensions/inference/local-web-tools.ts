import { isLoopbackIpHost, isPrivateIpHost } from "../../../packages/agent/utils/ip.js";
import type { SandInferenceProvider } from "../../../shared/inference-router.js";

const FETCH_TIMEOUT_MS = 15_000;
const SEARCH_TIMEOUT_MS = 12_000;
const MAX_FETCH_CHARS = 100_000;
const MAX_SNIPPET_CHARS = 4_000;
const MAX_DOCUMENTS = 8;
const MAX_HTML_PARSE_CHARS = 250_000;
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface LocalWebDocument {
  readonly url: string;
  readonly title: string;
  readonly text: string;
}

export interface LocalWebSearchResult {
  readonly answer?: string;
  readonly documents: readonly LocalWebDocument[];
}

export interface LocalWebFetchSuccess { readonly content: string }
export interface LocalWebFetchError { readonly error: string; readonly isTimeout?: boolean }
export type LocalWebFetchResult = LocalWebFetchSuccess | LocalWebFetchError;

export interface LocalWebToolsDeps {
  readonly fetch?: typeof fetch;
  readonly env?: NodeJS.ProcessEnv;
}

export function shouldUseLocalWebTools(provider: SandInferenceProvider | string | undefined): boolean {
  return provider !== "cursor";
}

export function blockedUrlReason(raw: string): string | undefined {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return "Invalid URL: must include http:// or https://"; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return `Invalid URL protocol: ${parsed.protocol}`;
  const host = parsed.hostname.toLowerCase();
  const display = parsed.port.length > 0 ? `${host}:${parsed.port}` : host;
  if (host === "localhost" || host.endsWith(".localhost") || isLoopbackIpHost(host)) {
    return `Cannot fetch from localhost (${display}).`;
  }
  if (isPrivateIpHost(host)) return `Cannot fetch from private IP (${display}).`;
  return undefined;
}

export function htmlToReadableText(html: string, limit = MAX_FETCH_CHARS): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?(?:p|div|br|li|h[1-6]|tr|section|article|blockquote)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const decoded = decodeEntities(withoutNoise)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return decoded.length <= limit ? decoded : `${decoded.slice(0, limit)}\n\n...[truncated]`;
}

export function unwrapRedirectUrl(href: string): string {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    if (typeof uddg === "string" && uddg.length > 0) return uddg;
  } catch { /* keep original */ }
  return href;
}

export function parseDuckDuckGoHtml(html: string): LocalWebDocument[] {
  const slice = html.slice(0, MAX_HTML_PARSE_CHARS);
  const documents: LocalWebDocument[] = [];
  const seen = new Set<string>();
  const resultRe = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = resultRe.exec(slice)) !== null && documents.length < MAX_DOCUMENTS) {
    const url = unwrapRedirectUrl(decodeEntities(match[1] ?? "").trim());
    const title = htmlToReadableText(match[2] ?? "", 180).replace(/\n/g, " ").trim();
    if (!isHttpUrl(url) || title.length === 0 || seen.has(url)) continue;
    seen.add(url);
    const snippetWindow = slice.slice(match.index, match.index + 1_800);
    const snippetMatch = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(snippetWindow)
      ?? /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:td|div|span)>/i.exec(snippetWindow);
    const text = htmlToReadableText(snippetMatch?.[1] ?? title, MAX_SNIPPET_CHARS);
    documents.push({ url, title, text: text.length > 0 ? text : title });
  }
  return documents;
}

export function parseBaiduHtml(html: string): LocalWebDocument[] {
  const slice = html.slice(0, MAX_HTML_PARSE_CHARS);
  const documents: LocalWebDocument[] = [];
  const seen = new Set<string>();
  const muRe = /\bmu="(https?:\/\/[^"]+)"/gi;
  const titleRe = /<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = titleRe.exec(slice)) !== null && documents.length < MAX_DOCUMENTS) {
    const windowHtml = slice.slice(Math.max(0, match.index - 400), match.index + 2_400);
    const mu = muRe.exec(windowHtml)?.[1];
    muRe.lastIndex = 0;
    const url = unwrapRedirectUrl(decodeEntities((mu ?? match[1] ?? "").trim()));
    const title = htmlToReadableText(match[2] ?? "", 180).replace(/\n/g, " ").trim();
    if (!isHttpUrl(url) || title.length === 0 || seen.has(url)) continue;
    seen.add(url);
    const abstractMatch = /class="(?:c-abstract|content-right_8Zs40|c-span9)"[^>]*>([\s\S]*?)<\/(?:div|span)>/i.exec(windowHtml);
    const text = htmlToReadableText(abstractMatch?.[1] ?? title, MAX_SNIPPET_CHARS);
    documents.push({ url, title, text: text.length > 0 ? text : title });
  }
  return documents;
}

export function createLocalWebSearchService(deps: LocalWebToolsDeps = {}) {
  return async (_ctx: unknown, args: { searchTerm: string; explanation?: string }): Promise<LocalWebSearchResult> => {
    const searchTerm = args.searchTerm.trim();
    if (searchTerm.length === 0) return { documents: [], answer: "Empty search term." };
    const attempts: string[] = [];
    const keyed = await searchWithKeyedApi(searchTerm, deps, attempts);
    if (keyed !== undefined && keyed.documents.length > 0) return keyed;
    const html = await searchWithHtmlEngines(searchTerm, deps, attempts);
    if (html.documents.length > 0) return html;
    const portal = await maybeFetchNewsPortal(searchTerm, deps, attempts);
    if (portal !== undefined) return portal;
    return {
      answer: `Local web search found no documents. Tried: ${attempts.join(" | ") || "no backends"}.`,
      documents: [],
    };
  };
}

export function createLocalWebFetchService(deps: LocalWebToolsDeps = {}) {
  return async (_ctx: unknown, url: string): Promise<LocalWebFetchResult> => {
    const blocked = blockedUrlReason(url);
    if (blocked !== undefined) return { error: blocked };
    const fetched = await fetchText(url, { timeoutMs: FETCH_TIMEOUT_MS, deps });
    if (fetched.error !== undefined) return { error: fetched.error, ...(fetched.isTimeout === true ? { isTimeout: true } : {}) };
    return { content: toReadableContent(fetched.body ?? "", fetched.contentType) };
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_all, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_all, dec) => String.fromCodePoint(Number.parseInt(dec, 10)));
}

function envValue(deps: LocalWebToolsDeps, key: string): string | undefined {
  const value = (deps.env ?? process.env)[key]?.trim();
  return value != null && value.length > 0 ? value : undefined;
}

function toReadableContent(body: string, contentType: string | undefined): string {
  const type = (contentType ?? "").toLowerCase();
  if (type.includes("json") || type.includes("text/plain") || type.includes("markdown")) {
    return body.length <= MAX_FETCH_CHARS ? body : `${body.slice(0, MAX_FETCH_CHARS)}\n\n...[truncated]`;
  }
  return htmlToReadableText(body, MAX_FETCH_CHARS);
}

interface FetchedText {
  readonly body?: string;
  readonly contentType?: string;
  readonly error?: string;
  readonly isTimeout?: boolean;
}

async function fetchText(url: string, options: { timeoutMs: number; deps: LocalWebToolsDeps; accept?: string }): Promise<FetchedText> {
  const blocked = blockedUrlReason(url);
  if (blocked !== undefined) return { error: blocked };
  const direct = await fetchOnce(url, options, false);
  if (direct.error === undefined) return direct;
  if (direct.isTimeout === true) return direct;
  const proxy = envValue(options.deps, "SAND_WEB_TOOLS_PROXY")
    ?? envValue(options.deps, "HTTPS_PROXY")
    ?? envValue(options.deps, "HTTP_PROXY");
  if (proxy === undefined) return direct;
  const viaProxy = await fetchOnce(url, options, true);
  return viaProxy.error === undefined ? viaProxy : direct;
}

async function fetchOnce(url: string, options: { timeoutMs: number; deps: LocalWebToolsDeps; accept?: string }, useProxy: boolean): Promise<FetchedText> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const init: RequestInit & { dispatcher?: unknown } = {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: options.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    };
    if (useProxy) {
      const dispatcher = await proxyDispatcher(options.deps);
      if (dispatcher === undefined) return { error: "Proxy requested but ProxyAgent is unavailable." };
      init.dispatcher = dispatcher;
    }
    const fetchImpl = options.deps.fetch ?? fetch;
    const response = await fetchImpl(url, init);
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) return { error: `HTTP ${response.status} fetching ${url}` };
    if (/image\/|audio\/|video\/|octet-stream|pdf/i.test(contentType)) return { error: `Unsupported content type: ${contentType}` };
    const body = await response.text();
    return { body, contentType };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = controller.signal.aborted || /timeout|aborted/i.test(message);
    return { error: isTimeout ? `Timed out fetching ${url}` : message, ...(isTimeout ? { isTimeout: true } : {}) };
  } finally {
    clearTimeout(timer);
  }
}

async function proxyDispatcher(deps: LocalWebToolsDeps): Promise<unknown | undefined> {
  const proxy = envValue(deps, "SAND_WEB_TOOLS_PROXY") ?? envValue(deps, "HTTPS_PROXY") ?? envValue(deps, "HTTP_PROXY");
  if (proxy === undefined) return undefined;
  try {
    const undici = await import("undici") as { ProxyAgent?: new (url: string) => unknown };
    if (typeof undici.ProxyAgent !== "function") return undefined;
    return new undici.ProxyAgent(proxy);
  } catch {
    return undefined;
  }
}

async function searchWithKeyedApi(searchTerm: string, deps: LocalWebToolsDeps, attempts: string[]): Promise<LocalWebSearchResult | undefined> {
  const brave = envValue(deps, "BRAVE_SEARCH_API_KEY");
  if (brave !== undefined) {
    attempts.push("brave");
    const result = await braveSearch(searchTerm, brave, deps);
    if (result !== undefined) return result;
  }
  const serper = envValue(deps, "SERPER_API_KEY");
  if (serper !== undefined) {
    attempts.push("serper");
    const result = await serperSearch(searchTerm, serper, deps);
    if (result !== undefined) return result;
  }
  const tavily = envValue(deps, "TAVILY_API_KEY");
  if (tavily !== undefined) {
    attempts.push("tavily");
    const result = await tavilySearch(searchTerm, tavily, deps);
    if (result !== undefined) return result;
  }
  return undefined;
}

async function braveSearch(searchTerm: string, apiKey: string, deps: LocalWebToolsDeps): Promise<LocalWebSearchResult | undefined> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchTerm)}&count=${MAX_DOCUMENTS}`;
  const fetched = await postOrGetJson(url, {
    deps,
    headers: { accept: "application/json", "x-subscription-token": apiKey },
  });
  const web = (fetched as { web?: { results?: unknown } } | undefined)?.web?.results;
  const documents = jsonDocuments(web, item => ({
    url: asString(item, "url"),
    title: asString(item, "title"),
    text: asString(item, "description") || asString(item, "title"),
  }));
  return documents.length > 0 ? { documents } : undefined;
}

async function serperSearch(searchTerm: string, apiKey: string, deps: LocalWebToolsDeps): Promise<LocalWebSearchResult | undefined> {
  const fetched = await postOrGetJson("https://google.serper.dev/search", {
    deps,
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ q: searchTerm, num: MAX_DOCUMENTS }),
  });
  const organic = (fetched as { organic?: unknown } | undefined)?.organic;
  const documents = jsonDocuments(organic, item => ({
    url: asString(item, "link"),
    title: asString(item, "title"),
    text: asString(item, "snippet") || asString(item, "title"),
  }));
  return documents.length > 0 ? { documents } : undefined;
}

async function tavilySearch(searchTerm: string, apiKey: string, deps: LocalWebToolsDeps): Promise<LocalWebSearchResult | undefined> {
  const fetched = await postOrGetJson("https://api.tavily.com/search", {
    deps,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query: searchTerm, max_results: MAX_DOCUMENTS }),
  });
  const results = (fetched as { results?: unknown } | undefined)?.results;
  const documents = jsonDocuments(results, item => ({
    url: asString(item, "url"),
    title: asString(item, "title"),
    text: asString(item, "content") || asString(item, "title"),
  }));
  return documents.length > 0 ? { documents } : undefined;
}

async function postOrGetJson(url: string, options: {
  deps: LocalWebToolsDeps;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<unknown | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const fetchImpl = options.deps.fetch ?? fetch;
    const response = await fetchImpl(url, {
      method: options.method ?? "GET",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, ...(options.headers ?? {}) },
      ...(options.body === undefined ? {} : { body: options.body }),
    });
    if (!response.ok) return undefined;
    return await response.json() as unknown;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function jsonDocuments(raw: unknown, map: (item: Record<string, unknown>) => LocalWebDocument): LocalWebDocument[] {
  if (!Array.isArray(raw)) return [];
  const documents: LocalWebDocument[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
    const document = map(item as Record<string, unknown>);
    if (!isHttpUrl(document.url) || document.title.length === 0 || seen.has(document.url)) continue;
    seen.add(document.url);
    documents.push({
      url: document.url,
      title: document.title.slice(0, 180),
      text: document.text.slice(0, MAX_SNIPPET_CHARS),
    });
    if (documents.length >= MAX_DOCUMENTS) break;
  }
  return documents;
}

function asString(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  return typeof value === "string" ? value.trim() : "";
}

async function searchWithHtmlEngines(searchTerm: string, deps: LocalWebToolsDeps, attempts: string[]): Promise<LocalWebSearchResult> {
  const chinese = /[\u4e00-\u9fff]/.test(searchTerm);
  const engines = chinese
    ? [
        { name: "baidu", url: `https://www.baidu.com/s?wd=${encodeURIComponent(searchTerm)}&ie=utf-8`, parse: parseBaiduHtml },
        { name: "duckduckgo", url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchTerm)}`, parse: parseDuckDuckGoHtml },
      ]
    : [
        { name: "duckduckgo", url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchTerm)}`, parse: parseDuckDuckGoHtml },
        { name: "baidu", url: `https://www.baidu.com/s?wd=${encodeURIComponent(searchTerm)}&ie=utf-8`, parse: parseBaiduHtml },
      ];
  const documents: LocalWebDocument[] = [];
  const seen = new Set<string>();
  for (const engine of engines) {
    attempts.push(engine.name);
    const fetched = await fetchText(engine.url, { timeoutMs: SEARCH_TIMEOUT_MS, deps });
    if (fetched.body === undefined) continue;
    for (const document of engine.parse(fetched.body)) {
      if (seen.has(document.url)) continue;
      seen.add(document.url);
      documents.push(document);
      if (documents.length >= MAX_DOCUMENTS) break;
    }
    if (documents.length >= 3) break;
  }
  return { documents };
}

async function maybeFetchNewsPortal(searchTerm: string, deps: LocalWebToolsDeps, attempts: string[]): Promise<LocalWebSearchResult | undefined> {
  if (!/新闻|news/i.test(searchTerm)) return undefined;
  const portal = "https://news.baidu.com/";
  attempts.push(`portal:${portal}`);
  const fetched = await fetchText(portal, { timeoutMs: SEARCH_TIMEOUT_MS, deps });
  if (fetched.body === undefined) return undefined;
  return {
    answer: "Fetched news portal because search snippets were empty.",
    documents: [{
      url: portal,
      title: "Baidu News",
      text: toReadableContent(fetched.body, fetched.contentType).slice(0, MAX_SNIPPET_CHARS * 4),
    }],
  };
}
