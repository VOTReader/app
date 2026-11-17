/**
 * tools/e2e-undo-deletes.mjs - a delete with Undo puts the list back exactly, and the list survives a reload
 * (vot-ui 0610, 11-17: bookmarks, Library > Links, one History row).
 *
 * Walk (fresh profile, 412x915): onboarding; seed 3 bookmarks, 3 links and 4 History visits through the stores;
 * reload so they are stored. For each of Bookmarks, Links, History:
 *   U1  delete the middle item through the screen (its options or its x, then the confirm): it leaves the store,
 *       and the toast offers Undo
 *   U2  Undo: the store's list is byte-identical (JSON) to the list before the delete
 *   U3  reload: still identical
 *   U4  delete it again and let the toast go: after a reload it stays gone (the delete itself is durable)
 * --out DIR writes a 412x915 picture of each list before, with the Undo toast, and after Undo.
 * Exit 0 PASS, 1 FAIL, 3 harness error.
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { serveOwnTree } from './e2e-read-serve.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const note = (m) => console.log('  ' + m);

const T0 = Date.now() - 3600000;
const BOOKMARKS = [
  { id: 'bkm_e2e_1', hlKey: 'bible:john:3:16', label: 'Undo walk one', created: T0, updated: T0 },
  { id: 'bkm_e2e_2', hlKey: 'bible:john:3:17', label: 'Undo walk two', thought: 'kept with it', created: T0 + 1000, updated: T0 + 2000 },
  { id: 'bkm_e2e_3', hlKey: 'bible:genesis:1:1', label: 'Undo walk three', created: T0 + 3000, updated: T0 + 3000 },
];
const ep = (book, title, c, v) => ({ type: 'bible', key: `bible:${book}:${c}:${v}`, bookId: book, chapter: c, verse: v, label: `${title} ${c}:${v}` });
const LINKS = [
  { id: 'lnk_e2e_1', created: T0, source: ep('john', 'John', 3, 16), target: ep('romans', 'Romans', 5, 8) },
  { id: 'lnk_e2e_2', created: T0 + 1000, source: ep('john', 'John', 1, 1), target: ep('genesis', 'Genesis', 1, 1) },
  { id: 'lnk_e2e_3', created: T0 + 2000, source: ep('psalms', 'Psalms', 23, 1), target: ep('john', 'John', 10, 11) },
];
const VISITS = [   // oldest first: add() puts each at the top
  [{ type: 'chapter', bookId: 'genesis', bookTitle: 'Genesis', chapterNum: 1 }, T0],
  [{ type: 'chapter', bookId: 'john', bookTitle: 'John', chapterNum: 3 }, T0 + 1000],
  [{ type: 'chapter', bookId: 'romans', bookTitle: 'Romans', chapterNum: 5 }, T0 + 2000],
  [{ type: 'chapter', bookId: 'john', bookTitle: 'John', chapterNum: 3 }, T0 + 3000],
];

async function main() {
  const { server, url } = await serveOwnTree();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    await page.setViewport({ width: 412, height: 915 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const clickText = async (re, sel = 'button, [role="button"], a') => {
      for (let i = 0; i < 60; i++) {
        const ok = await page.evaluate((src, s) => {
          const rx = new RegExp(src, 'i');
          const el = [...document.querySelectorAll(s)].find((b) => b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden'
            && !b.closest('[inert]') && (rx.test((b.textContent || '').trim()) || rx.test((b.getAttribute('aria-label') || '').trim())));
          if (!el) return false;
          el.scrollIntoView({ block: 'center' }); el.click(); return true;
        }, re.source, sel);
        if (ok) { await sleep(600); return; }
        await sleep(250);
      }
      throw new Error(`no control matching ${re}`);
    };
    const shot = async (name) => { if (OUT) await page.screenshot({ path: resolve(OUT, name + '.png') }); };
    const loaded = () => page.waitForFunction(() => ['BookmarkStore', 'LinkStore', 'HistoryStore'].every((n) => window[n] && window[n]._state === 'loaded'), { timeout: 30000 });
    const read = () => page.evaluate(() => ({
      bookmarks: JSON.stringify(window.BookmarkStore.all()), links: JSON.stringify(window.LinkStore.all()), history: JSON.stringify(window.HistoryStore.list()),
    }));
    const reload = async () => { await sleep(1500); await page.reload({ waitUntil: 'domcontentloaded' }); await loaded(); await sleep(1200); };
    // The Library root, from anywhere: a reader screen has no tab bar, so step back (Home, then the back arrow) until
    // the Library tab can be pressed.
    const library = async () => {
      for (let i = 0; i < 8; i++) {
        if (await page.evaluate(() => !!document.querySelector('.library-root'))) return;
        await page.evaluate(() => {
          const b = [...document.querySelectorAll('.tabbar-tab')].find((x) => /^Library$/.test((x.textContent || '').trim()))
            || document.querySelector('button[title="Home"]')
            || [...document.querySelectorAll('button')].find((x) => /back/i.test(x.getAttribute('aria-label') || ''));
          if (b) b.click(); else history.back();
        });
        await sleep(900);
      }
      throw new Error('could not reach the Library root');
    };
    const toastUndo = async (id) => {
      await page.waitForSelector(`#${id} .vot-undo-btn`, { timeout: 5000 }).catch(() => {});
      return page.evaluate((i) => { const t = document.getElementById(i); return t ? t.textContent : null; }, id);
    };

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const r = document.getElementById('root'); return !!r && r.children.length > 0; });
    await clickText(/^Continue$/);
    await clickText(/Begin Reading/);
    await clickText(/^Maybe later$/).catch(() => {});
    await loaded();
    await page.evaluate((B, L, V) => {
      B.forEach((b) => window.BookmarkStore.add(b));
      L.forEach((l) => window.LinkStore.add(l));
      V.forEach(([e, at]) => window.HistoryStore.add(e, at));
    }, BOOKMARKS, LINKS, VISITS);
    await reload();
    const seeded = await read();
    note(`seeded: ${JSON.parse(seeded.bookmarks).length} bookmarks, ${JSON.parse(seeded.links).length} links, ${JSON.parse(seeded.history).length} visits`);

    const cases = [
      { name: 'bookmarks', field: 'bookmarks', toast: 'vot-toast-bookmark-removed', gone: (j) => !j.includes('bkm_e2e_2'),
        open: async () => { await library(); await clickText(/^Bookmarks/, '.ui-row-main, .ui-row, button'); await page.waitForSelector('button[aria-label="Bookmark options"]'); },
        del: async () => {
          await page.evaluate(() => { const row = [...document.querySelectorAll('.ui-row')].find((r) => /Undo walk two/.test(r.textContent)); const b = row && row.querySelector('button[aria-label="Bookmark options"]'); if (b) b.click(); });
          await sleep(700); await clickText(/^Delete bookmark$/); await clickText(/^Delete$/, '[role="dialog"] button');
        } },
      { name: 'links', field: 'links', toast: 'vot-toast-link-removed', gone: (j) => !j.includes('lnk_e2e_2'),
        open: async () => { await library(); await clickText(/^Links/, '.ui-row-main, .ui-row, button'); await page.waitForSelector('button[aria-label="Link options"]'); },
        del: async () => {
          await page.evaluate(() => { const card = [...document.querySelectorAll('.link-row')].find((c) => /Genesis 1:1/.test(c.textContent)); const b = card && card.querySelector('button[aria-label="Link options"]'); if (b) b.click(); });
          await sleep(700); await clickText(/^Delete link$/); await clickText(/^Delete$/, '[role="dialog"] button');
        } },
      { name: 'history', field: 'history', toast: 'vot-toast-history-removed', gone: (j) => !JSON.parse(j).some((e) => e.bookId === 'john'),
        open: async () => { await library(); await clickText(/^See all$/); await page.waitForSelector('button[aria-label$=" from history"]'); },
        del: async () => {
          // John 3 was visited twice; its row is one, and removing it takes both visits
          const hit = await page.evaluate(() => { const row = [...document.querySelectorAll('.history-entry-card')].find((r) => /John/.test(r.textContent)); const b = row && row.querySelector('button[aria-label$=" from history"]'); if (b) b.click(); return b ? b.getAttribute('aria-label') : null; });
          await sleep(700);
          const sheet = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getClientRects().length).map((d) => d.textContent.trim().slice(0, 120)));
          note(`history x: ${hit}; dialog: ${JSON.stringify(sheet)}`);
          await shot('history-1b-sheet');
          await clickText(/^Remove$/, '[role="dialog"] button');
        } },
    ];

    for (const c of cases) {
      await c.open();
      const before = (await read())[c.field];
      await shot(`${c.name}-1-before`);
      await c.del();
      await sleep(400);
      const mid = (await read())[c.field];
      const text = await toastUndo(c.toast);
      await shot(`${c.name}-2-toast`);
      if (!c.gone(mid)) fails.push(`U1 ${c.name}: the item is still stored after the delete`);
      if (!text || !/Undo$/.test(text)) fails.push(`U1 ${c.name}: no Undo toast (#${c.toast} reads ${JSON.stringify(text)})`);
      else note(`U1 ${c.name}: deleted; toast "${text.replace(/Undo$/, '')} · Undo"`);
      await page.evaluate((i) => { const b = document.querySelector(`#${i} .vot-undo-btn`); if (b) b.click(); }, c.toast);
      await sleep(700);
      const undone = (await read())[c.field];
      await shot(`${c.name}-3-after-undo`);
      if (undone !== before) fails.push(`U2 ${c.name}: after Undo the list differs: ${before.slice(0, 160)} -> ${undone.slice(0, 160)}`);
      else note(`U2 ${c.name}: after Undo the stored list is identical (${before.length} chars)`);
      await reload();
      const kept = (await read())[c.field];
      if (kept !== before) fails.push(`U3 ${c.name}: after a reload the list differs: ${before.slice(0, 160)} -> ${kept.slice(0, 160)}`);
      else note(`U3 ${c.name}: identical after a reload`);
      await c.open();
      await c.del();
      await sleep(6500);   // the Undo toast's 5 s go by
      await reload();
      if (!c.gone((await read())[c.field])) fails.push(`U4 ${c.name}: deleted with no Undo, it is back after a reload`);
      else note(`U4 ${c.name}: deleted with no Undo, still gone after a reload`);
    }
    if (errors.length) fails.push('page errors: ' + errors.slice(0, 3).join(' | '));
  } catch (e) {
    console.error('[e2e-undo-deletes] harness: ' + (e && e.stack || e)); process.exitCode = 3;
    // what was on screen when the walk lost its way: a picture and the visible controls
    try {
      const pg = (await browser.pages()).pop();
      if (OUT) await pg.screenshot({ path: resolve(OUT, 'harness-fail.png') });
      const seen = await pg.evaluate(() => [...document.querySelectorAll('button, [role="button"], a')]
        .filter((b) => b.getClientRects().length > 0 && !b.closest('[inert]'))
        .map((b) => ((b.getAttribute('aria-label') || '') + ' | ' + (b.textContent || '').trim()).slice(0, 60)).slice(0, 60));
      console.error('[e2e-undo-deletes] visible controls: ' + seen.join(' ; '));
    } catch { /* the page is gone */ }
  } finally {
    await browser.close();
    server.close();
  }
  if (process.exitCode === 3) process.exit(3);
  if (fails.length) { console.log('[e2e-undo-deletes] FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('[e2e-undo-deletes] PASS');
  process.exit(0);
}
if (OUT) mkdirSync(OUT, { recursive: true });
main();
