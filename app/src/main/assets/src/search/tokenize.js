/* ═══════════════════════════════════════════════════════════════════════
   search/tokenize.js — shared tokenizer + archaic-pronoun folding
   ═══════════════════════════════════════════════════════════════════════
   `kjvEncode` is the ONE tokenizer used on BOTH sides of the engine — it is
   MiniSearch's `tokenize` (and processTerm is identity, since tokenize already
   folds), so index-time and query-time tokens are identical, and it backs the
   contiguous-phrase check in ranking.js. Folding rules (ported from the
   FlexSearch engine):
     1. lowercase
     2. strip diacritics (NFD → drop combining marks) — but ONLY when a non-ASCII
        char is present, so the all-ASCII corpus skips the costly normalize at
        index time while accented queries ("resurrección") still fold
     3. punctuation/symbols → space, then split on whitespace
     4. normalize archaic pronouns (thee/thou/ye→you, thy/thine→your) so KJV/ASV
        wording matches modern-translation wording and vice versa.
     5. a number word is its digits ("Part Two" → part 2; "one" aside), "&" is "and",
        and a negative contraction its two words ("don't", "dont" → do not): search200 B2.
   `expandArchaicTerms` is the reverse: a query token expands to every form it
   should HIGHLIGHT/snippet on ("you" highlights "thee"/"thou"/"ye").
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Bidirectional archaic→modern normalization, applied at index AND query time.
 * Conservative: the pronouns, and (2026-09-27) the archaic AUXILIARIES that have
 * exactly one modern form (shalt, wilt, hast, hath, doth, dost, didst, canst), so
 * a verse quoted in KJV wording ("thou shalt not", "the LORD hath") lines up with
 * the NKJV text word for word and the phrase ranking can see it. General
 * verb-form stemming (saith/says, cometh/comes) stays out: it would cost precision
 * for little gain, and search/word-forms.js reaches those families at query time.
 * A table of its own keys: a plain object turned the token 'constructor' into Object's function (sweep W24).
 * @type {Object<string,string>}
 */
export const ARCHAIC_NORMALIZE = Object.assign(Object.create(null), {
  thee: 'you',
  thou: 'you',
  ye: 'you',
  thy: 'your',
  thine: 'your',
  thyself: 'yourself',
  // the archaic auxiliaries (one modern form each)
  shalt: 'shall',
  wilt: 'will',
  hast: 'have',
  hath: 'has',
  doth: 'does',
  dost: 'do',
  didst: 'did',
  canst: 'can',
});

/* A NUMBER IS ONE TOKEN HOWEVER IT IS WRITTEN (search200 B2, 2026-10-18). "Part Two" and
   "part 2" were different words, so a title typed with its number in digits (or written
   with digits and typed in words) matched only its other words and a denser neighbour led
   it. Two through twenty and the tens are their digits, first through twentieth and the
   tens' ordinals are 1st-20th, 30th...; a tens word and a units word ("twenty-four",
   "twenty-first") are one number (24, 21st); "twenty and four" stays three words, as the
   KJV writes it. Hundred and thousand stay words. "One" stays a word: it is mostly no
   number ("the one who", "no one", "one another", "the Holy One"), and as 1 it met every
   date and "Volume 1" an Answers topic cites (a sealed paraphrase lost its text so); a
   title's "One" is matched as 1 where titles are compared (ranking.js titleNumbers). */
const UNIT_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const UNIT_ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
const TENS_WORDS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const TENS_ORDINALS = ['twentieth', 'thirtieth', 'fortieth', 'fiftieth', 'sixtieth', 'seventieth', 'eightieth', 'ninetieth'];
/** @param {number} n */
const ordinal = (n) => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
/**
 * Each number word or ordinal → its digits (index AND query time).
 * @type {Object<string,string>}
 */
export const NUMBER_FOLD = (function () {
  /** @type {Object<string,string>} */
  const m = Object.create(null);
  UNIT_WORDS.forEach((w, i) => { if (i) m[w] = String(i + 1); });   // not "one" (above)
  UNIT_ORDINALS.forEach((w, i) => { m[w] = ordinal(i + 1); });
  TENS_WORDS.forEach((w, i) => { m[w] = String(20 + 10 * i); });
  TENS_ORDINALS.forEach((w, i) => { m[w] = ordinal(20 + 10 * i); });
  return m;
})();

