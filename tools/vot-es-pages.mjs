/**
 * Capture the Spanish mirror's STANDALONE pages (not blog posts).
 *
 *   node tools/vot-es-pages.mjs
 *
 * Los Bendecidos is the reason this exists: it carries no blog posts at all — its whole text
 * is rendered inline on one page — so a crawler that only walks blog-posts-sitemap.xml misses
 * that collection completely and reports a total that looks right.
 *
 * Writes _ocr_out/spanish/pages/<name>.json { name, url, title, headings, paragraphs, words }
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '_ocr_out', 'spanish', 'pages');

const PAGES = [
  ['parte1-index', 'https://losvolumenes.wixsite.com/los-volumenes'],
  ['parte2-index', 'https://losvolumenes.wixsite.com/los-volumenes/parte2'],
  ['losbendecidos', 'https://losvolumenes.wixsite.com/los-volumenes/losbendecidos'],
];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 2000 });
fs.mkdirSync(OUT, { recursive: true });

for (const [name, url] of PAGES) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  // Scroll to the bottom: Wix lazy-renders sections, and a page captured without this looks
  // legitimately short rather than truncated.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 800) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
  });
  await new Promise((r) => setTimeout(r, 2500));

  const rec = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('h1, h2, h3, h4, p, blockquote, li')];
    const paragraphs = nodes
      .map((n) => n.innerText.replace(/ /g, ' ').trim())
      .filter(Boolean);
    const headings = nodes
      .filter((n) => /^H[1-4]$/.test(n.tagName))
      .map((n) => n.innerText.trim())
      .filter(Boolean);
    const postLinks = [
      ...new Set(
        [...document.querySelectorAll('a[href*="/post/"]')].map((a) => a.getAttribute('href')),
      ),
    ];
    return {
      title: document.title.replace(/\s*\|.*$/, '').trim(),
      headings,
      paragraphs,
      postLinks: postLinks.length,
    };
  });

  const words = rec.paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
  fs.writeFileSync(
    path.join(OUT, `${name}.json`),
    JSON.stringify({ name, url, ...rec, words }, null, 1) + '\n',
    'utf8',
  );
  console.log(
    `${name.padEnd(16)} words=${String(words).padStart(6)} headings=${String(rec.headings.length).padStart(4)} postLinks=${rec.postLinks}`,
  );
}

await browser.close();
