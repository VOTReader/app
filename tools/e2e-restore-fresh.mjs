/* e2e-restore-fresh — B2: does a backup made by Export restore EXACTLY on a device that has never
   run the app?

   backup.test.js already proves the data plane (export -> wipe -> import -> reload against the real
   stores on a fake IndexedDB). What nothing proved is the path a reader actually takes: Settings ->
   Your Data -> Export in a real browser, the file that lands on disk, then Import on a CLEAN
   profile, the confirm sheet, the completion toast and the reload. This walks that path in
   headless Chrome, twice fresh:

     A  a clean profile. Seeds a multi-store dataset through the app's OWN stores (a note, a
        bookmark, a highlight, a link, a reading position, a journal entry holding an IMAGE and a
        VOICE MEMO), then exports through the UI. The web export takes the Blob-download path
        (window.showSaveFilePicker is removed first, as on every browser without the File System
        Access API), and the file is caught on disk.
     B  another clean profile. Imports that file through the UI (the DOM file-input path), accepts
        the confirm sheet, waits for "Import complete. Reloading..." and the reload, then compares:
        records per store, the sha256 of both media blobs, the journal entry's links to them, and
        one navigable reference (the bookmark opens its chapter).
     C  the negative control, a third clean profile: the same file cut short by 1 KB. The app must
        refuse it or say the restore was partial. "Import complete." on a cut file is a FALSE DONE.

   Exit 0 = B restored exactly and C did not claim success; 1 = a FAIL line names what differed;
   2 = not drivable (a precondition). --keep keeps the downloaded backup; --shots <dir> writes
   screenshots. A CI gate since 2026-09-25 (n7-06, ci.yml): npm run e2e:restore-fresh. */

import http from 'node:http';
import { createHash } from 'node:crypto';
import { resolve, dirname, normalize, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, statSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer';

const argv = process.argv.slice(2);
const shotsDir = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const keep = argv.includes('--keep');

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const filePath = normalize(resolve(ASSETS, '.' + urlPath));
    if (!filePath.startsWith(ASSETS) || !existsSync(filePath) || !statSync(filePath).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(filePath));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));   // an OS port, never a fixed one
}

