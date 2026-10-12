import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  renderPage,
  updateBlog,
  updateSitemap,
  validateArticle
} from "../scripts/build-firebase-articles.mjs";

const validArticle = {
  slug: "family-flight-guide",
  title: "دليل السفر مع العائلة",
  description: "نصائح عملية للاستعداد للسفر مع العائلة والأطفال.",
  excerpt: "جهز وثائق الأسرة والأمتعة والمقاعد قبل الرحلة.",
  category: "السفر العائلي",
  content: "# استعد للرحلة\n\nنصائح **عملية** قبل السفر.\n\n<script>alert(1)</script>",
  status: "published",
  publishedAt: "2026-10-13T00:00:00.000Z",
  updatedAt: "2026-10-13T01:00:00.000Z"
};

test("validates Firestore article slugs and required SEO content", () => {
  assert.equal(validateArticle(validArticle.slug, validArticle).slug, validArticle.slug);
  assert.throws(() => validateArticle("../unsafe", validArticle), /lowercase ASCII slug/);
  assert.throws(() => validateArticle("different-slug", validArticle), /match its Firestore document ID/);
  assert.throws(() => validateArticle(validArticle.slug, { ...validArticle, description: "" }), /description/);
});

test("renders a static article with canonical metadata and sanitized Markdown", () => {
  const article = validateArticle(validArticle.slug, validArticle);
  const html = renderPage(article);

  assert.match(html, /rel="canonical" href="https:\/\/avam\.nexorastudio-eg\.com\/pages\/articles\/family-flight-guide\.html"/);
  assert.match(html, /<h1>دليل السفر مع العائلة<\/h1>/);
  assert.match(html, /نصائح <strong>عملية<\/strong> قبل السفر/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(jsonLd.length, 2);
  for (const [, json] of jsonLd) assert.doesNotThrow(() => JSON.parse(json));
});

test("adds Firestore cards and structured data without removing existing guides", async () => {
  const blogPath = new URL("../pages/blog.html", import.meta.url);
  const blog = await readFile(blogPath, "utf8");
  const article = validateArticle(validArticle.slug, validArticle);
  const updated = updateBlog(blog, [article]);

  assert.match(updated, /articles\/family-flight-guide\.html/);
  assert.match(updated, /دليل السفر مع العائلة/);
  assert.match(updated, /"numberOfItems": 9/);
  assert.match(updated, /travel-guides\/dubai-from-riyadh\.html/);
});

test("updates sitemap entries and removes unpublished generated URLs", async () => {
  const article = validateArticle(validArticle.slug, validArticle);
  const updated = updateSitemap(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://avam.nexorastudio-eg.com/</loc></url>
  <url>
    <loc>https://avam.nexorastudio-eg.com/pages/blog.html</loc>
    <lastmod>2026-01-01</lastmod>
  </url>
  <url><loc>https://avam.nexorastudio-eg.com/pages/articles/old-post.html</loc></url>
</urlset>`,
    [article]
  );

  assert.match(updated, /pages\/articles\/family-flight-guide\.html/);
  assert.match(updated, /<lastmod>2026-10-13<\/lastmod>/);
  assert.match(updated, /<loc>https:\/\/avam\.nexorastudio-eg\.com\/pages\/blog\.html<\/loc>\s*<lastmod>2026-10-13<\/lastmod>/);
  assert.doesNotMatch(updated, /pages\/articles\/old-post\.html/);
});
