import { initializeApp } from "firebase/app";
import { collection, getDocs, getFirestore, query, Timestamp, where } from "firebase/firestore";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import firebasePublicConfig from "./firebase-public-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteUrl = "https://avam.nexorastudio-eg.com";
const collectionName = "articles";
const blogPath = path.join(root, "pages", "blog.html");
const articlesPath = path.join(root, "pages", "articles");
const sitemapPath = path.join(root, "sitemap.xml");
const markerPattern = /<!-- FIREBASE_ARTICLES_START -->[\s\S]*?<!-- FIREBASE_ARTICLES_END -->/;
const requiredFields = ["title", "description", "excerpt", "content", "category"];

export function loadFirebasePublicConfig() {
  if (!firebasePublicConfig.apiKey || !firebasePublicConfig.projectId) {
    throw new Error("Firebase apiKey and projectId are required in scripts/firebase-public-config.mjs.");
  }
  return firebasePublicConfig;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toDate(value, field, slug) {
  let date;
  if (value instanceof Timestamp) {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string" || typeof value === "number") {
    date = new Date(value);
  }

  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(`Article "${slug}" must have a valid ${field} date.`);
  }

  return date;
}

function htmlDate(date) {
  return date.toISOString().slice(0, 10);
}

function safeImageUrl(value, slug) {
  if (value === undefined || value === null || value === "") return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Article "${slug}" has an invalid imageUrl.`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`Article "${slug}" imageUrl must use HTTPS.`);
  }
  return url.href;
}

function safeAffiliateUrl(value, slug) {
  if (value === undefined || value === null || value === "") return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Article "${slug}" has an invalid affiliateUrl.`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`Article "${slug}" affiliateUrl must use HTTPS.`);
  }
  return url.href;
}

export function validateArticle(id, data) {
  const normalizedData = { ...data };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`Article document ID "${id}" must be a lowercase ASCII slug.`);
  }
  if (data.slug !== id) {
    throw new Error(`Article "${id}" must set slug to match its Firestore document ID.`);
  }
  for (const field of requiredFields) {
    if (typeof data[field] !== "string" || !data[field].trim()) {
      throw new Error(`Article "${id}" requires a non-empty ${field} string.`);
    }
    normalizedData[field] = data[field].trim();
  }
  if (normalizedData.title.length > 90 || normalizedData.description.length > 200 || normalizedData.excerpt.length > 240) {
    throw new Error(`Article "${id}" exceeds the supported title, description, or excerpt length.`);
  }
  if (data.content.length > 60000) {
    throw new Error(`Article "${id}" content exceeds 60,000 characters.`);
  }

  const publishedAt = toDate(data.publishedAt, "publishedAt", id);
  const modifiedAt = data.updatedAt === undefined
    ? publishedAt
    : toDate(data.updatedAt, "updatedAt", id);
  const imageUrl = safeImageUrl(data.imageUrl, id);
  const imageAlt = typeof data.imageAlt === "string" ? data.imageAlt.trim() : "";
  if (imageUrl && !imageAlt) {
    throw new Error(`Article "${id}" must provide imageAlt when imageUrl is set.`);
  }

  const affiliateUrl = safeAffiliateUrl(data.affiliateUrl, id);
  const affiliateLabel = typeof data.affiliateLabel === "string" ? data.affiliateLabel.trim() : "";
  const affiliateDescription = typeof data.affiliateDescription === "string"
    ? data.affiliateDescription.trim()
    : "";
  const affiliatePosition = data.affiliatePosition || (affiliateUrl ? "bottom" : "none");
  if (affiliateUrl && !affiliateLabel) {
    throw new Error(`Article "${id}" must provide affiliateLabel when affiliateUrl is set.`);
  }
  if (affiliateLabel.length > 70 || affiliateDescription.length > 180) {
    throw new Error(`Article "${id}" exceeds the supported affiliate label or description length.`);
  }
  if (affiliateUrl && !["top", "middle", "bottom"].includes(affiliatePosition)) {
    throw new Error(`Article "${id}" has an invalid affiliatePosition.`);
  }
  if (!affiliateUrl && (affiliateLabel || affiliateDescription || affiliatePosition !== "none")) {
    throw new Error(`Article "${id}" has affiliate details but no affiliateUrl.`);
  }

  return {
    ...normalizedData,
    id,
    publishedAt,
    modifiedAt,
    imageUrl,
    imageAlt,
    affiliateUrl,
    affiliateLabel,
    affiliateDescription,
    affiliatePosition
  };
}

