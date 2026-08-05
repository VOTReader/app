/**
 * Which Spanish entry belongs to which collection — taken from each section's OWN index page.
 *
 *   node tools/vot-es-membership.mjs
 *
 * The per-post "category" scraped from a post page proved worthless: the selector picked up a
 * sidebar/nav category link rather than the post's own, and reported 350 of 352 posts as Part
 * Two. Membership is instead derived from the section index pages, which is what a reader
 * actually navigates, and each page is scrolled to exhaustion first because Wix lazy-renders
 * the list — a page captured without scrolling looks legitimately short rather than truncated.
 *
 * Writes _ocr_out/spanish/MEMBERSHIP.json { section: [slug, ...] }
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '_ocr_out', 'spanish');

const SECTIONS = [
  ['parte1', 'https://losvolumenes.wixsite.com/los-volumenes'],
  ['parte2', 'https://losvolumenes.wixsite.com/los-volumenes/parte2'],
];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 2000 });

const membership = {};
for (const [name, url] of SECTIONS) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

  let seen = 0;
  let stable = 0;
  // Scroll until the post-link count stops growing for several consecutive passes. A fixed
  // number of scrolls would silently under-collect on a long list.
  for (let i = 0; i < 120 && stable < 4; i++) {
    const count = await page.evaluate(async () => {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 900));
      // click a "load more" control if the theme uses one
      const more = [...document.querySelectorAll('button, a')].find((b) =>
        /m[áa]s|more|cargar/i.test(b.textContent || ''),
      );
      if (more) more.click();
      return new Set(
        [...document.querySelectorAll('a[href*="/post/"]')].map((a) => a.getAttribute('href')),
      ).size;
    });
    if (count === seen) stable++;
    else stable = 0;
    seen = count;
  }

  const slugs = await page.evaluate(() =>
    [
      ...new Set(
        [...document.querySelectorAll('a[href*="/post/"]')].map((a) =>
          decodeURIComponent(a.getAttribute('href').split('/post/')[1] || '').replace(/[?#].*$/, ''),
        ),
      ),
    ].filter(Boolean),
  );
  membership[name] = slugs;
  console.log(`${name.padEnd(8)} ${slugs.length} unique post links`);
}

await browser.close();
fs.writeFileSync(
  path.join(OUT, 'MEMBERSHIP.json'),
  JSON.stringify(membership, null, 1) + '\n',
  'utf8',
);