/* A NEGATIVE CONTRACTION IS ITS TWO WORDS (search200 B2). "don't look back" found its letter
   at #119, "do not look back" at #1 (the engine's expandContractions spells a typed one out);
   a reader types it without the apostrophe as often ("dont", sr11 t216), and the texts that
   contract (six Answers topics, two study chapters) indexed it as "don" and "t". Both sides
   now read "don't" and "dont" as "do not", "can't" and "cant" as "cannot", "won't" as "will
   not". A contraction typed bare is read so here, token by token, and the query keeps the
   word as typed: spelled out in the query string, it changed what the meaning model and the
   stop-word filter were given, and a sealed paraphrase lost its verse (sr11 saw the same).
   "wont" is no contraction here: the KJV's word ("the ox was wont to gore"). */
/** The bases a negative contraction leaves before its "nt", where they are not the word. */
const NT_BASE = Object.assign(Object.create(null), { wo: 'will', sha: 'shall', ai: 'am' });
/** The bases a contraction typed without its apostrophe is read for (never "wo": "wont"). */
const NT_BARE_BASES = ['ca', 'do', 'does', 'did', 'is', 'are', 'was', 'were', 'has', 'have', 'had',
  'could', 'would', 'should', 'must', 'need', 'sha', 'ai'];
/** Every base a written contraction's "n't" follows ("wo" of won't too). */
const NT_BASES = NT_BARE_BASES.concat(['wo', 'might', 'ought', 'dare']);
/**
 * The words a negative contraction's base stands for: "ca" → "cannot", "do" → "do not".
 * @param {string} base  lowercase, as the contraction leaves it ("do" of don't, "wo" of won't)
 * @returns {string}
 */
export function negationOf(base) {
  return base === 'ca' ? 'cannot' : (NT_BASE[base] || base) + ' not';
}
/** @typedef {{to: string, split?: string[], tens?: boolean, unit?: string, nt?: boolean, thousands?: boolean}} Fold */
/**
 * Every token kjvEncode folds, in one table so a plain word costs one lookup (the folds work
 * token by token, never as a scan of the string: a scan of every text for "n't" and " 000"
 * cost a fifth more index time). `to` is its folded token; `split` its words (a contraction
 * typed bare); `tens` marks a tens word, and `unit` a units word's digits or ordinal (1-9),
 * which join a tens word before it; `nt` is the "t" of a written contraction ("don" + "t");
 * `thousands` is a "000" that a number before it takes ("144 000").
 * @type {Object<string, Fold>}
 */
const FOLD = (function () {
  /** @type {Object<string, Fold>} */
  const m = Object.create(null);
  for (const w in ARCHAIC_NORMALIZE) m[w] = { to: ARCHAIC_NORMALIZE[w] };
  for (const w in NUMBER_FOLD) m[w] = { to: NUMBER_FOLD[w] };
  for (const w of TENS_WORDS) m[w].tens = true;
  for (let i = 0; i < 9; i++) {
    (m[UNIT_WORDS[i]] = m[UNIT_WORDS[i]] || { to: UNIT_WORDS[i] }).unit = String(i + 1);   // "one" stays a word alone
    m[UNIT_ORDINALS[i]].unit = ordinal(i + 1);
  }
  for (const b of NT_BARE_BASES) m[b + 'nt'] = { to: b + 'nt', split: negationOf(b).split(' ') };
  m.t = { to: 't', nt: true };
  m['000'] = { to: '000', thousands: true };
  return m;
})();
/** The word a written contraction's "t" follows → the words they stand for ("don" + "t" → do, not). */
const NT_BEFORE_T = (function () {
  /** @type {Object<string,string[]>} */
  const m = Object.create(null);
  for (const b of NT_BASES) m[b + 'n'] = negationOf(b).split(' ');
  return m;
})();

/* A NAME WRITTEN WITH AN INNER APOSTROPHE IS ONE WORD (search200 fix1). The letters write "Sha’ul",
   "Sh’khinah", "Tz’va’ot" and the editions "Hoshia'na", "Ba‘al": each split into two tokens ("sha" "ul"),
   so a reader's "shaul" never met them, and the letter holding "Well did My servant Sha’ul" ranked #20.
   An apostrophe between a letter and letters running to the word's end joins them, unless that tail is an
   English clitic: the "s" of a possessive, the "t" of a negative contraction, and "ll", "re", "ve", "d", "m"
   ("you’re", "I’m") stay apart, as their folds read them. */
