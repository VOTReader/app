/**
 * e2e-readalong — does the wash land on the right words, in a real browser,
 * against real audio?
 *
 *   node tools/e2e-readalong.mjs                      # one letter per volume
 *   node tools/e2e-readalong.mjs --keys five:mindful,one:christmas
 *   node tools/e2e-readalong.mjs --all                # every locally cached key
 *   node tools/e2e-readalong.mjs --bible john:1       # a Bible chapter
 *   node tools/e2e-readalong.mjs --pixel-proof        # also prove it RENDERS
 *
 * THE HEADLINE ASSERTION is not the one you would guess. `rangeIn` walks the
 * same textContent the offsets index, so "the painted text equals
 * slice(cs,ce)" is true by construction and proves nothing. What matters, and
 * what nothing in this repo checked before, is:
 *
 *     blockEl.textContent === segmentsDomText(block.segments)
 *
 * The offline domain versus the browser's. Those two silently disagreed for
 * months — Segments injects a collision-guard space between adjacent segments
 * and the extractor joined them with '' — and every gate passed the whole
 * time, because none of them ever compared the two.
 *
 * HERMETIC. Audio streams from a GitHub release in production, and the CSP
 * media-src allowlist means a localhost URL is rejected outright. So the URL is
 * left exactly as it is and the BYTES are served locally through request
 * interception: CSP is evaluated on the URL, and isVotAudioUrl() likewise.
 * Range requests are honoured — Chrome asks for `bytes=0-` on media and a
 * plain 200 makes seeking stall.
 *
 * SAMPLING. Playing a 20-minute letter to check 60 clauses is absurd, and
 * unnecessary: AudioPlayer.seek() notifies, and the component's safety-net
 * repaint runs even while paused (its rows are gated on `loaded`, not
 * `active`). So the default mode seeks to each row in turn and reads what
 * painted — a whole letter in a couple of seconds. `--live` additionally plays
 * a window in real time to prove the rAF clock agrees with the store's.
 */
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, normalize, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import puppeteer from 'puppeteer';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const ASSETS = resolve(ROOT, 'app', 'src', 'main', 'assets');
const DATA = resolve(ASSETS, 'src', 'data');
const AUDIO_DIRS = [resolve(HERE, '_align-work', 'audio'), resolve(HERE, '_align-proof')];
const OUT = resolve(HERE, '_align-work', 'e2e');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes('--' + name);
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const LEAD_S = 0.15;               // mirrors ReadAlongHighlight's one constant

/* ───────────────────────────────────────────────────────── local audio ── */
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
};

/**
 * The locally cached recording for a release asset, in whatever form the
 * alignment pipeline left it. It converts each download to a 16 kHz mono WAV
 * and does not always keep the MP3 — and that is fine here: the conversion is
 * sample-for-sample in time, so every onset is identical, and an <audio>
 * element decodes by CONTENT TYPE, not by the extension in the URL. The URL
 * has to stay untouched anyway, because that is what CSP media-src and
 * isVotAudioUrl() both judge.
 */
/**
 * Bible chapter recordings live outside the letters' cache, under D:\BibleAudio
 * in per-edition trees with their own naming. That mapping is NOT re-derived
 * here — batch-align-bible.py publishes it (--write-audio-index) from the same
 * mirror-script collect() that decides which local file is "brm2_john_001".
 */
const BIBLE_INDEX = (() => {
  const out = {};
  const dir = resolve(HERE, '_align-work', 'bible');
  if (!existsSync(dir)) return out;
  for (const ed of ['brm-kjv', 'wop-nkjv', 'web-ebible']) {
    const p = join(dir, ed, 'audio-index.json');
    if (existsSync(p)) Object.assign(out, JSON.parse(readFileSync(p, 'utf8')));
  }
  return out;
})();

const MIME_BY_EXT = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.opus': 'audio/ogg' };

function localAudio(assetId) {
  for (const dir of AUDIO_DIRS) {
    for (const [ext, mime] of Object.entries(MIME_BY_EXT)) {
      const p = join(dir, assetId + ext);
      if (existsSync(p)) return { path: p, mime };
    }
  }
  const bible = BIBLE_INDEX[assetId];
  if (bible && existsSync(bible)) return { path: bible, mime: MIME_BY_EXT[extname(bible).toLowerCase()] || 'audio/mpeg' };
  return null;
}

