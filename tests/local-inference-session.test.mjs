import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { transform } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule() {
  const source = await readFile(path.join(repoRoot, "source/shared/node/local-inference-session.ts"), "utf8");
  const { code } = await transform(source, { format: "esm", loader: "ts", target: "es2022" });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

test("openrouter and env flag skip Cursor Sign in; cursor does not", async () => {
  const mod = await loadModule();
  assert.equal(mod.shouldBypassCursorSignIn("openrouter", {}), true);
  assert.equal(mod.shouldBypassCursorSignIn("codex", {}), true);
  assert.equal(mod.shouldBypassCursorSignIn("cursor", {}), false);
  assert.equal(mod.shouldBypassCursorSignIn(undefined, {}), false);
  assert.equal(mod.shouldBypassCursorSignIn("cursor", { SAND_SKIP_CURSOR_AUTH: "1" }), true);
  assert.equal(mod.LOCAL_INFERENCE_AUTH_STATUS.kind, "logged-in");
  assert.equal(mod.LOCAL_INFERENCE_AUTH_STATUS.authId, "local-openrouter");
});

test("cursor-auth getStatus uses local bypass when Cursor tokens are missing", async () => {
  const source = await readFile(path.join(repoRoot, "source/electron-main/account/cursor-auth.ts"), "utf8");
  assert.match(source, /bypassCursorSignIn\(\)/);
  assert.match(source, /LOCAL_INFERENCE_AUTH_STATUS/);
  const launch = await readFile(path.join(repoRoot, "scripts/launch-mason1-computer.sh"), "utf8");
  assert.match(launch, /SAND_SKIP_CURSOR_AUTH=1/);
  assert.match(launch, /plaintext:v1:/);
  assert.match(launch, /local-openrouter/);
  assert.match(launch, /never copy its sand-secrets/);
  assert.doesNotMatch(launch, /cursor-accounts/);
});