function renderMarkdown(markdown) {
  const rawHtml = marked.parse(markdown, { async: false });
  return sanitizeHtml(rawHtml, {
    allowedTags: [
      "a", "blockquote", "br", "code", "em", "h2", "h3", "hr", "li",
      "ol", "p", "pre", "strong", "ul"
    ],
    allowedAttributes: { a: ["href", "title"] },
    allowedSchemes: ["https", "http", "mailto"],
    disallowedTagsMode: "discard"
  });
}

function articleUrl(article) {
  return `${siteUrl}/pages/articles/${article.id}.html`;
}

function renderAffiliateCta(article) {
  if (!article.affiliateUrl) return "";

  return `<aside class="affiliate-cta" aria-label="رابط ترويجي">
    ${article.affiliateDescription ? `<p>${escapeHtml(article.affiliateDescription)}</p>` : ""}
    <a href="${escapeHtml(article.affiliateUrl)}" target="_blank" rel="sponsored nofollow noopener noreferrer">${escapeHtml(article.affiliateLabel)}</a>
    <small>إفصاح: قد نحصل على عمولة عند إتمام حجز عبر هذا الرابط، وفق شروط الشركة.</small>
  </aside>`;
}

function renderArticleContent(article) {
  const content = renderMarkdown(article.content);
  const affiliateCta = renderAffiliateCta(article);
  if (!affiliateCta) return content;
  if (article.affiliatePosition === "top") return `${affiliateCta}\n${content}`;
  if (article.affiliatePosition === "middle") {
    const firstParagraphEnd = content.indexOf("</p>");
    if (firstParagraphEnd === -1) return `${content}\n${affiliateCta}`;
    const insertionPoint = firstParagraphEnd + "</p>".length;
    return `${content.slice(0, insertionPoint)}\n${affiliateCta}${content.slice(insertionPoint)}`;
  }
  return `${content}\n${affiliateCta}`;
}

export function renderPage(article) {
  const title = escapeHtml(article.title);
  const description = escapeHtml(article.description);
  const category = escapeHtml(article.category);
  const url = escapeHtml(articleUrl(article));
  const canonical = articleUrl(article);
  const published = htmlDate(article.publishedAt);
  const modified = htmlDate(article.modifiedAt);
  const image = article.imageUrl
    ? `\n  <meta property="og:image" content="${escapeHtml(article.imageUrl)}">`
    : "";
  const twitterImage = article.imageUrl
    ? `\n  <meta name="twitter:image" content="${escapeHtml(article.imageUrl)}">`
    : "";
  const imageMarkup = article.imageUrl
    ? `<figure class="article-hero"><img src="${escapeHtml(article.imageUrl)}" alt="${escapeHtml(article.imageAlt)}" loading="eager"></figure>`
    : "";
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    inLanguage: "ar",
    datePublished: published,
    dateModified: modified,
    mainEntityOfPage: canonical,
    author: { "@type": "Organization", name: "سفراء الطيران" },
    publisher: { "@type": "Organization", name: "سفراء الطيران", url: `${siteUrl}/` },
    ...(article.imageUrl ? { image: [article.imageUrl] } : {})
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "الرئيسية", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "مدونة السفر", item: `${siteUrl}/pages/blog.html` },
      { "@type": "ListItem", position: 3, name: article.title, item: canonical }
    ]
  };

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg">
  <title>${title} | سفراء الطيران</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="ar_SA">
  <meta property="og:site_name" content="سفراء الطيران">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${url}">${image}
  <meta name="twitter:card" content="${article.imageUrl ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">${twitterImage}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../../assets/css/blog.css">
  <script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumb).replaceAll("<", "\\u003c")}</script>
  <script>
    window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
  </script>
  <script defer src="/_vercel/speed-insights/script.js"></script>
</head>
<body>
  <header class="site-header"><div class="header-inner">
    <a class="brand" href="/">✈ سفراء الطيران</a>
    <nav class="site-nav" aria-label="القائمة الرئيسية"><a href="/">الرئيسية</a><a href="/pages/blog.html" aria-current="page">مدونة السفر</a></nav>
  </div></header>
  <main class="container article-main">
    <nav class="breadcrumb" aria-label="مسار التنقل"><a href="/">الرئيسية</a> ← <a href="/pages/blog.html">مدونة السفر</a> ← ${title}</nav>
    <article class="article">
      ${imageMarkup}
      <span class="tag">${category} · نُشر في ${published}</span>
      <h1>${title}</h1>
      ${renderArticleContent(article)}
      <div class="article-footer"><a href="/pages/blog.html">كل أدلة السفر</a><a href="/">العودة إلى الرئيسية</a></div>
    </article>
  </main>
  <footer class="site-footer"><p>© 2026 سفراء الطيران</p><a href="/pages/blog.html">مدونة السفر</a></footer>
