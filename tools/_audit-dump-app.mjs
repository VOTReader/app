// Audit helper: load each Format A data file in a VM sandbox and dump a
// normalized JSON record per letter for HTML↔app comparison. One-shot tool.
import { readFileSync, writeFileSync } from 'fs';
import vm from 'vm';

const dataDir = 'app/src/main/assets/src/data';
// file -> the collection label used in the comparison report
const FILES = {
  'volume-one': 'Volume One', 'volume-two': 'Volume Two', 'volume-three': 'Volume Three',
  'volume-four': 'Volume Four', 'volume-five': 'Volume Five', 'volume-six': 'Volume Six',
  'volume-seven': 'Volume Seven', 'lords-rebuke': "The Lord's Rebuke",
  'letters-flock': 'Letters to the Flock', 'letters-timothy': 'Letters from Timothy',
  'hidden-manna': 'Hidden Manna',
};

// Flatten a segments array to plain text.
function segText(segs) {
  if (!Array.isArray(segs)) return '';
  return segs.map((s) => (s && typeof s.v === 'string' ? s.v : '')).join(' ');
}
// Flatten a letter's blocks to one normalized plain-text string.
function blocksText(blocks) {
  if (!Array.isArray(blocks)) return '';
  const out = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    if (Array.isArray(b.segments)) out.push(segText(b.segments));
    if (Array.isArray(b.lines)) for (const ln of b.lines) out.push(segText(ln));
    if (typeof b.text === 'string') out.push(b.text);
  }
  return out.join(' ');
}
function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function noteText(nl) {
  if (Array.isArray(nl)) return segText(nl);
  return norm(nl);
}

function record(L) {
  const fns = (L.footnotes && typeof L.footnotes === 'object') ? L.footnotes : {};
  const fnList = Object.keys(fns).map((k) => {
    const fn = fns[k] || {};
    return { n: k, type: fn.type, ref: fn.ref || null, text: norm(fn.text || ''), hasSeeAlso: !!fn.seeAlso, url: fn.url || null };
  });
  const rt = Array.isArray(L.relatedTopics) ? L.relatedTopics.map((t) => ({ label: norm(t.label), url: t.url })) : [];
  const body = norm(blocksText(L.sectionIntro) + ' ' + blocksText(L.blocks));
  return {
    id: L.id, title: norm(L.title),
    date: norm(L.date), from: norm(L.from), spoken: norm(L.spoken), forLine: norm(L.forLine),
    noteLine: noteText(L.noteLine),
    bodyText: body, bodyWords: body ? body.split(' ').length : 0,
    fnCount: fnList.length, footnotes: fnList,
    nkjvKeys: (L.nkjv && typeof L.nkjv === 'object') ? Object.keys(L.nkjv) : [],
    relatedTopics: rt,
    metaAddendum: norm(L.metaAddendum), metaAddendumInternal: L.metaAddendumInternal || null,
    metaAddendumLink: L.metaAddendumLink || null, metaAddendumUrl: L.metaAddendumUrl || null,
    prev: L.prevLetter ? L.prevLetter.id : null, next: L.nextLetter ? L.nextLetter.id : null,
  };
}

const out = {};
for (const [file, label] of Object.entries(FILES)) {
  const src = readFileSync(`${dataDir}/${file}.js`, 'utf-8');
  const ctx = { window: {}, globalThis: {}, console };
  vm.createContext(ctx);
  try { vm.runInContext(src, ctx); } catch (e) { console.error(`[${file}] EVAL ERROR: ${e.message}`); continue; }
  const letters = [];
  let preface = null;
  for (const k of Object.keys(ctx)) {
    const v = ctx[k];
    if (Array.isArray(v) && v.length && v[0] && v[0].id && v[0].title) {
      for (const L of v) if (L && L.id && L.title) letters.push(record(L));
    } else if (v && typeof v === 'object' && v.id && v.title && (v.blocks || v.paragraphs)) {
      preface = record(v);
    }
  }
  if (preface) letters.unshift({ ...preface, _preface: true });
  out[label] = letters;
}

writeFileSync('tools/_audit-app.json', JSON.stringify(out, null, 0));
console.log('Dumped app data:');
for (const [label, arr] of Object.entries(out)) console.log(`  ${label}: ${arr.length} letters`);