const APOSTROPHES = /['’‘ʼ]/;
const CLITICS = new Set(['s', 't', 'll', 're', 've', 'd', 'm']);
const INNER_APOSTROPHE = /(?<=[a-z])['’‘ʼ]([a-z]+)(?![a-z0-9])/g;

/**
 * Tokenize + fold a string into normalized tokens.
 * @param {string} str
 * @returns {string[]}
 */
export function kjvEncode(str) {
  if (typeof str !== 'string' || !str) return [];
  let s = str.toLowerCase();
  // NFD-fold ONLY when a non-ASCII char is present (`[^ -~]` = anything outside
  // printable ASCII). The English corpus is ASCII, so this skips normalize on
  // ~every field at index time; accented queries still fold. ̀-ͯ are the
  // combining diacritical marks dropped after decomposition.
  if (/[^ -~]/.test(s)) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (APOSTROPHES.test(s)) s = s.replace(INNER_APOSTROPHE, (m, tail) => (CLITICS.has(tail) ? m : tail));
  // A number written with thousands separators is one number: "144,000" is the
  // token 144000, as a reader types it (it split into 144 and 000). A space between
  // the thousands is a separator too ("144 000", joined below), but only before "000":
  // "psalm 119 105" is a chapter and a verse.
  if (s.indexOf(',') >= 0) s = s.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  if (s.indexOf('&') >= 0) s = s.replace(/&/g, ' and ');
  const out = [];
  foldTokens(s.replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/), out, null, null);
  return out;
}

/**
 * The folds of the split words, into `out`: the loop kjvEncode and kjvEncodeAt share, so the two read the same
 * tokens. With `starts` (each split word's start in the text), each token's start goes to `outStarts`: a token
 * two words make (24, 144000, "do" of "don't") starts where the first does.
 * @param {string[]} tokens @param {string[]} out @param {number[]|null} starts @param {number[]|null} outStarts
 */
function foldTokens(tokens, out, starts, outStarts) {
  let tensAt = -1;   // the out index of a tens word just pushed: a units word next joins it
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    const f = FOLD[t];
    if (!f) { out.push(t); if (outStarts) outStarts.push(/** @type {number[]} */ (starts)[i]); continue; }
    if (f.unit && tensAt >= 0 && tensAt === out.length - 1) {
      // "twenty" + "four" is 24; "twenty" + "first" is 21st (the units' suffix is the number's)
      out[tensAt] = out[tensAt][0] + f.unit;
      tensAt = -1;
      continue;
    }
    if (f.nt && out.length) {
      // a written contraction: "don't" and "don’t" split as "don" + "t" ("do not"; "can't" is "cannot")
      const w = NT_BEFORE_T[out[out.length - 1]];
      if (w) {
        out[out.length - 1] = w[0];
        if (w.length > 1) { out.push(w[1]); if (outStarts) outStarts.push(outStarts[outStarts.length - 1]); }
        continue;
      }
    }
    if (f.thousands && out.length && /^\d+$/.test(out[out.length - 1])) { out[out.length - 1] += '000'; continue; }
    if (f.split) {
      for (let j = 0; j < f.split.length; j++) { out.push(f.split[j]); if (outStarts) outStarts.push(/** @type {number[]} */ (starts)[i]); }
      continue;
    }
    out.push(f.to);
    if (outStarts) outStarts.push(/** @type {number[]} */ (starts)[i]);
    if (f.tens) tensAt = out.length - 1;
  }
}

/** A thousands comma kjvEncode drops: a digit before it, three digits and no fourth after (`s[at]` the first). */
function thousandsComma(/** @type {string} */ s, /** @type {number} */ at) {
  const d = (/** @type {number} */ i) => { const c = s.charCodeAt(i); return c >= 48 && c <= 57; };
  return s.charCodeAt(at - 1) === 44 && d(at - 2) && d(at) && d(at + 1) && d(at + 2) && !d(at + 3);
}

/**
 * kjvEncode's tokens, each with where it starts in `str` (search200 B3: a run found in a text's tokens lands on
 * its place in the text). kjvEncode rewrites the string before it splits it; this reads the same rewrites in
 * place: the lowercase and accent folds through a map back to `str` when they change its length, "&" as "and",
 * and a thousands comma joining a number's two sides. The folds after the split are kjvEncode's own (foldTokens).
 * search/exact-runs.test.js holds the two to the same tokens.
 * @param {string} str
 * @returns {{tokens: string[], starts: number[]}}
 */
