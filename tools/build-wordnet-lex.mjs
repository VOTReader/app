#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tools/build-wordnet-lex.mjs — the substitution lexicon the app ships:
   general English synonyms, as align.js credits them (search200 B7, 2026-10-18)
   ═══════════════════════════════════════════════════════════════════════
   A reader quoting a letter from memory puts a word of their own in a word's
   place: creator for maker, wide for broad, tread for walk. This is the general
   English source, WordNet, kept to the words the corpus the app searches holds.
   It writes search-lexicon.json (the assets root), which the app fetches beside
   the index (engine.js setAlignLexiconSource) and align.js credits as a
   substitution only: never a query term, never recall.

   Input: the pairs tools/wordnet-pairs.py reads out of the WordNet database
   (python -I, the database being downloaded data): word, word, relation (syn:
   one synset; sim: a direct similar-to link between adjectives; hyp: a direct
   hypernym link, one a kind of the other), and where that synset falls in each
   word's senses (WordNet orders them most frequent first).
   Kept: both words content words (3+ letters, not stop words) that the corpus
   holds, their light lemmas (passage.js) apart and neither belonging to another
   word (lexicon-lib.mjs: "not" is not's, not note's), and the pair not already
   credited as well by align.js's own classes (forms, register, SYNONYM_MAP,
   one-letter slips).
   Credit, close above loose (lexicon-lib.mjs wordnetCredit):
     0.7  one synset, among the two most frequent senses of both words
     0.6  a direct similar-to link, among the two most frequent senses of both
     0.5  either through a less frequent sense (loose), or a direct hypernym
          link among the most frequent senses (a hypernym link through a rarer
          sense is left out)
   The synonym and similar-to tiers were set before any bench run. The hypernym
   tier came in the second round, after the open misses showed a reader trading
   a word for a kind of it (tread for walk), which no synset holds; like the
   rest it was judged on the whole open set (tools/search-bench) and on the
   distractors it lifts (align-probe.mjs), and --no-hyp builds the lexicon
   without it for that comparison.
   Deterministic: the input is sorted, every step a fixed order.

   Source and license: WordNet 3.1, Princeton University, https://wordnet.princeton.edu/
   (https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz, sha256
   3f7d8be8ef6ecc7167d39b10d66954ec734280b5bdcd57f7d9eafe429d11c22a). The WordNet License
   permits use, copying, modification and distribution for any purpose without fee, provided its
   copyright notice and statements, including the disclaimer, appear on all copies: the generated
   file carries them whole (WORDNET_NOTICE below).

   Usage:  python -I tools/wordnet-pairs.py <wordnet dict dir> <pairs.tsv>
           node tools/build-wordnet-lex.mjs <pairs.tsv>            (write search-lexicon.json)
           node tools/build-wordnet-lex.mjs <pairs.tsv> --check    (exit 1 when the file is stale)
           ... --out <file.json>   write elsewhere (a trial); --no-hyp   leave the hypernym tier out
   ═══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCorpus, ASSETS } from './search-bench/corpus.mjs';
import { corpusVocabulary, underOtherWord, wordnetCredit, lexiconAsset } from './lexicon-lib.mjs';

