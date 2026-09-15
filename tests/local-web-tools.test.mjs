import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule() {
  const sourcePath = path.join(repoRoot, "source/host/extensions/inference/local-web-tools.ts");
  const result = await build({
    absWorkingDir: repoRoot,
    bundle: true,
    entryPoints: [sourcePath],
    format: "esm",
    platform: "node",
    target: "node22",
    write: false,
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function htmlResponse(body, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

test("non-cursor providers use local web tools; cursor stays on Cursor cloud", async () => {
  const tools = await loadModule();
  assert.equal(tools.shouldUseLocalWebTools("openrouter"), true);
  assert.equal(tools.shouldUseLocalWebTools("codex"), true);
  assert.equal(tools.shouldUseLocalWebTools("claude-code"), true);
  assert.equal(tools.shouldUseLocalWebTools("cursor"), false);
  assert.equal(tools.shouldUseLocalWebTools(undefined), true);
});

test("production extras branch WebSearch/WebFetch on inference provider", async () => {
  const source = await readFile(path.join(repoRoot, "source/host/extensions/inference/production.ts"), "utf8");
  assert.match(source, /shouldUseLocalWebTools\(context\.deps\.settings\.getInferenceProvider\(\)\)/);
  assert.match(source, /createLocalWebSearchService/);
  assert.match(source, /createLocalWebFetchService/);
  assert.match(source, /createCursorWebSearchService/);
});

test("SSRF guard rejects localhost and private IPs", async () => {
  const tools = await loadModule();
  assert.match(tools.blockedUrlReason("http://127.0.0.1/secret"), /localhost/);
  assert.match(tools.blockedUrlReason("http://192.168.1.8/"), /private IP/);
  assert.match(tools.blockedUrlReason("file:///etc/passwd"), /protocol/);
  assert.equal(tools.blockedUrlReason("https://news.baidu.com/"), undefined);
});

test("DuckDuckGo and Baidu HTML parsers unwrap titles, urls, and snippets", async () => {
  const tools = await loadModule();
  const ddg = tools.parseDuckDuckGoHtml(`
    <a rel="nofollow" class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fnews.baidu.com%2F">百度新闻</a>
    <a class="result__snippet" href="#">今日头条摘要</a>
  `);
  assert.equal(ddg.length, 1);
  assert.equal(ddg[0].url, "https://news.baidu.com/");
  assert.equal(ddg[0].title, "百度新闻");
  assert.match(ddg[0].text, /今日头条摘要/);

  const baidu = tools.parseBaiduHtml(`
    <div mu="https://news.example.com/a">
      <h3 class="t"><a href="https://www.baidu.com/link?url=abc">Example headline</a></h3>
      <div class="c-abstract">snippet from baidu</div>
    </div>
  `);
  assert.equal(baidu.length, 1);
  assert.equal(baidu[0].url, "https://news.example.com/a");
  assert.equal(baidu[0].title, "Example headline");
  assert.match(baidu[0].text, /snippet from baidu/);
});

test("local WebSearch uses Brave when keyed, otherwise HTML engines, and never talks to Cursor", async () => {
  const tools = await loadModule();
  const seen = [];
  const search = tools.createLocalWebSearchService({
    env: { BRAVE_SEARCH_API_KEY: "test-brave" },
    fetch: async (url) => {
      seen.push(String(url));
      assert.equal(String(url).includes("cursor"), false);
      return jsonResponse({ web: { results: [{ title: "Live news", url: "https://news.baidu.com/", description: "headlines" }] } });
    },
  });
  const result = await search({}, { searchTerm: "百度新闻" });
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].url, "https://news.baidu.com/");
  assert.match(seen[0], /api\.search\.brave\.com/);
});

test("local WebSearch falls back to DuckDuckGo HTML when no search API key is set", async () => {
  const tools = await loadModule();
  const search = tools.createLocalWebSearchService({
    env: {},
    fetch: async (url) => {
      const href = String(url);
      if (href.includes("html.duckduckgo.com")) {
        return htmlResponse(`<a class="result__a" href="https://example.com/n">Example</a><a class="result__snippet" href="#">hello</a>`);
      }
      if (href.includes("baidu.com")) return htmlResponse("<html></html>");
      throw new Error(`unexpected url ${href}`);
    },
  });
  const result = await search({}, { searchTerm: "latest rust release" });
  assert.equal(result.documents[0].url, "https://example.com/n");
  assert.equal(result.documents[0].title, "Example");
});

test("local WebFetch returns readable text and rejects private hosts", async () => {
  const tools = await loadModule();
  const fetchService = tools.createLocalWebFetchService({
    fetch: async () => htmlResponse("<html><script>alert(1)</script><p>Hello <b>news</b></p></html>"),
  });
  const ok = await fetchService({}, "https://news.baidu.com/");
  assert.equal("content" in ok, true);
  assert.match(ok.content, /Hello news/);
  assert.equal(ok.content.includes("alert"), false);
  const blocked = await fetchService({}, "http://10.0.0.4/internal");
  assert.equal("error" in blocked, true);
  assert.match(blocked.error, /private IP/);
});
