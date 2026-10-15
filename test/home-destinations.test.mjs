import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const homeUrl = new URL("../index.html", import.meta.url);

test("homepage hero keeps a space after the hidden mobile line break", async () => {
  const html = await readFile(homeUrl, "utf8");

  assert.match(html, /أوضح<br class="hidden sm:block">\s+من اختيار الوجهة/);
});

test("destination cards link to the matching guide or travel guide directory", async () => {
  const html = await readFile(homeUrl, "utf8");
  const section = html.match(/<section id="destinations"[\s\S]*?<\/section>/)?.[0];

  assert.ok(section, "homepage destination section should exist");

  const cards = [...section.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(cards.length, 4);

  for (const [, attributes, content] of cards) {
    const href = attributes.match(/\bhref="([^"]+)"/)?.[1];
    const ariaLabel = attributes.match(/\baria-label="([^"]+)"/)?.[1];

    assert.ok(href, "each destination card should be a link");
    assert.ok(ariaLabel, "each destination link should have an accessible name");
    assert.match(content, /اكتشف دليل الوجهة|استكشف أدلة السفر/);
    await access(new URL(href, homeUrl));
  }
});