const arg = (/** @type {string} */ k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const OUT = arg('--out') || path.join(ASSETS, 'search-lexicon.json');
const NO_HYP = process.argv.includes('--no-hyp');
const mod = (/** @type {string} */ p) => import(pathToFileURL(path.join(ASSETS, 'src/search', p)).href);
const { kjvEncode } = await mod('tokenize.js');
const { joinApostropheS } = await mod('ranking.js');
const { lemma } = await mod('passage.js');
const { alignClasses } = await mod('align.js');
const { formatLexicon } = await mod('lexicon.js');

const WORDNET_NOTICE = `WordNet Release 3.1

This software and database is being provided to you, the LICENSEE, by
Princeton University under the following license.  By obtaining, using
and/or copying this software and database, you agree that you have
read, understood, and will comply with these terms and conditions.:

Permission to use, copy, modify and distribute this software and
database and its documentation for any purpose and without fee or
royalty is hereby granted, provided that you agree to comply with
the following copyright notice and statements, including the disclaimer,
and that the same appear on ALL copies of the software, database and
documentation, including modifications that you make for internal
use or for distribution.

WordNet 3.1 Copyright 2011 by Princeton University.  All rights reserved.

THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON
UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR
IMPLIED.  BY WAY OF EXAMPLE, BUT NOT LIMITATION, PRINCETON
UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES OF MERCHANT-
ABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE
OF THE LICENSED SOFTWARE, DATABASE OR DOCUMENTATION WILL NOT
INFRINGE ANY THIRD PARTY PATENTS, COPYRIGHTS, TRADEMARKS OR
OTHER RIGHTS.

The name of Princeton University or Princeton may not be used in
advertising or publicity pertaining to distribution of the software
and/or database.  Title to copyright in this software, database and
any associated documentation shall at all times remain with
Princeton University and LICENSEE agrees to preserve same.`;

const src = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--out');
if (!src || !fs.existsSync(src)) {
  console.error('usage: node tools/build-wordnet-lex.mjs <pairs.tsv from tools/wordnet-pairs.py> [--check] [--out file.json] [--no-hyp]');
  process.exit(2);
}

loadCorpus();
const g = /** @type {any} */ (globalThis);
const STOP = g.VotSearchData.STOP_WORDS_TRIMMED;
const vocab = await corpusVocabulary((s) => joinApostropheS(kjvEncode(s)));
const content = (/** @type {string} */ w) => w.length >= 3 && /^[a-z]+$/.test(w) && !STOP.has(w) && vocab.has(w);

/** Does align.js already credit typed `a` against text `b` at least `s`? */
function known(/** @type {string} */ a, /** @type {string} */ b, /** @type {number} */ s) {
  const e = alignClasses([a], { stop: STOP }).entry(b);
  for (let i = 0; i < e.c.length; i += 2) if (e.c[i + 1] >= s) return true;
  return false;
}

/** @type {Array<[string, string, number]>} */
const kept = [];
const stats = { read: 0, outside: 0, sameLemma: 0, shared: 0, farKind: 0, known: 0 };
const lines = fs.readFileSync(src, 'utf8').split('\n').filter(Boolean).sort();
for (const line of lines) {
  const [a, b, rel, ra, rb] = line.split('\t');
  if (NO_HYP && rel === 'hyp') continue;
  stats.read++;
  if (!content(a) || !content(b)) { stats.outside++; continue; }
  const la = lemma(a);
  const lb = lemma(b);
  if (la === lb || !/^[a-z]+$/.test(la + lb)) { stats.sameLemma++; continue; }
  if (underOtherWord(a, vocab, lemma) || underOtherWord(b, vocab, lemma)) { stats.shared++; continue; }
  const s = wordnetCredit(rel, +ra, +rb);
  if (s === null) { stats.farKind++; continue; }
  if (known(a, b, s) && known(b, a, s)) { stats.known++; continue; }
  kept.push([la, lb, s]);
}

const lex = formatLexicon(kept);
const hist = new Map();
for (const l of lex.split('\n')) for (const p of l.split(' ').slice(1)) hist.set(p.slice(-1), (hist.get(p.slice(-1)) || 0) + 1);
const body = lexiconAsset({
  name: NO_HYP ? 'wordnet-synonyms' : 'wordnet',
  about: 'Word pairs a reader trades when quoting from memory, each with the share of a typed word\'s weight '
    + 'align.js gives the text that says its partner in its place (search200 B7). Keys are light lemmas '
    + '(search/passage.js), so a pair covers its forms; format: search/lexicon.js. 0.7 one WordNet synset and 0.6 '
    + 'a similar-to link, both among the two words\' two most frequent senses; 0.5 either through a less frequent '
    + 'sense' + (NO_HYP ? '' : ', or a direct hypernym link among the most frequent senses') + '. Both words are '
    + 'held by the corpus the app searches. Generated: do not edit.',
  source: 'WordNet 3.1, Princeton University, https://wordnet.princeton.edu/ '
    + '(https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz)',
  license: WORDNET_NOTICE,
  generator: 'tools/wordnet-pairs.py, then tools/build-wordnet-lex.mjs',
}, lex);
const pairs = JSON.parse(body).pairs;
const report = `[wordnet-lex] ${stats.read} WordNet pairs: ${stats.outside} with a word outside the corpus or a stop word, ${stats.sameLemma} one lemma, ${stats.shared} under another word's lemma, ${stats.farKind} a kind of the other through a rarer sense, ${stats.known} already credited -> ${pairs} lemma pairs (credits ${JSON.stringify([...hist.entries()].sort())}), ${body.length} bytes`;
if (process.argv.includes('--check')) {
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (now !== body) {
    console.error(`[wordnet-lex] ${path.relative(process.cwd(), OUT)} is stale: run the two steps in this file's header`);
    process.exit(1);
  }
  console.log(report.replace(/ -> .*/, ': current'));
} else {
  fs.writeFileSync(OUT, body);
  console.log(report);
}
