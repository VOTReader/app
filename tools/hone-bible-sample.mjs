/**
 * hone-bible-sample — playable verse read-along preview for one aligned chapter.
 *
 *   node tools/hone-bible-sample.mjs <verses.json> <timings.json> <out-html>
 *        [--edition-title <str>]        e.g. "BRM (KJV)" — names the recording
 *
 * Verse text with gold sup numbers and section headings, audio embedded as a
 * data URI, karaoke highlight driven by the belt-verified verse starts.
 * Status legend: solid gold = CONFIRMED (both aligners agree), amber = probe-
 * adjudicated, dotted = REVIEW (no shipped timing). QA artifact, not app code.
 */
import { readFileSync, writeFileSync } from 'fs';

const USAGE = 'usage: node tools/hone-bible-sample.mjs <verses.json> <timings.json> <out-html> [--edition-title <str>]';
let editionTitle = 'The Word of Promise (dramatized NKJV)';
const pos = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--edition-title') editionTitle = argv[++i] || '';
  else if (a.startsWith('--edition-title=')) editionTitle = a.slice('--edition-title='.length);
  else pos.push(a);
}
const [versesPath, timingsPath, outPath] = pos;
if (!versesPath || !timingsPath || !outPath) {
  console.error(USAGE);
  process.exit(1);
}
const vdata = JSON.parse(readFileSync(versesPath, 'utf8'));
const tdata = JSON.parse(readFileSync(timingsPath, 'utf8'));
const mp3 = readFileSync(tdata.audio);
const dataUri = 'data:audio/mpeg;base64,' + mp3.toString('base64');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const byN = new Map(tdata.verses.map((r) => [r.n, r]));
let body = '';
for (const v of vdata.verses) {
  const r = byN.get(v.n) || {};
  const has = r.t != null;
  const cls = !has ? 'verse miss' : (r.status === 'CONFIRMED' ? 'verse' : 'verse probed');
  const tAttr = has ? ` data-t="${r.t}"` : '';
  body += `<span class="${cls}" data-n="${v.n}"${tAttr}><sup>${v.n}</sup>${esc(v.text)}</span> `;
}

const conf = tdata.verses.filter((r) => r.status === 'CONFIRMED').length;
const probed = tdata.verses.filter((r) => r.status && r.status.startsWith('PROBED')).length;
const review = tdata.verses.filter((r) => r.status === 'REVIEW').length;

const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(vdata.book)} ${vdata.chapter} — read-along sample</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #14110b; color: #e8e0cf; font-family: Georgia, 'EB Garamond', serif;
         line-height: 1.85; font-size: 19px; }
  header { position: sticky; top: 0; background: #1c1810f2; backdrop-filter: blur(6px);
           border-bottom: 1px solid #3a3220; padding: 14px 20px; z-index: 2; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #d4af5f; font-weight: 600; letter-spacing: .04em; }
  .meta { font-size: 13px; color: #9a8f74; font-style: italic; }
  audio { width: 100%; margin-top: 10px; }
  main { max-width: 680px; margin: 0 auto; padding: 28px 22px 50vh; text-align: justify; }
  sup { color: #d4af5f; font-size: 12px; margin-right: 3px; }
  .verse { cursor: pointer; border-radius: 3px; padding: 0 1px; transition: background .25s, color .25s; }
  .verse:hover { background: #2a2416; }
  .verse.on { background: #d4af5f; color: #191505; }
  .verse.on sup { color: #191505; }
  .verse.probed.on { background: #c29a45; }
  .verse.miss { text-decoration: underline dotted #7a5c5c; text-underline-offset: 4px; }
  .legend { font-size: 12px; color: #9a8f74; margin-top: 6px; }
  .legend b { color: #d4af5f; }
</style>
<header>
  <h1>${esc(vdata.book)} ${vdata.chapter}${editionTitle ? ' — ' + esc(editionTitle) : ''}</h1>
  <div class="meta">${conf} confirmed by both aligners · ${probed} probe-adjudicated · ${review} review · click any verse to seek</div>
  <audio id="a" controls preload="metadata" src="${dataUri}"></audio>
  <div class="legend"><b>gold</b> = now playing · amber = probe-adjudicated timing · dotted = no timing shipped</div>
</header>
<main>
${body}
</main>
<script>
  const audio = document.getElementById('a');
  const spans = [...document.querySelectorAll('.verse[data-t]')].sort((x, y) => +x.dataset.t - +y.dataset.t);
  // Mirrors ReadAlongHighlight.jsx — the app paints fragmentAt(frags, time + 0.15),
  // so the sample must lead by the same amount or what is dialed here is not what ships.
  const LEAD_S = 0.15;
  let cur = null;
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
  document.querySelectorAll('.verse[data-t]').forEach((s) =>
    s.addEventListener('click', () => { audio.currentTime = +s.dataset.t + 0.01; audio.play(); }));
</script>
`;
writeFileSync(outPath, html);
console.log('wrote ' + outPath + ' (' + Math.round(html.length / 1024) + ' KB)');
