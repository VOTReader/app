/**
 * hone-sample — playable read-along preview for one honed letter/entry.
 *
 *   node tools/hone-sample.mjs <volKey:letterId> <hone-json> <out-html>
 *        [--audio <path|assetId>]       explicit audio source; repeat once per part
 *        [--title-suffix <str>]         e.g. the reader's name on an alternate page
 *
 * Renders the letter's blocks with each aligned sentence/line as a span (Format
 * A) or each paragraph as one span (Format B), embeds the audio as a data URI
 * (fully offline sample), and drives a karaoke highlight off the honed start
 * times. Click any sentence to seek.
 *
 * Belt status legend (parity with hone-bible-sample):
 *   gold   = CONFIRMED (both aligners agree)
 *   amber  = PROBED_A/PROBED_B (probe-adjudicated)
 *   duller = interpolated timing (borrowed from neighbours)
 *   dotted = REVIEW / nothing shipped
 * Legacy hone JSONs (no per-row `status`) fall back to all-gold.
 *
 * --audio without a path separator or extension is treated as a release asset
 * id: _align-work/audio/<assetId>.mp3, downloaded from the audio-v1 release if
 * it is not already on disk. With no --audio the AUDIO_MANIFEST row for <key>
 * supplies every part in order.
 *
 * This is a QA artifact, not app code — the app paints via ReadAlongHighlight.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const AUDIO_DIR = resolve(HERE, '_align-work', 'audio');
const RELEASE = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/';
const USAGE = 'usage: node tools/hone-sample.mjs <volKey:letterId> <hone-json> <out-html> [--audio <path|assetId>]... [--title-suffix <str>]';

// ------------------------------------------------------------------ args --
const audioSpecs = [];
let titleSuffix = '';
const pos = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--audio') audioSpecs.push(argv[++i]);
  else if (a.startsWith('--audio=')) audioSpecs.push(a.slice('--audio='.length));
  else if (a === '--title-suffix') titleSuffix = argv[++i] || '';
  else if (a.startsWith('--title-suffix=')) titleSuffix = a.slice('--title-suffix='.length);
  else pos.push(a);
}
const [key, honePath, outPath] = pos;
if (!key || !honePath || !outPath || audioSpecs.some((s) => s == null)) {
  console.error(USAGE);
  process.exit(1);
}
const [volKey, letterId] = key.split(/:(.+)/);

// ---------------------------------------------------------------- corpus --
const FILES = {
  one: 'volume-one.js', two: 'volume-two.js', three: 'volume-three.js',
  four: 'volume-four.js', five: 'volume-five.js', six: 'volume-six.js',
  seven: 'volume-seven.js', timothy: 'letters-timothy.js',
  flock: 'letters-flock.js', rebuke: 'lords-rebuke.js',
  wtlb1: 'wtlb-one.js', wtlb2: 'wtlb-two.js', blessed: 'the-blessed.js',
  holydays: 'holy-days.js',
};
if (!FILES[volKey]) { console.error('unknown volume key: ' + volKey); process.exit(1); }
const ctx = {};
runInNewContext(readFileSync(resolve(ASSETS, 'src', 'data', FILES[volKey]), 'utf8'), ctx, { filename: FILES[volKey] });
const arrs = Object.values(ctx).filter(Array.isArray);
let letter = null;
for (const a of arrs) for (const l of a) if (l && l.id === letterId) letter = l;
if (!letter) { const p = Object.values(ctx).find((v) => v && v.id === letterId); letter = p || null; }
if (!letter) { console.error('letter not found: ' + letterId); process.exit(1); }

const hone = JSON.parse(readFileSync(honePath, 'utf8'));
const fragEntry = JSON.parse(readFileSync(resolve(HERE, '_align-work', 'fragments-all.json'), 'utf8'))[key];
if (!fragEntry) { console.error('no fragments for key: ' + key); process.exit(1); }
const frags = fragEntry.fragments;
const fmt = fragEntry.format || (frags[0] && frags[0].pi != null ? 'B' : 'A');

// ------------------------------------------------------------- belt rows --
// fi -> the row that owns the fragment. A multi-part run can evaluate the same
// fragment in two parts; the one that actually shipped wins, else the first.
const rows = new Map();
for (const r of hone.results || []) {
  const prev = rows.get(r.fi);
  if (!prev || (prev.ship_t == null && r.ship_t != null)) rows.set(r.fi, r);
}
const hasStatus = (hone.results || []).some((r) => r.status);
const partOf = (r) => (r && r.part) || 0;
const shipped = [...rows.values()].filter((r) => r.ship_t != null);
const nParts = Math.max(
  1,
  ...[...rows.values()].map((r) => partOf(r) + 1),
  ...(hone.tuples || []).map((t) => (t[4] || 0) + 1),
);
const count = (pred) => shipped.filter(pred).length;
const nConf = count((r) => !r.status || r.status === 'CONFIRMED');
const nProbed = count((r) => r.status && String(r.status).startsWith('PROBED'));
const nReview = count((r) => r.status === 'REVIEW') + (rows.size ? rows.size - shipped.length : 0);
const nInterp = count((r) => r.interpolated);

function classFor(r) {
  if (!r || r.ship_t == null) return 'frag miss';
  let c = 'frag';
  const st = r.status;
  if (st && String(st).startsWith('PROBED')) c += ' probed';
  else if (st === 'REVIEW') c += ' review';
  if (r.interpolated) c += ' interp';
  return c;
}

// -------------------------------------------------------------- audio(s) --
function manifestRow(k) {
  const text = readFileSync(resolve(ASSETS, 'src', 'data', 'audio-manifest.js'), 'utf8');
  const block = text.match(/var AUDIO_MANIFEST = \{([\s\S]*?)\n\};/);
  if (!block) return null;
  const m = block[1].match(new RegExp('"' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '":(\\[\\[.*?\\]\\])'));
  return m ? JSON.parse(m[1]) : null;
}

async function resolveAudio(spec) {
  if (/[\\/]/.test(spec) || extname(spec)) {
    const p = resolve(spec);
    if (!existsSync(p)) { console.error('audio file not found: ' + p); process.exit(1); }
    return p;
  }
  mkdirSync(AUDIO_DIR, { recursive: true });
  const p = join(AUDIO_DIR, spec + '.mp3');
  if (!existsSync(p)) {
    const url = RELEASE + spec + '.mp3';
    console.log('  downloading ' + url + ' ...');
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) { console.error('download failed (' + res.status + '): ' + url); process.exit(1); }
    writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  }
  return p;
}

const MIME = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg' };
const mrow = manifestRow(key);
let specs = audioSpecs.length ? audioSpecs : (mrow ? mrow.map((t) => t[0]) : []);
if (!specs.length) {
  console.error('no audio: pass --audio <path|assetId> (no AUDIO_MANIFEST row for ' + key + ')');
  process.exit(1);
}
if (specs.length < nParts) {
  console.error('this alignment has ' + nParts + ' part(s) but only ' + specs.length + ' audio source(s) — pass one --audio per part');
  process.exit(1);
}
specs = specs.slice(0, nParts);
const partLabel = (i) => (mrow && mrow[i] && mrow[i][2]) || 'Part ' + (i + 1);
const partSrc = [];
let audioBytes = 0;
for (const spec of specs) {
  const p = await resolveAudio(spec);
  const buf = readFileSync(p);
  audioBytes += buf.length;
  partSrc.push('data:' + (MIME[extname(p).toLowerCase()] || 'audio/mpeg') + ';base64,' + buf.toString('base64'));
}

// --------------------------------------------------------------- render ---
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const segText = (s) => (!s || s.t === 'stanza-break') ? '' : String(s.v == null ? '' : s.v);

function spanOpen(fi) {
  const r = rows.get(fi);
  const cls = classFor(r);
  const t = r && r.ship_t != null ? ' data-t="' + r.ship_t + '" data-part="' + partOf(r) + '"' : '';
  return '<span class="' + cls + '" data-fi="' + fi + '"' + t + '>';
}

// --- Format A: sentence / poetry-line spans sliced out of block text -------
const byBlock = new Map();
frags.forEach((f, fi) => {
  if (f.bi == null) return;
  if (!byBlock.has(f.bi)) byBlock.set(f.bi, []);
  byBlock.get(f.bi).push({ ...f, fi });
});

function renderBlockText(text, bi, poetryLine) {
  const list = (byBlock.get(bi) || []).filter((f) => poetryLine == null || (f.cs >= poetryLine.cs && f.ce <= poetryLine.ce));
  let html = '', pos = poetryLine ? poetryLine.cs : 0;
  const end = poetryLine ? poetryLine.ce : text.length;
  for (const f of list.sort((a, b) => a.cs - b.cs)) {
    if (f.cs > pos) html += esc(text.slice(pos, f.cs));
    html += spanOpen(f.fi) + esc(text.slice(f.cs, f.ce)) + '</span>';
    pos = f.ce;
  }
  if (pos < end) html += esc(text.slice(pos, end));
  return html;
}

// --- Format B: whole-paragraph spans (the app's ce === -1 path) ------------
const byPi = new Map();
frags.forEach((f, fi) => { if (f.pi != null) byPi.set(f.pi, fi); });

function plainParagraph(t) {
  return String(t || '')
    .replace(/\{\{ref:([^}]+)\}\}/g, '($1)')
    .replace(/\{\{nav:[^}]+\}\}/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1');
}

let body = '';
if (fmt === 'B') {
  (letter.paragraphs || []).forEach((p, pi) => {
    const fi = byPi.get(pi);
    const text = esc(plainParagraph(p.text)).replace(/\n/g, '<br>');
    const align = p.align === 'center' ? ' pcenter' : '';
    body += '<p class="para' + align + '">' + (fi == null ? text : spanOpen(fi) + text + '</span>') + '</p>\n';
  });
} else {
  (letter.blocks || []).forEach((b, bi) => {
    if (b.type === 'para' || b.type === 'intro' || b.type === 'closing-fn') {
      const text = (b.segments || []).map(segText).join('');
      body += `<p class="para">${renderBlockText(text, bi)}</p>\n`;
    } else if (b.type === 'poetry') {
      let pos = 0;
      const lines = [];
      if (b.lines) for (const line of b.lines) {
        const lt = (line || []).map(segText).join('');
        lines.push({ cs: pos, ce: pos + lt.length, lt });
        pos += lt.length;
      }
      const text = lines.map((l) => l.lt).join('');
      body += '<div class="poetry">' + lines.map((l) => `<div class="pline">${renderBlockText(text, bi, l)}</div>`).join('\n') + '</div>\n';
    } else if (b.type === 'closing') {
      body += `<p class="closing">${renderBlockText(String(b.text || ''), bi)}</p>\n`;
    }
  });
}

const title = esc(letter.title) + (titleSuffix ? ' — ' + esc(titleSuffix) : '');
const metaBits = [];
if (letter.from) metaBits.push(esc(letter.from));
if (letter.date) metaBits.push(esc(letter.date));
if (hone.coverage != null) metaBits.push('coverage ' + hone.coverage);
metaBits.push((hone.shipped != null ? hone.shipped : shipped.length) + '/' + (hone.fragments != null ? hone.fragments : frags.length) + ' fragments timed');
if (hasStatus) metaBits.push(nConf + ' confirmed · ' + nProbed + ' probed · ' + nReview + ' review');
if (nInterp) metaBits.push(nInterp + ' interpolated');
if (hone.settings && hone.settings.model) metaBits.push('model ' + esc(hone.settings.model));

const legend = hasStatus
  ? '<b>gold</b> = now playing (confirmed) · amber = probe-adjudicated · duller = interpolated · dotted = review / no timing · click any sentence to seek'
  : '<b>gold</b> = now playing · duller gold = interpolated timing · dotted = no timing shipped · click any sentence to seek';

const chips = nParts > 1
  ? '\n  <div class="parts" role="group" aria-label="Recording parts">' +
    partSrc.map((_, i) => '<button type="button" class="part-chip' + (i === 0 ? ' on' : '') + '" data-part="' + i + '">' + esc(partLabel(i)) + '</button>').join('') +
    '</div>'
  : '';

const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — read-along sample</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #14110b; color: #e8e0cf; font-family: Georgia, 'EB Garamond', serif;
         line-height: 1.75; font-size: 19px; }
  header { position: sticky; top: 0; background: #1c1810f2; backdrop-filter: blur(6px);
           border-bottom: 1px solid #3a3220; padding: 14px 20px; z-index: 2; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #d4af5f; font-weight: 600; letter-spacing: .04em; }
  .meta { font-size: 13px; color: #9a8f74; font-style: italic; }
  audio { width: 100%; margin-top: 10px; }
  main { max-width: 680px; margin: 0 auto; padding: 28px 22px 50vh; }
  .para { text-align: justify; margin: 1.1em 0; }
  .para.pcenter { text-align: center; }
  .poetry { text-align: center; margin: 1.4em 0; font-style: italic; }
  .closing { text-align: center; margin: 2em 0 1em; font-weight: 600; letter-spacing: .06em; }
  .frag { cursor: pointer; border-radius: 3px; padding: 0 1px; transition: background .25s, color .25s, opacity .2s; }
  .frag:hover { background: #2a2416; }
  .frag.on { background: #d4af5f; color: #191505; }
  .frag.probed.on { background: #c29a45; }
  .frag.interp.on { background: #a08040; }
  .frag.review { text-decoration: underline dotted #8a6f3c; text-underline-offset: 3px; }
  .frag.review.on { background: #7a6535; color: #f6efdd; }
  .frag.miss { text-decoration: underline dotted #7a5c5c; text-underline-offset: 3px; }
  .frag.offpart { opacity: .34; }
  .legend { font-size: 12px; color: #9a8f74; margin-top: 6px; }
  .legend b { color: #d4af5f; }
  .parts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 9px; }
  .part-chip { font: inherit; font-size: 12px; letter-spacing: .04em; padding: 4px 13px; border-radius: 999px;
               border: 1px solid #4a3f28; background: #241f14; color: #c9bb9a; cursor: pointer; }
  .part-chip.on { background: #d4af5f; border-color: #d4af5f; color: #191505; }
</style>
<header>
  <h1>${title}</h1>
  <div class="meta">${metaBits.join(' · ')}</div>
  <audio id="a" controls preload="metadata"></audio>${chips}
  <div class="legend">${legend}</div>
</header>
<main>
${body}
</main>
<script>
  const PART_SRC = ${JSON.stringify(partSrc)};
  const audio = document.getElementById('a');
  // Mirrors ReadAlongHighlight.jsx — the app paints fragmentAt(frags, time + 0.15),
  // so the sample must lead by the same amount or what is dialed here is not what ships.
  const LEAD_S = 0.15;
  const all = [...document.querySelectorAll('.frag[data-t]')];
  let part = -1, spans = [], cur = null;
  function setPart(p) {
    if (p === part) return;
    part = p;
    if (cur) { cur.classList.remove('on'); cur = null; }
    spans = all.filter((s) => +s.dataset.part === p).sort((x, y) => +x.dataset.t - +y.dataset.t);
    all.forEach((s) => s.classList.toggle('offpart', +s.dataset.part !== p));
    document.querySelectorAll('.part-chip').forEach((c) => c.classList.toggle('on', +c.dataset.part === p));
    audio.src = PART_SRC[p];
    audio.load();
  }
  function tick() {
    const t = audio.currentTime + LEAD_S;
    let pick = null;
    for (const s of spans) { if (+s.dataset.t <= t) pick = s; else break; }
    if (pick !== cur) {
      if (cur) cur.classList.remove('on');
      cur = pick;
      if (cur) { cur.classList.add('on'); cur.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }
  }
  audio.addEventListener('timeupdate', tick);
  setInterval(() => { if (!audio.paused) tick(); }, 120);
  document.querySelectorAll('.part-chip').forEach((c) =>
    c.addEventListener('click', () => setPart(+c.dataset.part)));
  all.forEach((s) => s.addEventListener('click', () => {
    setPart(+s.dataset.part);
    audio.currentTime = +s.dataset.t + 0.01;
    audio.play();
  }));
  setPart(PART_SRC.length ? 0 : -1);
</script>
`;
writeFileSync(outPath, html);
console.log('wrote ' + outPath + ' (' + Math.round(html.length / 1024) + ' KB, audio ' +
  Math.round(audioBytes / 1024) + ' KB across ' + partSrc.length + ' part(s))');
