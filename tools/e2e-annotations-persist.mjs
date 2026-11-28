/**
 * tools/e2e-annotations-persist.mjs - a reader's highlight and note survive a reload, same words, same range,
 * same stored records (vot-ui 11-15, hub + web-claude 09:45: before the Reading-chrome family touches the
 * selection bar, the note sheet or the letter body).
 *
 * Walk (fresh profile, 412x915): onboarding -> Volume One -> "A Word of Warning"; select the first 20 characters
 * of the first passage; the selection bar rises; a colour makes the highlight; Note opens the note sheet; type a
 * note; Save. Then read: the highlight's group id (data-group-id on its marks), the marked words, and every
 * IndexedDB record whose JSON names that group id or the note text. Reload. Read again.
 *
 *   P1  the highlight was made: marks carry a group id over the selected words
 *   P2  the note was saved: a stored record holds the note text
 *   P3  after reload the same group id marks the same words (text and the passage key it sits in)
 *   P4  after reload the matching records are byte-identical (JSON), and the database/store/key SHAPES are the same
 *
 * --out DIR writes persist.json (the shapes and the records) so two builds' runs can be diffed: the shapes must match
 * across builds (a change in where or how notes are stored shows there). Exit 0 PASS, 1 FAIL, 3 harness error.
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serveOwnTree } from './e2e-read-serve.mjs';
import { installFailureReport } from './e2e-walk-lib.mjs';

installFailureReport('e2e-annotations-persist');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', '');
const NOTE = 'persist check note ' + 'qz7';   // a phrase no letter contains
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const note = (m) => console.log('  ' + m);

// In the page: every IndexedDB database, its stores, and their keys' SHAPES (ids and numbers folded), plus the
// records (JSON) that mention any of `needles`. Large stores are listed by count only.
async function readStore(needles) {
  // a cache chunk's id rotates per load (votreader/meta 'songs-catalog#chunk:mwizk#hrbna:#'): its shape is the prefix
  const shape = (k) => String(k).replace(/#chunk:.*$/, '#chunk:*').replace(/[0-9a-f]{8,}/gi, '#h').replace(/\d+/g, '#');
  const out = { shapes: {}, hits: {} };
  const dbs = indexedDB.databases ? await indexedDB.databases() : [];
  // vot-thumbs is the open-tabs page-picture cache: it is rewritten on every visit (a reload makes a new key), so it is
  // neither a place notes live nor a stable shape (first run on 7caf0796c, 11-15).
  for (const d of dbs.filter((x) => x.name !== 'vot-thumbs').sort((a, b) => (a.name > b.name ? 1 : -1))) {
    const db = await new Promise((ok, no) => { const r = indexedDB.open(d.name); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
    for (const s of [...db.objectStoreNames].sort()) {
      const tx = db.transaction(s, 'readonly'); const st = tx.objectStore(s);
      const n = await new Promise((ok) => { const r = st.count(); r.onsuccess = () => ok(r.result); r.onerror = () => ok(-1); });
      const id = d.name + '/' + s;
      if (n > 400) { out.shapes[id] = 'count>400'; continue; }
      const keys = await new Promise((ok) => { const r = st.getAllKeys(); r.onsuccess = () => ok(r.result); r.onerror = () => ok([]); });
      out.shapes[id] = [...new Set(keys.map(shape))].sort();
      const vals = await new Promise((ok) => { const r = st.getAll(); r.onsuccess = () => ok(r.result); r.onerror = () => ok([]); });
      vals.forEach((v, i) => {
        let j; try { j = JSON.stringify(v); } catch (_e) { return; }
        if (j && needles.some((x) => x && j.includes(x))) out.hits[id + '#' + String(keys[i])] = j;
      });
    }
    db.close();
  }
  return out;
}

async function main() {
  const { server, url } = await serveOwnTree();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  let result = {};
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    await page.setViewport({ width: 412, height: 915 });
    const clickText = async (re, sel = 'button, [role="button"], a') => {
      for (let i = 0; i < 60; i++) {
        const ok = await page.evaluate((src, s) => {
          const rx = new RegExp(src, 'i');
          const el = [...document.querySelectorAll(s)].find((b) => b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden'
            && !b.closest('[inert]') && (rx.test((b.textContent || '').trim()) || rx.test((b.getAttribute('aria-label') || '').trim())));
          if (!el) return false;
          el.click(); return true;
        }, re.source, sel);
        if (ok) { await sleep(600); return; }
        await sleep(250);
      }
      throw new Error(`no control matching ${re}`);
    };
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const r = document.getElementById('root'); return !!r && r.children.length > 0; });
    // newcomer (2026-11-27): the welcome is one page; Begin Reading is on it.
    await clickText(/Begin Reading/);
    // to the letter by the Read tab (the onboarding's first letter may change; this one is fixed)
    await page.evaluate(() => { const b = [...document.querySelectorAll('.tabbar-tab, button[title="Home"]')].find((x) => /^(Read|)$/.test((x.textContent || '').trim()) || x.title === 'Home'); if (b) b.click(); });
    await sleep(800);
    await clickText(/^Maybe later$/).catch(() => {});
    await clickText(/Prophetic Letters/);
    await clickText(/^Volume One/);
    await clickText(/A Word of Warning/);
    await page.waitForSelector('[data-hl-key]');
    await sleep(800);

    // select the first 20 characters of the first passage; the bar rises; the first colour makes the highlight
    const sel = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[data-hl-key]')].find((x) => !x.closest('[inert]') && (x.textContent || '').trim().length > 30);
      if (!el) return null;
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let t = w.nextNode(); while (t && t.nodeValue.trim().length < 20) t = w.nextNode();
      if (!t) return null;
      el.scrollIntoView({ block: 'center' });
      const r = document.createRange(); const a = t.nodeValue.search(/\S/);
      r.setStart(t, a); r.setEnd(t, a + 20);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return { key: el.getAttribute('data-hl-key'), text: r.toString() };
    });
    if (!sel) throw new Error('no passage text to select');
    note(`selected "${sel.text}" in ${sel.key}`);
    await page.waitForSelector('.sel-toolbar .sel-color-btn', { timeout: 8000 });
    await page.evaluate(() => { const b = document.querySelector('.sel-toolbar .sel-color-btn'); b && b.click(); });
    await sleep(900);
    const made = await page.evaluate((key) => {
      const host = [...document.querySelectorAll('[data-hl-key]')].find((x) => x.getAttribute('data-hl-key') === key && !x.closest('[inert]'));
      const marks = host ? [...host.querySelectorAll('[data-group-id]')] : [];
      const gid = marks.length ? marks[0].getAttribute('data-group-id') : null;
      return { gid, text: marks.filter((m) => m.getAttribute('data-group-id') === gid).map((m) => m.textContent).join('') };
    }, sel.key);
    if (!made.gid) { fails.push('P1 no mark with a data-group-id over the selection after the colour tap'); throw new Error('stop'); }
    // A highlight snaps to whole words: "To everyone who hear" marks "To everyone who hears". Only word characters
    // past the selection's ends may be added; anything else (a skipped word, a shifted range) still fails.
    const mt = made.text.replace(/\s+/g, ' ').trim(), st = sel.text.replace(/\s+/g, ' ').trim();
    const at = mt.indexOf(st);
    const snapped = at >= 0 && /^\w*$/.test(mt.slice(0, at)) && /^\w*$/.test(mt.slice(at + st.length));
    if (!snapped) fails.push(`P1 the marks read "${made.text}", the selection was "${sel.text}"`);
    note(`P1 highlight ${made.gid} over "${made.text}"`);

    // the note: re-select the marked words, Note, type, Save
    await page.evaluate((gid) => {
      const m = [...document.querySelectorAll('[data-group-id]')].filter((x) => x.getAttribute('data-group-id') === gid && !x.closest('[inert]'));
      const r = document.createRange(); r.setStartBefore(m[0]); r.setEndAfter(m[m.length - 1]);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    }, made.gid);
    await page.waitForSelector('.sel-toolbar', { timeout: 8000 });
    await sleep(400);
    await clickText(/^Note$/, '.sel-toolbar button');
    await page.waitForSelector('textarea', { timeout: 8000 });
    await page.type('textarea', NOTE);
    await clickText(/^Save$/, '.note-sheet-save, button');
    await sleep(1500);   // the store's write lands (debounced saves)

    const before = await page.evaluate(readStore, [made.gid, NOTE]);
    if (!Object.values(before.hits).some((j) => j.includes(NOTE))) fails.push('P2 no stored record holds the note text after Save');
    else note(`P2 note stored (${Object.keys(before.hits).length} record(s) name the group or the note)`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-hl-key]', { timeout: 30000 });
    await sleep(2500);
    const after = await page.evaluate((key, gid) => {
      const marks = [...document.querySelectorAll('[data-group-id]')].filter((x) => x.getAttribute('data-group-id') === gid && !x.closest('[inert]'));
      const host = marks.length ? marks[0].closest('[data-hl-key]') : null;
      return { n: marks.length, text: marks.map((m) => m.textContent).join(''), key: host ? host.getAttribute('data-hl-key') : null };
    }, sel.key, made.gid);
    if (!after.n) fails.push(`P3 after reload no mark carries group ${made.gid} (is the letter open? key ${sel.key})`);
    else {
      if (after.text !== made.text) fails.push(`P3 after reload the marks read "${after.text}", before "${made.text}"`);
      if (after.key !== sel.key) fails.push(`P3 after reload the marks sit in ${after.key}, before ${sel.key}`);
      note(`P3 after reload ${after.n} mark(s) of ${made.gid} over "${after.text}" in ${after.key}`);
    }
    const again = await page.evaluate(readStore, [made.gid, NOTE]);
    for (const k of Object.keys(before.hits)) {
      if (!(k in again.hits)) fails.push(`P4 after reload the record ${k} is gone`);
      else if (again.hits[k] !== before.hits[k]) fails.push(`P4 after reload the record ${k} changed: ${before.hits[k].slice(0, 120)} -> ${again.hits[k].slice(0, 120)}`);
    }
    for (const k of Object.keys(again.hits)) if (!(k in before.hits)) fails.push(`P4 after reload a new record names the note or group: ${k}`);
    if (JSON.stringify(again.shapes) !== JSON.stringify(before.shapes)) {
      const ids = [...new Set([...Object.keys(before.shapes), ...Object.keys(again.shapes)])]
        .filter((id) => JSON.stringify(before.shapes[id]) !== JSON.stringify(again.shapes[id]))
        .map((id) => id + ' ' + JSON.stringify(before.shapes[id] ?? null).slice(0, 80) + ' -> ' + JSON.stringify(again.shapes[id] ?? null).slice(0, 80));
      fails.push('P4 the database/store/key shapes changed across the reload: ' + ids.join(' ; '));
    }
    note(`P4 ${Object.keys(before.hits).length} record(s) identical across the reload; ${Object.keys(before.shapes).length} stores' key shapes compared`);
    result = { selection: sel, group: made, shapes: before.shapes, records: before.hits };
  } catch (e) {
    if (!(e && e.message === 'stop')) { console.error('[e2e-annotations-persist] harness: ' + (e && e.stack || e)); process.exitCode = 3; }
  } finally {
    await browser.close();
    server.close();
  }
  if (OUT) { mkdirSync(OUT, { recursive: true }); writeFileSync(resolve(OUT, 'persist.json'), JSON.stringify({ fails, ...result }, null, 1)); }
  if (process.exitCode === 3) process.exit(3);
  if (fails.length) { console.log('[e2e-annotations-persist] FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('[e2e-annotations-persist] PASS');
  process.exit(0);
}
main();