</body>
</html>
`;
}

export function renderCard(article) {
  return `      <article class="article-card">
        <span class="tag">${escapeHtml(article.category)} · نُشر في ${htmlDate(article.publishedAt)}</span>
        <h2>${escapeHtml(article.title)}</h2>
        <p>${escapeHtml(article.excerpt)}</p>
        <a href="articles/${escapeHtml(article.id)}.html">اقرأ المقال: ${escapeHtml(article.title)}</a>
      </article>`;
}

export function updateBlog(blogHtml, articles) {
  if (!markerPattern.test(blogHtml)) {
    throw new Error("Firebase article markers are missing from pages/blog.html.");
  }
  let updated = blogHtml.replace(
    markerPattern,
    `<!-- FIREBASE_ARTICLES_START -->\n${articles.map(renderCard).join("\n")}\n      <!-- FIREBASE_ARTICLES_END -->`
  );

  const scriptPattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const scripts = [...updated.matchAll(scriptPattern)];
  const collectionScript = scripts.find(([, body]) => {
    try {
      return JSON.parse(body)["@type"] === "CollectionPage";
    } catch {
      return false;
    }
  });
  if (!collectionScript) {
    throw new Error("CollectionPage JSON-LD was not found in pages/blog.html.");
  }

  const collection = JSON.parse(collectionScript[1]);
  const fixedItems = collection.mainEntity.itemListElement.filter(
    (item) => !item.url.startsWith(`${siteUrl}/pages/articles/`)
  );
  const generatedItems = articles.map((article) => ({
    "@type": "ListItem",
    position: 0,
    url: articleUrl(article),
    name: article.title
  }));
  collection.mainEntity.itemListElement = [...fixedItems, ...generatedItems]
    .map((item, index) => ({ ...item, position: index + 1 }));
  collection.mainEntity.numberOfItems = collection.mainEntity.itemListElement.length;

  const encoded = JSON.stringify(collection, null, 2);
  return updated.replace(collectionScript[0], `<script type="application/ld+json">\n${encoded}\n  </script>`);
}

export function updateSitemap(sitemap, articles) {
  const generatedUrl = new RegExp(
    `\\s*<url>\\s*<loc>${siteUrl.replaceAll(".", "\\.")}/pages/articles/[^<]+</loc>[\\s\\S]*?</url>`,
    "g"
  );
  let updated = sitemap.replace(generatedUrl, "");
  if (articles.length) {
    const latestModified = htmlDate(
      articles.reduce(
        (latest, article) => article.modifiedAt > latest ? article.modifiedAt : latest,
        articles[0].modifiedAt
      )
    );
    const blogUrlPattern = new RegExp(
      `(<url>\\s*<loc>${siteUrl.replaceAll(".", "\\.")}/pages/blog\\.html</loc>\\s*<lastmod>)[^<]+(</lastmod>\\s*</url>)`
    );
    updated = updated.replace(blogUrlPattern, `$1${latestModified}$2`);
  }
  const entries = articles.map((article) => `  <url>
    <loc>${articleUrl(article)}</loc>
    <lastmod>${htmlDate(article.modifiedAt)}</lastmod>
  </url>`).join("\n");
  if (entries) updated = updated.replace("</urlset>", `${entries}\n</urlset>`);
  return updated;
}

async function readPublishedArticles() {
  const app = initializeApp(await loadFirebasePublicConfig());
  const articlesQuery = query(
    collection(getFirestore(app), collectionName),
    where("status", "==", "published")
  );
  const snapshot = await getDocs(articlesQuery);
  const articles = snapshot.docs
    .map((document) => validateArticle(document.id, document.data()))
    .sort((left, right) => right.publishedAt - left.publishedAt || left.id.localeCompare(right.id));
  const ids = new Set();
  for (const article of articles) {
    if (ids.has(article.id)) throw new Error(`Duplicate article slug: ${article.id}`);
    ids.add(article.id);
  }
  return articles;
}

async function main() {
  const articles = await readPublishedArticles();
  await mkdir(articlesPath, { recursive: true });
  const existingFiles = await readdir(articlesPath);
  for (const file of existingFiles) {
    if (file.endsWith(".html")) await rm(path.join(articlesPath, file));
  }

  for (const article of articles) {
    await writeFile(path.join(articlesPath, `${article.id}.html`), renderPage(article), "utf8");
  }

  const blogHtml = await readFile(blogPath, "utf8");
  await writeFile(blogPath, updateBlog(blogHtml, articles), "utf8");

  const sitemap = await readFile(sitemapPath, "utf8");
  await writeFile(sitemapPath, updateSitemap(sitemap, articles), "utf8");

  console.log(`Generated ${articles.length} published Firebase article page(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error("Firebase article publishing failed:", error);
    process.exitCode = 1;
  });
}