const server = await startServer();
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
const WORK = mkdtempSync(join(tmpdir(), 'vot-b2-'));
const failures = [];
const fail = (m) => { failures.push(m); console.log('FAIL ' + m); };
const note = (m) => console.log('  ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
let exitCode = 0;
class Precondition extends Error {}
const need = (ok, what) => { if (!ok) throw new Precondition(what); };

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
console.log(`browser ${await browser.version()}  work ${WORK}`);

/** A clean profile (its own storage, service worker and downloads), booted past the welcome. */
async function freshProfile(tag, { downloads } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${tag}: ${e && e.message ? e.message : String(e)}`));
  // No File System Access API: the export takes the Blob download and the import the DOM file
  // input - the path every browser without it (all of WebKit) takes by default.
  await page.evaluateOnNewDocument(() => {
    try { window.showSaveFilePicker = undefined; } catch (_e) { /* read-only: the offer escape still reaches the Blob sink */ }
    try { window.showOpenFilePicker = undefined; } catch (_e) { /* ditto: the DOM input */ }
  });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (/github\.com\/VOTReader\/votreader-assets|\.mp3(\?|$)/.test(r.url())) r.respond({ status: 404, body: '' });
    else r.continue();
  });
  if (downloads) {
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, browserContextId: ctx.id, eventsEnabled: true });
  }
  await page.goto(BASE, { waitUntil: 'load' });
  await booted(page);
  await clickIf(page, 'Continue'); await clickIf(page, 'Begin Reading');
  await hydrated(page);
  await clickIf(page, 'Maybe later');   // the tour offer over Home on a first visit
  return { ctx, page, errors };
}

const booted = (page) => page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
/** Every IDB-backed store loaded (HydrationGate's own condition) and the stores reachable. */
const hydrated = (page) => page.waitForFunction(() => typeof window.hasAnyPendingStores === 'function' && !window.hasAnyPendingStores()
  && typeof window.JournalMediaStore !== 'undefined', { timeout: 30000 });

/** Click the first button whose aria-label or text starts with `label`; false when there is none. */
async function clickIf(page, label) {
  const hit = await page.evaluate((label) => {
    const b = [...document.querySelectorAll('button,[role=button]')]
      .find((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').startsWith(label));
    if (b) /** @type {HTMLElement} */ (b).click();
    return !!b;
  }, label);
  if (hit) await sleep(450);
  return hit;
}
async function click(page, label) { need(await clickIf(page, label), `no control labelled ${JSON.stringify(label)}`); }

/** Settings -> Your Data, open. */
async function openYourData(page) {
  // The compact top bar (54b14b14) keeps Settings inside its "More" menu:
  // open it first when no gear or Settings control is on screen.
  await page.evaluate(() => {
    const direct = document.querySelector('[aria-label="Settings"]')
      || [...document.querySelectorAll('button,[role=button]')].find((b) => /Settings/.test(b.textContent || ''));
    const more = document.querySelector('button[aria-label="More"]');
    if (!direct && more) /** @type {HTMLElement} */ (more).click();
  });
  await sleep(300);
  const via = await page.evaluate(() => {
    const gear = document.querySelector('[aria-label="Settings"]');
    const tile = gear || [...document.querySelectorAll('button,[role=button]')].find((b) => /Settings/.test(b.textContent || ''));
    if (!tile) return null;
    /** @type {HTMLElement} */ (tile).click();
    return gear ? 'gear' : 'tile';
  });
  need(via, 'no way into Settings from this screen');
  const found = await page.waitForSelector('section[data-settings-group="data"] .settings-group-head', { timeout: 10000 }).then(() => true, () => false);
  if (!found && shotsDir) await page.screenshot({ path: join(shotsDir, 'b2-no-your-data.png') });
  need(found, `Settings opened (via ${via}) but it has no "Your Data" group`);
  const open = await page.$eval('section[data-settings-group="data"] .settings-group-head', (b) => b.getAttribute('aria-expanded') === 'true');
  if (!open) await page.click('section[data-settings-group="data"] .settings-group-head');
  await page.waitForSelector('section[data-settings-group="data"] .settings-group-body', { timeout: 5000 });
}

/** Home -> Bookmarks -> the seeded bookmark. Returns the text the reading view then shows ('' when
 *  the row was missing). A reader's route, so the app records the reading position itself. */
async function openSeededBookmark(page) {
  await page.evaluate(() => { const h = document.querySelector('[aria-label="Home"]'); if (h) /** @type {HTMLElement} */ (h).click(); });
  await sleep(700);
  need(await clickIf(page, 'Bookmarks'), 'no Bookmarks shortcut on Home');
  const listed = await page.waitForFunction(() => [...document.querySelectorAll('.bkm-row')].some((r) => /B2 bookmark/.test(r.textContent || '')), { timeout: 8000 }).then(() => true, () => false);
  if (!listed) return '';
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.bkm-row')].find((r) => /B2 bookmark/.test(r.textContent || ''));
    const go = row && row.querySelector('.bkm-row-content');
    if (go) /** @type {HTMLElement} */ (go).click();
  });
  await page.waitForFunction(() => /In the beginning/i.test((document.querySelector('.screen-layout') || document.body).textContent || ''), { timeout: 10000 }).catch(() => null);
  await sleep(1200);   // the reading position commits on landing; let the persist debounce write it
  return page.evaluate(() => (document.querySelector('.screen-layout') || document.body).textContent.replace(/\s+/g, ' ').slice(0, 600));
}

/** The newest toast text, or ''. */
const toastText = (page) => page.evaluate(() => {
  const t = [...document.querySelectorAll('.vot-toast')].pop();
  return t ? t.textContent.trim().replace(/\s+/g, ' ') : '';
});
async function waitToast(page, re, ms) {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < ms) {
    last = await toastText(page).catch(() => last);
    if (re.test(last)) return last;
    await sleep(100);
  }
  return null;
}

/** What this profile holds, read through the app's own stores. */
function snapshot(page) {
  return page.evaluate(async () => {
    const W = /** @type {any} */ (window);
    const hex = async (blob) => {
      const d = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
      return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
    };
    const journal = W.JournalStore.all().filter((e) => e.title === 'B2 restore proof');
    const media = {};
    for (const id of await W.JournalMediaStore.allIds()) {
      const rec = await W.JournalMediaStore.get(id);
      media[id] = rec && rec.blob ? { type: rec.type, mime: rec.mime, size: rec.blob.size, sha256: await hex(rec.blob) } : null;
    }
    const state = W.StateStore.get ? W.StateStore.get() : null;
    return {
      notes: Object.keys(W.NoteStore.all()).length,
      bookmarks: W.BookmarkStore.all().map((b) => ({ id: b.id, hlKey: b.hlKey, label: b.label })),
      annotations: Object.fromEntries(Object.entries(W.AnnotationStore.all()).map(([k, v]) => [k, v.length])),
      links: W.LinkStore.all().length,
      journal: journal.map((e) => ({ id: e.id, blocks: e.blocks.map((b) => b.type + (b.mediaId ? ':' + b.mediaId : '')) })),
      lastReadChapters: state && state.lastReadChapters ? state.lastReadChapters : null,
      media,
    };
  });
}

let backupPath = null;
try {
  // ── A: a clean profile, a synthetic multi-store dataset, Export through the UI ──
  const dl = join(WORK, 'downloads');
  mkdirSync(dl, { recursive: true });
  const A = await freshProfile('A', { downloads: dl });
  const seeded = await A.page.evaluate(async () => {
    const W = /** @type {any} */ (window);
    // A 64x64 PNG from a canvas and a quarter-second 440 Hz WAV: real media, generated here.
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const c2 = canvas.getContext('2d');
    c2.fillStyle = '#c9a227'; c2.fillRect(0, 0, 64, 64);
    c2.fillStyle = '#101010'; c2.fillRect(8, 8, 24, 24);
    const png = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const sr = 8000; const n = 2000;
    const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 440 * i / sr) * 12000), true);
    const wav = new Blob([buf], { type: 'audio/wav' });

    const imageId = await W.JournalMediaStore.put({ type: 'image', blob: png, width: 64, height: 64 });
    const audioId = await W.JournalMediaStore.put({ type: 'audio', blob: wav, duration: 0.25 });
    W.JournalStore.add({
      title: 'B2 restore proof',
      blocks: [
        { id: 'b2-p', type: 'p', text: 'A journal entry that has to survive a fresh-device restore.' },
        { id: 'b2-img', type: 'image', mediaId: imageId, caption: 'generated 64x64' },
        { id: 'b2-aud', type: 'audio', mediaId: audioId, duration: 0.25 },
      ],
    });
    const now = Date.now();
    W.AnnotationStore.add('bible:genesis:1:1', { id: 'b2-hl', groupId: 'b2-hl', kind: 'highlight', color: 'yellow', start: 0, end: 12, text: 'In the begin', created: now, updated: now });
    W.AnnotationStore.add('bible:genesis:1:3', { id: 'b2-note', groupId: 'b2-note', kind: 'note', color: 'yellow', start: 0, end: 8, text: 'Then God', created: now, updated: now });
    W.NoteStore.set('b2-note', { body: 'Light first.', keys: ['bible:genesis:1:3'] });
    W.BookmarkStore.add({ id: 'b2-bkm', hlKey: 'bible:genesis:1:1', label: 'B2 bookmark', thought: 'restore me', created: now, updated: now });
    W.LinkStore.add({ id: 'b2-lnk', source: { key: 'bible:genesis:1:1', start: 0, end: 12, text: 'In the begin' }, target: { key: 'bible:john:1:1', start: 0, end: 12, text: 'In the begin' }, created: now });
    const stores = ['JournalStore', 'AnnotationStore', 'NoteStore', 'BookmarkStore', 'LinkStore', 'StateStore'];
    await Promise.all(stores.map((s) => W[s] && W[s].whenSaved ? W[s].whenSaved() : null));
    return { imageId, audioId };
  });
  // A reading position: open the bookmark's chapter the way a reader would, so vot-state records it.
  const inA = await openSeededBookmark(A.page);
  need(/Genesis/i.test(inA) && /In the beginning/i.test(inA), `A: the seeded bookmark did not open Genesis 1: ${inA.slice(0, 160)}`);
  const before = await snapshot(A.page);
  need(before.lastReadChapters && Object.keys(before.lastReadChapters).length > 0, `A: opening Genesis 1 recorded no reading position: ${JSON.stringify(before.lastReadChapters)}`);
  need(before.journal.length === 1 && Object.keys(before.media).length === 2, `seed did not land: ${JSON.stringify(before)}`);
  note(`A seeded: journal 1 (image ${seeded.imageId}, audio ${seeded.audioId}), bookmarks ${before.bookmarks.length}, notes ${before.notes}, links ${before.links}, annotation keys ${Object.keys(before.annotations).length}`);
  note(`A reading position (recorded by opening the bookmark): ${JSON.stringify(before.lastReadChapters)}`);

  await openYourData(A.page);
  await click(A.page, 'Export');
  const exported = await waitToast(A.page, /saved|exported|backup/i, 30000);
  note(`A export toast: ${JSON.stringify(exported)}`);
  // The Blob download lands in `dl`; wait for a complete file (no .crdownload).
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const done = readdirSync(dl).filter((f) => !f.endsWith('.crdownload'));
    if (done.length) { backupPath = join(dl, done[0]); break; }
    await sleep(200);
  }
  need(backupPath, 'no backup file was downloaded');
  const bytes = readFileSync(backupPath);
  note(`backup ${backupPath.split(/[\\/]/).pop()} ${bytes.length} B sha256 ${sha256(bytes).slice(0, 16)}...`);
  if (shotsDir) await A.page.screenshot({ path: join(shotsDir, 'b2-A-exported.png') });
  await A.ctx.close();

  // ── B: another clean profile, Import through the UI, compare ──
  const B = await freshProfile('B');
  await openYourData(B.page);
  const [chooser] = await Promise.all([B.page.waitForFileChooser({ timeout: 10000 }), click(B.page, 'Import')]);
  await chooser.accept([backupPath]);
  await B.page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Import & Overwrite'), { timeout: 15000 });
  if (shotsDir) await B.page.screenshot({ path: join(shotsDir, 'b2-B-confirm.png') });
  const reloaded = B.page.waitForNavigation({ waitUntil: 'load', timeout: 30000 });
  await click(B.page, 'Import & Overwrite');
  const doneToast = await waitToast(B.page, /Import complete|Import completed|Import incomplete|failed/i, 30000);
  note(`B import toast: ${JSON.stringify(doneToast)}`);
  if (!/^Import complete\. Reloading/.test(doneToast || '')) fail(`B: the import did not report a clean restore: ${JSON.stringify(doneToast)}`);
  await reloaded;
  await booted(B.page);
  await hydrated(B.page);
  await clickIf(B.page, 'Maybe later');
  const after = await snapshot(B.page);

  const same = (what, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`B ${what} differs: exported ${JSON.stringify(a)} restored ${JSON.stringify(b)}`); else note(`B ${what}: equal`); };
  same('bookmarks', before.bookmarks, after.bookmarks);
  same('notes', before.notes, after.notes);
  same('annotations per key', before.annotations, after.annotations);
  same('links', before.links, after.links);
  same('journal entry + its media links', before.journal, after.journal);
  same('media (type, mime, size, sha256)', before.media, after.media);
  same('reading positions', before.lastReadChapters, after.lastReadChapters);

  // One navigable reference: the restored bookmark opens its chapter, by the reader's route.
  const inB = await openSeededBookmark(B.page);
  if (!inB) fail('B: the restored bookmark is not listed on the Bookmarks screen');
  else if (!/Genesis/i.test(inB) || !/In the beginning/i.test(inB)) fail(`B: the restored bookmark did not open Genesis 1: ${inB.slice(0, 160)}`);
  else note('B bookmark: listed, and opens Genesis 1');
  if (shotsDir) await B.page.screenshot({ path: join(shotsDir, 'b2-B-restored.png') });
  if (B.errors.length) note(`B page errors: ${B.errors.join(' | ')}`);
  await B.ctx.close();

  // ── C: the negative control, the same file cut short by 1 KB ──
  const cut = join(WORK, 'cut.votbak');
  writeFileSync(cut, bytes.subarray(0, Math.max(0, bytes.length - 1024)));
  const C = await freshProfile('C');
  await openYourData(C.page);
  const [chooserC] = await Promise.all([C.page.waitForFileChooser({ timeout: 10000 }), click(C.page, 'Import')]);
  await chooserC.accept([cut]);
  const confirmShown = await C.page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Import & Overwrite'), { timeout: 8000 }).then(() => true, () => false);
  let cToast;
  if (confirmShown) {
    await click(C.page, 'Import & Overwrite');
    cToast = await waitToast(C.page, /Import complete|Import completed|incomplete|failed|could not|corrupt|cut short|not a/i, 20000);
  } else {
    cToast = await toastText(C.page);
  }
  note(`C (cut by 1 KB): confirm ${confirmShown ? 'shown' : 'refused before it'}; toast ${JSON.stringify(cToast)}`);
  if (/^Import complete\. Reloading/.test(cToast || '')) fail('C: a backup cut short by 1 KB reported "Import complete." - a FALSE DONE');
  if (shotsDir) await C.page.screenshot({ path: join(shotsDir, 'b2-C-cut.png') });
  await C.ctx.close();
} catch (e) {
  if (e instanceof Precondition) { console.log('NOT DRIVABLE: ' + e.message); exitCode = 2; }
  else { console.log('ERROR ' + (e && e.stack ? e.stack : e)); exitCode = 2; }
} finally {
  await browser.close();
  server.close();
  // Only ever the mkdtemp directory this run made under the OS temp dir.
  if (!keep && WORK.startsWith(tmpdir()) && /vot-b2-[^\\/]+$/.test(WORK)) {
    try { rmSync(WORK, { recursive: true, force: true }); } catch (_e) { /* a temp dir; the OS cleans it */ }
  }
  else console.log(`kept ${WORK}`);
}
if (exitCode === 0 && failures.length) exitCode = 1;
console.log(exitCode === 0 ? 'PASS restore-fresh: B restored exactly; C did not claim success' : `exit ${exitCode} (${failures.length} FAIL)`);
process.exit(exitCode);
