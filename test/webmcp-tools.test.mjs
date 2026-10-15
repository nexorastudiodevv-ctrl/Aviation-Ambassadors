import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const scriptUrl = new URL("../assets/js/webmcp-tools.js", import.meta.url);

function createLink({ href, title, excerpt = "" }) {
  const article = {
    querySelector(selector) {
      if (selector === "h1, h2, h3") return { textContent: title };
      if (selector === "p:not(.tag)") return { textContent: excerpt };
      return null;
    }
  };

  return {
    href,
    textContent: title,
    closest(selector) {
      return selector === "article" ? article : null;
    }
  };
}

async function loadTool(links, modelContext) {
  const script = await readFile(scriptUrl, "utf8");
  vm.runInNewContext(script, {
    URL,
    console: { error() {} },
    document: {
      baseURI: "https://avam.nexorastudio-eg.com/",
      modelContext,
      querySelectorAll: () => links
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
}

test("registers a read-only search tool and returns matching same-site travel guides", async () => {
  let registeredTool;
  await loadTool([
    createLink({
      href: "https://avam.nexorastudio-eg.com/pages/travel-guides/dubai-from-riyadh.html",
      title: "السفر من الرياض إلى دبي",
      excerpt: "دليل رحلة قصيرة إلى دبي."
    }),
    createLink({
      href: "https://avam.nexorastudio-eg.com/pages/articles/flight-seat.html",
      title: "اختيار مقعد الطائرة",
      excerpt: "نصائح لاختيار المقعد."
    }),
    createLink({
      href: "https://example.com/pages/travel-guides/fake.html",
      title: "دليل خارجي"
    }),
    createLink({
      href: "https://avam.nexorastudio-eg.com/pages/contact.html",
      title: "تواصل معنا"
    })
  ], {
    registerTool(tool) {
      registeredTool = tool;
    }
  });

  assert.equal(registeredTool.name, "search_travel_guides");
  assert.equal(registeredTool.annotations.readOnlyHint, true);
  assert.equal(registeredTool.annotations.untrustedContentHint, true);

  const results = JSON.parse(await registeredTool.execute({ query: "الرياض دبي" }));
  assert.deepEqual(JSON.parse(JSON.stringify(results.results)), [{
    title: "السفر من الرياض إلى دبي",
    description: "دليل رحلة قصيرة إلى دبي.",
    url: "https://avam.nexorastudio-eg.com/pages/travel-guides/dubai-from-riyadh.html"
  }]);
});

test("does nothing when the browser does not support WebMCP", async () => {
  let registered = false;
  await loadTool([], undefined);
  assert.equal(registered, false);
});
