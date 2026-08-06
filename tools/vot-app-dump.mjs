/**
 * Dump the app's shipped corpus text, so it can be diffed against the official PDFs.
 *
 *   node tools/vot-app-dump.mjs
 *
 * The app data files are classic scripts assigning plain globals, so they are LOADED and walked
 * rather than regex-scraped: a regex over source would miss escaping and nested shapes, and a
 * near-miss here would look like a corpus defect rather than a tooling one.
 *
 * Only content-bearing strings are collected. Ids, slugs, URLs and structural enum values are
 * skipped — they are machinery, not the text, and including them would inflate agreement with
 * words that were never printed in the book.
 *
 * Writes _ocr_out/vot/_app-text/<collection>.json { collection, globals, strings, words }
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'app/src/main/assets/src/data');
const OUT = path.join(ROOT, '_ocr_out', 'vot', '_app-text');

// Keys whose values are machinery rather than printed text.
const SKIP_KEYS = new Set([
  'id', 'ids', 'slug', 'url', 'audioUrl', 'soundcloudUrl', 'videoVoiceUrl', 'videoMusicUrl',
  'metaAddendumUrl', 'collection', 'letterTitle', 'chapterIds', 'type', 'align', 't', 'kind',
  'num', 'n', 'sourceLabel', 'href', 'link', 'internal', 'metaAddendumInternal', 'ref',
]);

const FILES = [
  ['volume-one', 'volume-one.js'],
  ['volume-two', 'volume-two.js'],
  ['volume-three', 'volume-three.js'],
  ['volume-four', 'volume-four.js'],
  ['volume-five', 'volume-five.js'],
  ['volume-six', 'volume-six.js'],
  ['volume-seven', 'volume-seven.js'],
  ['lords-rebuke', 'lords-rebuke.js'],
  ['letters-flock', 'letters-flock.js'],
  ['letters-timothy', 'letters-timothy.js'],
  ['wtlb-one', 'wtlb-one.js'],
  ['wtlb-two', 'wtlb-two.js'],
  ['the-blessed', 'the-blessed.js'],
  ['matthew', 'matthew.js'],
  ['hidden-manna', 'hidden-manna.js'],
  ['bible-studies', 'bible-studies.js'],
];

// APPARATUS: text the APP adds around the letter — the NKJV verse dictionary behind footnote
// bubbles, per-entry scripture quotations, "see also" excerpts, related-topic labels. None of
// it is printed in the source PDFs, so counting it as body text makes a faithful corpus look
// 28% divergent. Measured 2026-08-05: this alone explained volume-one scoring 72%.
const APPARATUS_KEYS = new Set([
  'nkjv', 'scriptures', 'seeAlso', 'excerpt', 'relatedTopics', 'label', 'footnotes',
  'metaAddendum', 'crossRefs', 'refs', 'notes',
]);

function collect(node, body, apparatus, key, inApparatus) {
  if (node == null) return;
  const here = inApparatus || APPARATUS_KEYS.has(key);
  if (typeof node === 'string') {
    if (!SKIP_KEYS.has(key) && !/^https?:\/\//.test(node)) {
      (here ? apparatus : body).push(node);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) collect(v, body, apparatus, key, here);
    return;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) collect(v, body, apparatus, k, here);
  }
}

fs.mkdirSync(OUT, { recursive: true });
const summary = [];
for (const [name, file] of FILES) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) {
    console.log(`missing ${file}`);
    continue;
  }
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: file });
  const globals = Object.keys(ctx);
  const strings = [];
  const apparatus = [];
  for (const g of globals) collect(ctx[g], strings, apparatus, g, false);
  const wc = (a) => a.join(' ').split(/\s+/).filter(Boolean).length;
  const words = wc(strings);
  const apparatusWords = wc(apparatus);
  fs.writeFileSync(
    path.join(OUT, `${name}.json`),
    JSON.stringify({
      collection: name, file, globals, strings, apparatus,
      words, apparatus_words: apparatusWords,
    }) + '\n',
    'utf8',
  );
  summary.push({ name, words, apparatusWords });
  console.log(
    `${name.padEnd(16)} body=${String(words).padStart(7)}  apparatus=${String(apparatusWords).padStart(7)}`,
  );
}
console.log(`\ntotal app words dumped: ${summary.reduce((a, s) => a + s.words, 0).toLocaleString()}`);
