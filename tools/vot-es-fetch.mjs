/**
 * Mirror the Spanish edition (losvolumenes.wixsite.com/los-volumenes) into this repo.
 *
 *   node tools/vot-es-fetch.mjs            # every post in the sitemap (resumable)
 *   node tools/vot-es-fetch.mjs --limit 5  # probe run
 *
 * The site is a Wix SPA: the post body is NOT in the served HTML and the blog API answers 403,
 * so the only honest reader is a real renderer. Puppeteer is already a devDependency here
 * (smoke:ci uses it), so this adds no new dependency.
 *
 * Writes _ocr_out/spanish/posts/<slug>.json  { slug, url, title, category, paragraphs, words }
 * and is idempotent: a slug whose file already exists is skipped, so an interrupted run
 * resumes where it stopped.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '_ocr_out', 'spanish');
const POSTS = path.join(OUT, 'posts');
const SITEMAP = 'https://losvolumenes.wixsite.com/los-volumenes/blog-posts-sitemap.xml';

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

async function sitemapUrls() {
  const xml = await (await fetch(SITEMAP)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

const slugOf = (url) => decodeURIComponent(url.split('/post/')[1] || url).trim();

async function scrape(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  // The post body renders into an article/rich-content container; wait for real text rather
  // than a fixed sleep, so a slow page is not silently captured half-empty.
  await page
    .waitForFunction(() => document.body.innerText.trim().length > 400, { timeout: 30000 })
    .catch(() => {});

  return page.evaluate(() => {
    const pick = (sels) => {
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el && el.innerText.trim()) return el;
      }
      return null;
    };
    const article =
      pick(['[data-hook="post-description"]', 'article', '[class*="post-content"]', 'main']) ||
      document.body;

    const paragraphs = [...article.querySelectorAll('p, h1, h2, h3, blockquote, li')]
      .map((n) => n.innerText.replace(/ /g, ' ').trim())
      .filter(Boolean);

    const title =
      document.querySelector('h1')?.innerText.trim() ||
      document.title.replace(/\s*\|.*$/, '').trim();

    // Wix renders the category as a labelled link on the post page.
    const category =
      [...document.querySelectorAll('a[href*="/blog/categories/"]')]
        .map((a) => a.getAttribute('href').split('/blog/categories/')[1])
        .filter(Boolean)[0] || '';

    return { title, category, paragraphs };
  });
}

async function main() {
  fs.mkdirSync(POSTS, { recursive: true });
  const urls = (await sitemapUrls()).slice(0, LIMIT);
  console.log(`sitemap: ${urls.length} posts`);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1600 });

  let done = 0;
  let skipped = 0;
  let empty = 0;
  for (const url of urls) {
    const slug = slugOf(url);
    const file = path.join(POSTS, `${slug.replace(/[\\/:*?"<>|]/g, '_')}.json`);
    if (fs.existsSync(file)) {
      skipped++;
      continue;
    }
    let rec;
    try {
      rec = await scrape(page, url);
    } catch (e) {
      console.log(`FAIL ${slug}: ${e.message}`);
      continue;
    }
    const words = rec.paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
    if (words < 20) empty++;
    fs.writeFileSync(
      file,
      JSON.stringify({ slug, url, ...rec, words }, null, 1) + '\n',
      'utf8',
    );
    done++;
    if (done % 10 === 0) console.log(`  ${done} fetched (${skipped} cached, ${empty} thin)`);
  }
  await browser.close();
  console.log(`\ndone: ${done} fetched, ${skipped} cached, ${empty} thin (<20 words)`);
}

main();