export function kjvEncodeAt(str) {
  /** @type {string[]} */ const tokens = [];
  /** @type {number[]} */ const starts = [];
  if (typeof str !== 'string' || !str) return { tokens, starts };
  let s = str.toLowerCase();
  /** @type {number[]|null} where each char of `s` came from in `str`; null: the same place */
  let from = null;
  // the accent fold, on the chars outside printable ASCII alone (the rest it leaves as they are)
  let moved = s.length !== str.length;
  if (!moved && /[^ -~]/.test(s)) {
    const f = s.replace(/[^ -~]/g, (c) => { const d = c.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); if (d.length !== 1) moved = true; return d; });
    if (!moved) s = f;
  }
  if (moved) {
    // a fold that changes the length (a mark dropped, a capital lowercased to two): a char at a time, mapped
    let f = '';
    from = [];
    for (let i = 0; i < str.length; i++) {
      let c = str[i].toLowerCase();
      if (/[^ -~]/.test(c)) c = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      f += c;
      for (let k = 0; k < c.length; k++) from.push(i);
    }
    s = f;
  }
  /** @type {string[]} */ const raw = [];
  /** @type {number[]} */ const rawAt = [];
  const re = /[a-z0-9]+|&/g;
  let end = -1;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const at = m.index;
    const w = m[0];
    if (w !== '&' && raw.length && end === at - 1 && thousandsComma(s, at)) raw[raw.length - 1] += w;
    // an inner apostrophe joins a name's two sides, as kjvEncode reads it ("sha’ul" is shaul)
    else if (w !== '&' && raw.length && end === at - 1 && APOSTROPHES.test(s[at - 1]) && /^[a-z]+$/.test(w) && !CLITICS.has(w) && /[a-z]$/.test(raw[raw.length - 1])) raw[raw.length - 1] += w;
    else { raw.push(w === '&' ? 'and' : w); rawAt.push(from ? from[at] : at); }
    end = at + w.length;
  }
  foldTokens(raw, tokens, rawAt, starts);
  return { tokens, starts };
}

/**
 * Reverse-expansion map: each token → every form it should visually match.
 * Built from ARCHAIC_NORMALIZE so it's bidirectional by construction
 * ("you"→[you,thee,thou,ye]; "thee"→[thee,you,thou,ye]).
 * @type {Object<string,string[]>}
 */
export const ARCHAIC_EXPAND = (function () {
  /** @type {Object<string,string[]>} */
  const m = Object.create(null);
  const pairs = Object.keys(ARCHAIC_NORMALIZE);
  for (let i = 0; i < pairs.length; i++) {
    const archaic = pairs[i];
    const modern = ARCHAIC_NORMALIZE[archaic];
    (m[modern] = m[modern] || [modern]).push(archaic);
    m[archaic] = m[archaic] || [archaic, modern];
  }
  // Second pass: every archaic form also sees its siblings (forms that map to
  // the same modern word) — so "thee" highlights "thou" too.
  for (const a in m) {
    const modernForm = ARCHAIC_NORMALIZE[a];
    if (!modernForm) continue;
    const siblings = m[modernForm];
    for (let j = 0; j < siblings.length; j++) {
      if (m[a].indexOf(siblings[j]) < 0) m[a].push(siblings[j]);
    }
  }
  // A number highlights in either spelling (B2): "6" marks "Six", "six" marks "6", and a
  // compound marks its hyphenated words ("24" marks "twenty-four").
  /** @param {string} a @param {string} b */
  const twin = (a, b) => {
    (m[a] = m[a] || [a]).push(b);
    (m[b] = m[b] || [b]).push(a);
  };
  for (const w in NUMBER_FOLD) twin(NUMBER_FOLD[w], w);
  TENS_WORDS.forEach((tw, i) => {
    for (let u = 0; u < 9; u++) {
      const n = 20 + 10 * i + u + 1;
      twin(String(n), tw + '-' + UNIT_WORDS[u]);
      twin(ordinal(n), tw + '-' + UNIT_ORDINALS[u]);
    }
  });
  return m;
})();

/**
 * Expand query terms to all forms to highlight on, deduped.
 * @param {string[]} terms
 * @returns {string[]}
 */
export function expandArchaicTerms(terms) {
  if (!terms || !terms.length) return [];
  const out = [];
  const seen = Object.create(null);
  for (let i = 0; i < terms.length; i++) {
    const t = (terms[i] || '').toLowerCase();
    if (!t) continue;
    const variants = ARCHAIC_EXPAND[t] || [t];
    for (let j = 0; j < variants.length; j++) {
      if (!seen[variants[j]]) {
        seen[variants[j]] = true;
        out.push(variants[j]);
      }
    }
  }
  return out;
}