function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const filePath = normalize(resolve(ASSETS, '.' + urlPath));
    if (!filePath.startsWith(ASSETS) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(readFileSync(filePath));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

/** Serve the release bytes from disk without changing the URL the page asked for. */
function interceptAudio(page, misses) {
  return page.setRequestInterception(true).then(() => {
    page.on('request', (req) => {
      const m = /\/releases\/download\/[a-z0-9-]+\/([A-Za-z0-9_-]+)\.mp3$/.exec(req.url());
      if (!m) { req.continue().catch(() => {}); return; }
      const file = localAudio(m[1]);
      if (!file) {
        misses.add(m[1]);
        // Hermetic by default: an uncached asset FAILS rather than quietly
        // reaching the internet, so a green run means what it says.
        // --allow-network lets the real release serve it, for checking a key
        // whose recording is not in the align cache.
        if (flag('allow-network')) req.continue().catch(() => {});
        else req.respond({ status: 404, body: 'not cached' }).catch(() => {});
        return;
      }
      const body = readFileSync(file.path);
      const range = req.headers().range;
      // Chrome sends `Range: bytes=0-` for media. A plain 200 leaves the
      // element unable to seek, and every seek then silently collapses.
      if (range) {
        const rm = /bytes=(\d+)-(\d*)/.exec(range);
        const start = rm ? Number(rm[1]) : 0;
        const end = rm && rm[2] ? Number(rm[2]) : body.length - 1;
        req.respond({
          status: 206,
          headers: {
            'Content-Type': file.mime,
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${start}-${end}/${body.length}`,
          },
          body: body.subarray(start, end + 1),
        }).catch(() => {});
        return;
      }
      req.respond({
        status: 200,
        headers: { 'Content-Type': file.mime, 'Accept-Ranges': 'bytes' },
        body,
      }).catch(() => {});
    });
  });
}

/* ─────────────────────────────────────────────────────── work selection ── */
function readData() {
  const ctx = {};
  for (const f of ['audio-sync.js', 'audio-manifest.js']) {
    runInNewContext(readFileSync(resolve(DATA, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

function pickKeys(ctx) {
  const sync = ctx.AUDIO_SYNC || {};
  const manifest = ctx.AUDIO_MANIFEST || {};
  const cached = (key) => (manifest[key] || []).length
    && (manifest[key] || []).every((p) => localAudio(p[0]));
  const explicit = opt('keys', '');
  if (explicit) return explicit.split(',').map((k) => k.trim()).filter(Boolean);
  const all = Object.keys(sync).filter(cached);
  if (flag('all')) return all;
  // One representative per volume, so a default run crosses every alignment
  // generation rather than sampling one volume deeply.
  const seen = new Set();
  return all.filter((k) => {
    const v = k.split(':')[0];
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  });
}

/* ───────────────────────────────────────────────────────── page driving ── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Read what is painted right now, with the block it lives in. */
const READ_PAINT = `(() => {
  const H = CSS.highlights && CSS.highlights.get('vot-reading');
  if (!H) return { size: 0 };
  const ranges = [...H];
  const r = ranges[0];
  if (!r) return { size: H.size || ranges.length };
  const host = r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer;
  const block = host && host.closest ? host.closest('[data-hl-key]') : null;
  return {
    size: H.size != null ? H.size : ranges.length,
    key: block ? block.getAttribute('data-hl-key') : null,
    text: r.toString(),
    names: [...CSS.highlights.keys()],
  };
})()`;

/**
 * Start the letter's audio, then jump the reader to the text that is playing.
 * `__openAudioText` is the app's OWN bridge for exactly this (the listening
 * desk's title button), so the harness reaches the reading screen the way a
 * listener does instead of inventing a navigation path that could drift.
 */
async function openLetter(page, volKey, letterId) {
  // Deliberately several small evaluates rather than one async block. Loading
  // the lazy corpus and opening the reader both tear down and rebuild the
  // execution context, and an awaited promise that spans that boundary comes
  // back as "Promise was collected" rather than a result.
  await page.evaluate(() => { window.__loadVotCorpus(); });
  await page.waitForFunction('window.__votCorpus && window.__votCorpus.loaded', { timeout: 30000 });
  const found = await page.evaluate((id) => {
    const corpora = ['LETTERS_V1_PREFACE', 'LETTERS_V1', 'LETTERS', 'LETTERS_V3_PREFACE', 'LETTERS_V3',
      'LETTERS_V4_PREFACE', 'LETTERS_V4', 'LETTERS_V5_PREFACE', 'LETTERS_V5', 'LETTERS_V6_PREFACE',
      'LETTERS_V6', 'LETTERS_V7_PREFACE', 'LETTERS_V7', 'LETTERS_TIMOTHY_PREFACE', 'LETTERS_TIMOTHY',
      'LETTERS_FLOCK_PREFACE', 'LETTERS_FLOCK', 'LETTERS_REBUKE_PREFACE', 'LETTERS_REBUKE'];
    for (const name of corpora) {
      const v = window[name];
      if (!v) continue;
      for (const l of (Array.isArray(v) ? v : [v])) if (l && l.id === id) { window.__votE2ELetter = l; return true; }
    }
    return false;
  }, letterId);
  if (!found) return { ok: false, reason: 'letter not in corpus' };
  // Start the audio, then use the app's OWN bridge to jump the reader to the
  // text that is playing — the listening desk's title button. Reaching the
  // reading screen the way a listener does beats inventing a nav path here.
  const queued = await page.evaluate((vk) => {
    AudioPlayer.playLetter({ volKey: vk, letter: window.__votE2ELetter, collectionLabel: 'e2e' });
    const st = AudioPlayer.getState();
    return !!st.queue[st.qi];
  }, volKey);
  if (!queued) return { ok: false, reason: 'no track queued' };
  const opened = await page.evaluate(() => {
    if (typeof window.__openAudioText !== 'function') return false;
    const st = AudioPlayer.getState();
    window.__openAudioText(st.queue[st.qi]);
    return true;
  });
  if (!opened) return { ok: false, reason: '__openAudioText missing' };
  return { ok: true, reason: '' };
}

/**
 * Open a Bible chapter with its audio playing. Same bridge as the letters, so
 * the harness and a real listener take the same route to the screen.
 */
async function openBibleChapter(page, edition, bookId, chapterNum) {
  await page.evaluate(() => { window.__loadBibleCorpus(); });
  await page.waitForFunction('window.__bibleCorpus && window.__bibleCorpus.loaded', { timeout: 30000 });
  const ok = await page.evaluate((ed, id, ch) => {
    window.__setBibleAudioEdition && window.__setBibleAudioEdition(ed);
    // BOOKS is an object keyed by book id, not an array.
    const book = window.BOOKS && window.BOOKS[id];
    if (!book) return { ok: false, reason: 'book not in corpus' };
    const edition = window.BIBLE_AUDIO_EDITIONS && window.BIBLE_AUDIO_EDITIONS[ed];
    if (!edition) return { ok: false, reason: 'unknown edition ' + ed };
    AudioPlayer.playBibleBook({ volKey: edition.volKey, bookId: id, label: edition.label, chapterNum: ch });
    const st = AudioPlayer.getState();
    const track = st.queue[st.qi];
    if (!track) return { ok: false, reason: 'no track queued' };
    if (typeof window.__openAudioText !== 'function') return { ok: false, reason: '__openAudioText missing' };
    window.__openAudioText(track);
    return { ok: true, reason: '' };
  }, edition, bookId, chapterNum);
  return ok;
}

async function checkBible(page, spec, failures, report, ctx) {
  const edition = opt('edition', 'brm-kjv');
  const [bookId, chStr] = spec.split(':');
  const chapterNum = Number(chStr);
  const opened = await openBibleChapter(page, edition, bookId, chapterNum);
  if (!opened.ok) { failures.push({ key: spec, kind: 'NAV', detail: opened.reason }); return; }
  await sleep(900);
  try {
    await page.waitForFunction('AudioPlayer.getState().duration > 0', { timeout: 25000 });
  } catch (_e) {
    failures.push({ key: spec, kind: 'NO-DURATION', detail: 'metadata never arrived' });
    return;
  }
  // The verse timings are their own lazy file; the component asks for it the
  // first time a Bible track plays, so give that fetch a moment to land.
  try {
    await page.waitForFunction(
      `(() => { const t = window['BIBLE_SYNC_' + ${JSON.stringify(edition)}.toUpperCase().replace(/-/g,'_')]; return !!(t && t[${JSON.stringify(bookId)}]); })()`,
      { timeout: 20000 });
  } catch (_e) {
    failures.push({ key: spec, kind: 'NO-VERSE-TIMINGS', detail: `bible-sync-${edition}.js never provided ${bookId}` });
    return;
  }
  await page.evaluate(() => AudioPlayer.toggle());
  const sampled = await page.evaluate(async (ed, id, ch, lead, readSrc) => {
    const readPaint = new Function('return ' + readSrc);
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const table = window['BIBLE_SYNC_' + ed.toUpperCase().replace(/-/g, '_')];
    const arr = table[id][String(ch)] || [];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      if (!arr[i]) { out.push({ n: i + 1, skipped: true }); continue; }
      AudioPlayer.seek(Math.max(0, arr[i] / 100 - lead + 0.02));
      await frame();
      const p = readPaint();
      const el = document.querySelector('[data-hl-key="bible:' + id + ':' + ch + ':' + (i + 1) + '"]');
      out.push({ n: i + 1, want: el ? (el.textContent || '') : null, got: p.text == null ? null : p.text, key: p.key, size: p.size });
    }
    return out;
  }, edition, bookId, chapterNum, LEAD_S, READ_PAINT);

  let painted = 0;
  for (const s of sampled) {
    if (s.skipped) continue;
    const wantKey = `bible:${bookId}:${chapterNum}:${s.n}`;
    if (s.got == null) { failures.push({ key: spec, kind: 'NOTHING-PAINTED', detail: `verse ${s.n}` }); continue; }
    painted++;
    if (s.size !== 1) failures.push({ key: spec, kind: 'MULTI-RANGE', detail: `verse ${s.n}: ${s.size} ranges` });
    if (s.key !== wantKey) failures.push({ key: spec, kind: 'WRONG-VERSE', detail: `verse ${s.n}: painted ${s.key}` });
    // A verse row paints the WHOLE verse element, so the painted text must be
    // exactly the verse — no more, no less.
    if (s.want != null && s.got !== s.want) {
      failures.push({ key: spec, kind: 'PARTIAL-VERSE', detail: `verse ${s.n}
      painted:  ${JSON.stringify(s.got.slice(0, 60))}
      expected: ${JSON.stringify(s.want.slice(0, 60))}` });
    }
  }
  if (flag('pixel-proof') || flag('shot')) {
    const shotDir = flag('shot') ? OUT : null;
    if (shotDir) mkdirSync(shotDir, { recursive: true });
    const timed = sampled.filter((x) => !x.skipped);
    const at = timed[Math.min(timed.length - 1, Math.floor(timed.length / 3))];
    if (at) {
      await page.evaluate((ed, id, ch, n, lead) => {
        const table = window['BIBLE_SYNC_' + ed.toUpperCase().replace(/-/g, '_')];
        AudioPlayer.seek(Math.max(0, table[id][String(ch)][n - 1] / 100 - lead + 0.02));
      }, edition, bookId, chapterNum, at.n, LEAD_S);
      await sleep(260);
      const proof = await pixelProof(page, spec.replace(/[:/]/g, '__'), shotDir);
      if (!proof.ok) failures.push({ key: spec, kind: 'NOT-VISIBLE', detail: proof.reason || 'wash registered but did not render' });
      else console.log(`    pixel proof: +${proof.delta.dR.toFixed(1)}R +${proof.delta.dG.toFixed(1)}G over the verse block`);
    }
  }
  report.push({ key: spec, rows: sampled.length, sampled: sampled.filter((x) => !x.skipped).length, painted, domainBad: 0 });
  console.log(`  ${spec.padEnd(58)} ${painted}/${sampled.filter((x) => !x.skipped).length} verses painted` +
    (sampled.some((x) => x.skipped) ? `  (${sampled.filter((x) => x.skipped).length} unproven, not painted)` : ''));
  await page.evaluate(() => AudioPlayer.stop());
}

/**
 * Prove the wash actually RENDERS, and capture it.
 *
 * Every other assertion in this file passes in a world where
 * ::highlight(vot-reading) has been deleted from app.css or the Custom
 * Highlight API silently no-ops: the Range is registered, the text is right,
 * and the reader sees nothing at all. Only pixels can tell you otherwise. The
 * page decodes its own screenshot — createImageBitmap into an OffscreenCanvas
 * — so this needs no image dependency.
 */
async function pixelProof(page, label, shotDir) {
  const box = await page.evaluate(() => {
    const H = CSS.highlights && CSS.highlights.get('vot-reading');
    const r = H && [...H][0];
    if (!r) return null;
    const rect = r.getBoundingClientRect();
    const host = r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer;
    const block = host && host.closest ? host.closest('[data-hl-key]') : null;
    const b = block ? block.getBoundingClientRect() : rect;
    if (!rect.width || !rect.height) return null;
    r.startContainer.ownerDocument.defaultView.scrollTo;      // no-op; keep the range alive
    return {
      wash: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      block: { x: Math.max(0, b.x - 8), y: Math.max(0, b.y - 8), w: b.width + 16, h: b.height + 16 },
    };
  });
  if (!box) return { ok: false, reason: 'nothing painted' };

  const clip = { x: Math.round(box.block.x), y: Math.round(box.block.y), width: Math.round(box.block.w), height: Math.round(box.block.h) };
  if (clip.width < 4 || clip.height < 4) return { ok: false, reason: 'degenerate clip' };
  const png = await page.screenshot({ clip, encoding: 'base64' });
  if (shotDir) writeFileSync(resolve(shotDir, label + '.png'), Buffer.from(png, 'base64'));

  // Compare mean colour INSIDE the washed rectangle against the rest of the
  // block. The gold is rgba(232,192,80,0.20) over the dark page: a clear lift
  // in red and green that plain text cannot produce.
  const delta = await page.evaluate(async (b64, cl, wash) => {
    // atob, not fetch('data:...'): the app's CSP connect-src does not allow
    // data: URLs, and this analysis has to run inside the page's own origin.
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const cx = cv.getContext('2d');
    cx.drawImage(bmp, 0, 0);
    const img = cx.getImageData(0, 0, bmp.width, bmp.height).data;
    const sx = bmp.width / cl.width, sy = bmp.height / cl.height;
    const inside = { x0: (wash.x - cl.x) * sx, x1: (wash.x + wash.w - cl.x) * sx, y0: (wash.y - cl.y) * sy, y1: (wash.y + wash.h - cl.y) * sy };
    let inR = 0, inG = 0, inN = 0, outR = 0, outG = 0, outN = 0;
    for (let y = 0; y < bmp.height; y++) {
      for (let x = 0; x < bmp.width; x++) {
        const i = (y * bmp.width + x) * 4;
        const within = x >= inside.x0 && x < inside.x1 && y >= inside.y0 && y < inside.y1;
        if (within) { inR += img[i]; inG += img[i + 1]; inN++; } else { outR += img[i]; outG += img[i + 1]; outN++; }
      }
    }
    if (!inN || !outN) return null;
    return { dR: inR / inN - outR / outN, dG: inG / inN - outG / outN };
  }, png, clip, box.wash);
  if (!delta) return { ok: false, reason: 'could not sample the image' };
  return { ok: delta.dR > 6 || delta.dG > 6, delta, clip };
}

async function run() {
  mkdirSync(OUT, { recursive: true });
  const ctx = readData();
  const keys = pickKeys(ctx);
  if (!keys.length) {
    console.error('[e2e-readalong] no keys with locally cached audio — nothing to check.');
    console.error('  cache one with:  node tools/hone-sample.mjs <key> ... (it downloads)');
    process.exit(2);
  }

  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    protocolTimeout: 240000,
  });

  const failures = [];
  const report = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const misses = new Set();
    await interceptAudio(page, misses);
    page.on('pageerror', (e) => failures.push({ kind: 'PAGE-ERROR', detail: String(e).slice(0, 160) }));
    await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('document.querySelector("#root") && document.querySelector("#root").children.length > 0', { timeout: 30000 });

    const bibleSpec = opt('bible', '');
    if (bibleSpec) {
      for (const spec of bibleSpec.split(',').map((x) => x.trim()).filter(Boolean)) {
        await checkBible(page, spec, failures, report, ctx);
      }
    }

    for (const key of (bibleSpec && !opt('keys', '') ? [] : keys)) {
      const [volKey, letterId] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
      const opened = await openLetter(page, volKey, letterId);
      if (!opened.ok) { failures.push({ key, kind: 'NAV', detail: opened.reason }); continue; }
      await sleep(700);

      /* ── ASSERTION A: the modelled domain IS the rendered domain ────── */
      const domCheck = await page.evaluate((id) => {
        const letter = window.__votE2ELetter;
        const seg = window.segmentsDomText;
        if (typeof seg !== 'function') return { err: 'segmentsDomText not on window' };
        const bad = [];
        (letter.blocks || []).forEach((b, bi) => {
          const el = document.querySelector('[data-hl-key="letter:' + id + ':' + bi + '"]');
          if (!el) return;                       // headings etc. render no container
          let want = null;
          if (b.type === 'para' || b.type === 'intro' || b.type === 'closing-fn') want = seg(b.segments);
          else if (b.type === 'poetry') want = (b.lines || []).map((l) => seg(l)).join('');
          else if (b.type === 'closing') want = String(b.text || '');
          if (want === null) return;
          const got = el.textContent || '';
          if (got !== want) {
            bad.push({ bi, wantLen: want.length, gotLen: got.length, want: want.slice(0, 70), got: got.slice(0, 70) });
          }
        });
        return { bad, blocks: (letter.blocks || []).length };
      }, letterId);
      if (domCheck.err) { failures.push({ key, kind: 'HARNESS', detail: domCheck.err }); continue; }
      for (const b of domCheck.bad) {
        failures.push({
          key, kind: 'DOMAIN-MISMATCH',
          detail: `block ${b.bi}: rendered ${b.gotLen} chars, model says ${b.wantLen}\n      rendered: ${JSON.stringify(b.got)}\n      modelled: ${JSON.stringify(b.want)}`,
        });
      }

      /* ── wait for a real duration ───────────────────────────────────── */
      // seek() clamps to duration, so EVERY seek collapses to 0 until metadata
      // has landed. This wait is what makes the whole seek-and-sample mode work.
      try {
        await page.waitForFunction('AudioPlayer.getState().duration > 0', { timeout: 20000 });
      } catch (_e) {
        failures.push({ key, kind: 'NO-DURATION', detail: misses.size ? `audio not cached: ${[...misses].join(', ')}` : 'metadata never arrived' });
        continue;
      }
      await page.evaluate(() => AudioPlayer.toggle());          // pause: sampling, not listening

      /* ── ASSERTION B: seek to each row, read what painted ───────────── */
      const rows = (ctx.AUDIO_SYNC[key] || []).filter((r) => (r[4] || 0) === 0);
      const limit = opt('rows', '') === 'all' ? rows.length : Math.min(rows.length, Number(opt('rows', 40)));
      const sampled = await page.evaluate(async (rowsIn, lead, readSrc, id) => {
        const readPaint = new Function('return ' + readSrc);
        const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const out = [];
        for (let i = 0; i < rowsIn.length; i++) {
          const t = rowsIn[i][0];
          // Land just INSIDE this row: fragmentAt(time + LEAD_S) must pick i.
          AudioPlayer.seek(Math.max(0, t - lead + 0.02));
          await frame();
          const p = readPaint();
          const el = document.querySelector('[data-hl-key="letter:' + id + ':' + rowsIn[i][1] + '"]');
          // Whole-word test against the LIVE text. "painted === slice(cs,ce)"
          // is true by construction — rangeIn walks the very same string — so
          // it can never see a bad offset. This can: a boundary must sit at an
          // edge, beside whitespace, or where two poetry lines butt together
          // (separate divs, so their textContent concatenates with nothing
          // between them and a legal boundary there joins two word characters).
          let edgeOk = true;
          if (el) {
            const full = el.textContent || '';
            const joins = {};
            let acc = 0;
            const plines = el.querySelectorAll('.poetry-line');
            for (let k = 0; k < plines.length; k++) { acc += (plines[k].textContent || '').length; joins[acc] = 1; }
            const okAt = (off) => off <= 0 || off >= full.length || joins[off]
              || /\s/.test(full.charAt(off - 1)) || /\s/.test(full.charAt(off));
            edgeOk = okAt(rowsIn[i][2]) && okAt(rowsIn[i][3]);
          }
          out.push({
            i,
            want: el ? (el.textContent || '').slice(rowsIn[i][2], rowsIn[i][3]) : null,
            got: p.text == null ? null : p.text,
            key: p.key || null,
            size: p.size,
            names: p.names || [],
            edgeOk,
          });
        }
        return out;
      }, rows.slice(0, limit), LEAD_S, READ_PAINT, letterId);

      let painted = 0;
      for (const s of sampled) {
        const row = rows[s.i];
        const wantKey = 'letter:' + letterId + ':' + row[1];
        if (s.got == null) { failures.push({ key, kind: 'NOTHING-PAINTED', detail: `row ${s.i} at t=${row[0]}` }); continue; }
        painted++;
        if (s.size !== 1) failures.push({ key, kind: 'MULTI-RANGE', detail: `row ${s.i}: ${s.size} ranges registered` });
        if (s.names.length !== 1 || s.names[0] !== 'vot-reading') {
          failures.push({ key, kind: 'HIGHLIGHT-NAME', detail: `registered: ${JSON.stringify(s.names)}` });
        }
        if (s.key !== wantKey) failures.push({ key, kind: 'WRONG-BLOCK', detail: `row ${s.i}: painted ${s.key}, expected ${wantKey}` });
        if (s.want != null && s.got !== s.want) {
          failures.push({ key, kind: 'WRONG-TEXT', detail: `row ${s.i}\n      painted:  ${JSON.stringify(s.got.slice(0, 70))}\n      expected: ${JSON.stringify(s.want.slice(0, 70))}` });
        }
        // The owner's symptom, stated as an assertion: the wash must cover
        // whole words. Edge whitespace or a mid-word boundary is the drift.
        if (s.got !== s.got.trim()) failures.push({ key, kind: 'EDGE-WHITESPACE', detail: `row ${s.i}: ${JSON.stringify(s.got.slice(0, 40))}` });
        else if (!s.edgeOk) failures.push({ key, kind: 'MID-WORD', detail: `row ${s.i}: ${JSON.stringify(s.got.slice(0, 46))}` });
      }
      if (flag('pixel-proof') || flag('shot')) {
        const shotDir = flag('shot') ? OUT : null;
        if (shotDir) mkdirSync(shotDir, { recursive: true });
        const at = rows[Math.min(rows.length - 1, Math.floor(rows.length / 3))];
        await page.evaluate((t, lead) => AudioPlayer.seek(Math.max(0, t - lead + 0.02)), at[0], LEAD_S);
        await sleep(260);
        const proof = await pixelProof(page, key.replace(/[:/]/g, '__'), shotDir);
        if (!proof.ok) failures.push({ key, kind: 'NOT-VISIBLE', detail: proof.reason || `wash registered but did not render (dR=${proof.delta && proof.delta.dR.toFixed(1)})` });
        else console.log(`    pixel proof: +${proof.delta.dR.toFixed(1)}R +${proof.delta.dG.toFixed(1)}G over the block`);
      }
      report.push({ key, rows: rows.length, sampled: sampled.length, painted, domainBad: domCheck.bad.length });
      console.log(`  ${key.padEnd(58)} ${painted}/${sampled.length} painted` +
        (domCheck.bad.length ? `  DOMAIN-MISMATCH x${domCheck.bad.length}` : ''));
      await page.evaluate(() => AudioPlayer.stop());
    }

    if (misses.size) {
      console.log(`\n[e2e-readalong] ${misses.size} asset(s) not cached locally — those keys could not be checked.`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify({ report, failures }, null, 2));
  if (!failures.length) {
    console.log(`\n[e2e-readalong] OK — ${report.length} key(s), the rendered domain matches the model and every sampled row painted its own words.`);
    process.exit(0);
  }
  console.error(`\n[e2e-readalong] FAIL — ${failures.length} problem(s):`);
  const byKind = new Map();
  for (const f of failures) byKind.set(f.kind, (byKind.get(f.kind) || 0) + 1);
  for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1])) console.error(`    ${k.padEnd(20)} ${n}`);
  for (const f of failures.slice(0, 12)) console.error(`\n  ${f.key || ''} [${f.kind}]\n      ${f.detail}`);
  process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
