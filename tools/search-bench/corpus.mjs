/* The shipped corpus and search engine, in plain node (search benchmark, 2026-10-05).
   ─────────────────────────────────────────────────────────────────
   Runs the data files as classic scripts so their top-level vars become globals
   (what index.html's <script> tags do), then hands back what the benchmark needs:
     loadCorpus()   the globals, once
     docs(t)        the app's OWN buildDocs({translation}): the exact text MiniSearch indexes
     blocks()       every readable block of every prose unit, with the reader's own text
                    helpers (blockReadText, Format B split): what a landing scrolls to
     engine()       window.VotSearchMini from src/search/engine.js, init()ed (no IndexedDB
                    in node, so it builds fresh, as a first open does)
   Hidden Manna is never loaded here: it is not a search corpus (index-builder.js).
   ─────────────────────────────────────────────────────────────────── */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ASSETS = process.env.VOT_ASSETS || path.resolve(HERE, '../../app/src/main/assets');
const DATA = path.join(ASSETS, 'src/data');
const CORPORA = ['books', 'matthew', 'matthew-plain', 'volume-one', 'volume-two', 'volume-three', 'volume-four',
  'volume-five', 'volume-six', 'volume-seven', 'letters-timothy', 'letters-flock', 'lords-rebuke', 'wtlb-one',
  'wtlb-two', 'the-blessed', 'holy-days', 'answers', 'bible-studies'];

const g = /** @type {any} */ (globalThis);
let loaded = false;
const run = (f) => vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });

export function loadCorpus() {
  if (loaded) return;
  g.window = g;
  run(path.join(ASSETS, 'search-data.js'));
  for (const f of CORPORA) run(path.join(DATA, f + '.js'));
  g.BOOKS['matthew-plain'] = g.MATTHEW_PLAIN; // index.html registers it the same way
  loaded = true;
}

/** The KJV text of every verse, keyed `bookId:ch:v` (bible-kjv.js), for KJV-wording targets. */
export function kjvVerses() {
  loadCorpus();
  if (!g.BIBLE_KJV) run(path.join(DATA, 'bible-kjv.js'));
  return g.BIBLE_KJV;
}

export async function docs(translation = 'nkjv') {
  loadCorpus();
  const { buildDocs } = await import(pathToFileURL(path.join(ASSETS, 'src/search/index-builder.js')).href);
  return buildDocs({ translation });
}

/** Collapse whitespace the way the index flattens a block (LetterView's squash). */
const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/**
 * Every block of every prose unit, keyed the way a search doc names its unit:
 * `unitKey(doc)` === block.uk. Studies key by chapter id (what LetterView renders).
 * @returns {Promise<Array<{uk:string, col:string, unit:string, num:any, title:string, idx:number, type:string, text:string}>>}
 */
export async function blocks() {
  loadCorpus();
  const { blockReadText } = await import(pathToFileURL(path.join(ASSETS, 'src/utils/segment-dom-text.js')).href);
  const { splitFormatBInline } = await import(pathToFileURL(path.join(ASSETS, 'src/utils/format-b-inline.js')).href);
  const fmtB = (text) => splitFormatBInline(text).map((s) => {
    if (!s) return '';
    if (s.startsWith('**') && s.endsWith('**')) return fmtB(s.slice(2, -2));
    if (s.startsWith('_') && s.endsWith('_')) return fmtB(s.slice(1, -1));
    return s.replace(/\{\{[^}]+\}\}/g, ' ');
  }).join('');
  const out = [];
  const push = (col, U, idx, type, text) => out.push({ uk: col + '/' + U.id, col, unit: U.id, num: U.num, title: U.title || '', idx, type: type || 'para', text: squash(text) });
  const VC = g.VotSearchData.VOLUME_COLLECTIONS.filter((v) => !['wtlb1', 'wtlb2', 'blessed', 'holydays'].includes(v.id));
  for (const V of VC) {
    const arr = (V.prefaceVar && g[V.prefaceVar] ? [g[V.prefaceVar]] : []).concat(g[V.dataVar] || []);
    for (const L of arr) (L.blocks || []).forEach((b, i) => push(V.id, L, i, b.type, blockReadText(b)));
  }
  for (const [col, arr] of [['wtlb1', g.WTLB_ONE], ['wtlb2', g.WTLB_TWO], ['blessed', g.THE_BLESSED], ['holydays', g.HOLY_DAYS], ['answers', g.ANSWERS]]) {
    for (const en of arr) {
      if (en.paragraphs && en.paragraphs.length) en.paragraphs.forEach((p, i) => push(col, en, i, 'para', fmtB(p.text || '')));
      else (en.blocks || []).forEach((b, i) => push(col, en, i, b.type, blockReadText(b)));
    }
  }
  for (const S of g.BIBLE_STUDIES) for (const c of S.chapters || []) {
    const U = { id: c.id, num: c.num, title: S.title + ' — ' + (c.title || '') };
    (c.blocks || []).forEach((b, i) => push('bible-studies', U, i, b.type, blockReadText(b)));
  }
  return out;
}

/** The unit a search doc opens: `<volumeId>/<unit id>`; a verse is `<volumeId>/<book>:<ch>:<v>`. */
export function unitKey(doc) {
  if (!doc) return '';
  if (doc.kind === 'verse') return (doc.volumeId || 'bible') + '/' + doc.bookId + ':' + doc.chapterNum + ':' + doc.verseNum;
  if (doc.kind === 'bible-study') return 'bible-studies/' + (doc.studyChapterId || doc.letterId);
  return doc.volumeId + '/' + doc.letterId;
}

export async function engine() {
  loadCorpus();
  const t0 = Date.now();
  const { VotSearchMini: E } = await import(pathToFileURL(path.join(ASSETS, 'src/search/engine.js')).href);
  await E.init();
  const meaning = await startMeaning();
  return { E, initMs: Date.now() - t0, meaning };
}

/** The on-device meaning model (semantic.js), from the shipped files, as the app runs it by default.
    SEARCH_MEANING=off measures the words engine alone. */
export async function startMeaning() {
  const S = await import(pathToFileURL(path.join(ASSETS, 'src/search/semantic.js')).href);
  if (process.env.SEARCH_MEANING === 'off') return { status: 'off' };
  S.configureSemantic({
    url: (p) => pathToFileURL(path.join(ASSETS, p)).href,
    load: async (p) => { const b = fs.readFileSync(path.join(ASSETS, p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
    importModule: (p) => import(pathToFileURL(path.join(ASSETS, p)).href),
  });
  await S.startSemantic();
  return S.semanticStatus();
}

/** Lowercase letters and digits only, single-spaced: the containment test for equivalence classes. */
export const norm = (s) => ' ' + String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[’‘']/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';

/** Sentences of a block, with their character offsets in it. */
export function sentences(text) {
  const out = [];
  const re = /[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    if (!raw.trim()) { if (re.lastIndex === m.index) re.lastIndex++; continue; }
    const lead = raw.length - raw.trimStart().length;
    out.push({ start: m.index + lead, end: m.index + raw.trimEnd().length, text: raw.trim() });
  }
  return out;
}
