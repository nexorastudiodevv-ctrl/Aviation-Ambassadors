import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const siteOrigin = "https://avam.nexorastudio-eg.com";
const ardUrl = `${siteOrigin}/.well-known/ard.json`;
const catalogUrl = `${siteOrigin}/.well-known/ai-catalog.json`;

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

function assertEntries(entries) {
  assert.ok(Array.isArray(entries));
  assert.ok(entries.length > 0);

  for (const entry of entries) {
    assert.equal(typeof entry.identifier, "string");
    assert.equal(typeof entry.displayName, "string");
    assert.equal(typeof entry.type, "string");
    assert.equal(typeof entry.url, "string");
    assert.equal(Object.hasOwn(entry, "url") + Object.hasOwn(entry, "data"), 1);
    assert.equal(new URL(entry.url).origin, siteOrigin);
    assert.equal(new URL(entry.url).protocol, "https:");
  }
}

test("publishes a valid ARD manifest with discoverable travel content", async () => {
  const manifest = await readJson("../.well-known/ard.json");

  assert.equal(manifest["@context"], "https://agenticresourcediscovery.org/context/v1");
  assertEntries(manifest.entries);
  assert.ok(manifest.entries[0].representativeQueries.length >= 2);
});

test("publishes a compatible legacy AI catalog", async () => {
  const catalog = await readJson("../.well-known/ai-catalog.json");

  assert.equal(catalog.specVersion, "1.0");
  assert.equal(typeof catalog.host.displayName, "string");
  assert.equal(catalog.host.identifier, `${siteOrigin}/`);
  assertEntries(catalog.entries);
});

test("advertises current and legacy agent discovery manifests", async () => {
  const [html, robotsTxt] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../robots.txt", import.meta.url), "utf8")
  ]);

  assert.match(html, /<link rel="ard" href="https:\/\/avam\.nexorastudio-eg\.com\/\.well-known\/ard\.json">/);
  assert.match(html, /<link rel="ai-catalog" href="https:\/\/avam\.nexorastudio-eg\.com\/\.well-known\/ai-catalog\.json">/);
  assert.match(robotsTxt, /^Agentmap: https:\/\/avam\.nexorastudio-eg\.com\/\.well-known\/ard\.json$/m);
});
