/* The tri bench's word tables and token rules (search200, 2026-10-18), shared by make-tri.mjs (which target can take
   which form) and check-tri.mjs (Gate A: is the query the form its target names). Pure: no corpus, no engine.
   ─────────────────────────────────────────────────────────────────
   A CONTENT word is any token not in FUNCTION (the engine's 60 stop words plus the other small words of the Bible's
   and the letters' English: shall, unto, thee, not, all, who...). Tokens are corpus.mjs norm(): lowercase letters
   and digits, apostrophes dropped ("Lord's" -> "lords"), everything else a space.
   ─────────────────────────────────────────────────────────────────── */

/** corpus.mjs norm, inlined so this module stays pure. */
export const norm = (s) => ' ' + String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[’‘']/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
export const toks = (s) => norm(s).trim().split(' ').filter(Boolean);

export const FUNCTION = new Set(('the a an and or but nor in on at to for of with by from that this these those is was are were be been being '
  + 'have has had do does did as if than then so yet him his her hers he she they their theirs them we our ours you your yours it its i me '
  + 'my mine us said not no all who whom whose which what when where why how there here shall will would should can could may might must '
  + 'unto upon into onto out up down over under thee thou thy thine ye o oh am also even very just only such own each every any some more '
  + 'most much many let like about through because before after while until again now yea lo hath doth art wilt shalt dost cannot nay '
  + 'himself herself myself yourself yourselves themselves ourselves itself thyself whoever whatever whom whomever').split(' '));
export const isContent = (t) => !!t && !FUNCTION.has(t);
export const contentOf = (ts) => ts.filter(isContent);
/** The small words brief-exact.md lists for common-words (all in FUNCTION): what a writer counts, so make-tri gives
    that form only sentences holding a window that is 60% small words by this list. Keep in step with the brief. */
export const BRIEF_SMALL = new Set(('the a an and or but nor so not no o of to in on at by for with from up as that this it i you he she we '
  + 'they me him her us them my your his its our their thee thou thy ye is are was were be been have has had shall will do did').split(' '));

// ── numbers ──
export const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000 };
export const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12 };
const ordSuffix = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
/** A number word or ordinal as digits ("seven" -> "7", "first" -> "1st"); anything else unchanged. */
export const numFold = (t) => (NUM_WORDS[t] != null ? String(NUM_WORDS[t]) : ORDINALS[t] != null ? ordSuffix(ORDINALS[t]) : t);
export const isNumWord = (t) => NUM_WORDS[t] != null || ORDINALS[t] != null;
export const isDigitTok = (t) => /^\d+(st|nd|rd|th)?$/.test(t);
/** A title holding a real number: a digit, a number word other than a bare "one" ("no one"), or "part/section one". */
export function holdsNumber(title) {
  const t = toks(title);
  return t.some((w, i) => isDigitTok(w) || (isNumWord(w) && (w !== 'one' || /^(part|section|chapter|volume|book|day|letter|number)$/.test(t[i - 1] || '') || /^(hundred|thousand)$/.test(t[i + 1] || ''))));
}

/** The typed forms a phone makes (exact hard, typed-forms): what a text offers to type differently. 2 = an apostrophe,
    a number word or a hyphenated word; 1 = only "and" (for "&"); 0 = nothing. */
export function typedStrength(text) {
  const s = String(text);
  if (/\p{L}['’]\p{L}/u.test(s) || /\p{L}-\p{L}/u.test(s) || toks(s).some(isNumWord) || /\d/.test(s)) return 2;
  return /\band\b/i.test(s) ? 1 : 0;
}
/** Fold a typed run for the run test: "&" -> and, numbers -> digits, and no spaces, so "well being" / "wellbeing" /
    "well-being" and "dont" / "don't" all meet. */
export const typedFold = (s) => toks(String(s).replace(/&/g, ' and ')).map(numFold).join('');

// ── register (misremembered hard, register) ──
const OLD_NEW = [['thee', 'you'], ['thou', 'you'], ['ye', 'you'], ['thy', 'your'], ['thine', 'your'], ['thine', 'yours'], ['shall', 'will'],
  ['shalt', 'will'], ['wilt', 'will'], ['saith', 'says'], ['unto', 'to'], ['hath', 'has'], ['doth', 'does'], ['dost', 'do'], ['art', 'are'],
  ['spake', 'spoke'], ['thyself', 'yourself'], ['yea', 'yes'], ['nay', 'no'], ['shall', 'would'], ['ye', 'your']];
const PAIR = new Set(OLD_NEW.flatMap(([a, b]) => [a + '|' + b, b + '|' + a]));
const ETH_NOT = new Set(['beneath', 'teeth', 'seth', 'heth', 'japheth', 'elizabeth', 'nazareth', 'shibboleth', 'goliath']);
const archEth = (w) => w.length >= 5 && w.endsWith('eth') && !w.endsWith('ieth') && !ETH_NOT.has(w);
/** Is a -> b a swap of register (old <-> new wording), either way round? */
export function registerPair(a, b) {
  if (!a || !b || a === b) return false;
  if (PAIR.has(a + '|' + b)) return true;
  const ethNew = (old, nw) => { if (!archEth(old)) return false; const st = old.slice(0, -3); return nw === st + 's' || nw === st + 'es' || nw === st + 'ies'.slice(1) || (st.endsWith('i') && nw === st.slice(0, -1) + 'ies'); };
  const estNew = (old, nw) => { if (old.length < 6 || !old.endsWith('est')) return false; const st = old.slice(0, -3); return nw === st || nw === st + 'e' || (st.endsWith('d') && nw === st.slice(0, -1)); };
  return ethNew(a, b) || ethNew(b, a) || estNew(a, b) || estNew(b, a);
}
const SWAPPABLE = new Set(['thee', 'thou', 'ye', 'thy', 'thine', 'you', 'your', 'yours', 'shall', 'shalt', 'will', 'wilt', 'saith', 'says',
  'unto', 'hath', 'doth', 'dost', 'art', 'spake', 'thyself', 'yourself']);
/** Words a register swap can change: the table's words, -eth verbs, and -est verbs where "thou" is about. */
export function swappableCount(text) {
  const t = toks(text);
  const thou = t.includes('thou');
  return t.filter((w) => SWAPPABLE.has(w) || archEth(w) || (thou && w.length >= 6 && w.endsWith('est'))).length;
}

const OLD_REQUIRED = new Set(['thee', 'thou', 'ye', 'thy', 'thine', 'thyself', 'shalt', 'wilt', 'saith', 'hath', 'doth', 'dost', 'spake', 'unto']);
/** An old-register word a "register" misquote must swap wherever it stands (shall and art are optional: modern
    English and the NKJV keep shall, and art is also a noun). */
export const isOldWord = (w, thou) => OLD_REQUIRED.has(w) || archEth(w) || (!!thou && w.length >= 6 && w.endsWith('est'));

// ── collection words (title hard, collection-word) ──
export const COLLECTION_WORDS = ['words to live by', 'wtlb', 'volume', 'vol', 'letters', 'letter', 'rebuke', 'flock', 'little flock',
  'timothy', 'blessed', 'answers', 'answer', 'study', 'studies', 'bible study', 'holy days', 'matthew', 'part one', 'part two',
  'more than a man', 'lamb of god', 'scriptures of truth'];

// ── edit scripts and alignments over tokens ──
/** Word-level edit script turning a into b: [{op:'eq'|'sub'|'del'|'ins', a, b}] (Levenshtein, deterministic backtrace). */
export function editScript(a, b) {
  const n = a.length; const m = b.length;
  const d = Array.from({ length: n + 1 }, (_, i) => { const r = new Array(m + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const ops = [];
  for (let i = n, j = m; i > 0 || j > 0;) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) { ops.push({ op: 'eq', a: a[i - 1], b: b[j - 1] }); i--; j--; }
    else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) { ops.push({ op: 'sub', a: a[i - 1], b: b[j - 1] }); i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push({ op: 'del', a: a[i - 1] }); i--; }
    else { ops.push({ op: 'ins', b: b[j - 1] }); j--; }
  }
  return ops.reverse();
}
export const slips = (ops) => ops.filter((o) => o.op !== 'eq');
/** A slip touching a content word (either side of a substitution, or the word added or dropped). */
export const contentSlip = (o) => o.op !== 'eq' && (isContent(o.a) || isContent(o.b));

/** Levenshtein distance between two strings (letters). */
export function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } }
  return d[b.length];
}
/** Longest common subsequence length of two token arrays. */
export function lcs(a, b) {
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) { const cur = [0]; for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; }
  return prev[b.length];
}
/** Is q an in-order subsequence of t (both token arrays)? */
export function isSubseq(q, t) { let j = 0; for (const w of t) if (j < q.length && w === q[j]) j++; return j === q.length; }
/** A crude stem: one inflection off ("loves", "loved", "loving", "loveth" -> "lov"), for "kept the word" tests. */
export const stem = (w) => w.length <= 4 ? w : w.replace(/(eth|est|ing|ed|es|s|e)$/, '');

// ── titles ──
/** A run of number words as one number ("twenty thousand" -> "20000", "one hundred five" -> "105"), ordinals as
    "1st"...; other tokens numFold()ed. A bare "one" starts no run ("no one" -> "no 1", the same on both sides). */
export function foldNumbers(t) {
  const out = [];
  for (let i = 0; i < t.length;) {
    if (NUM_WORDS[t[i]] == null || (t[i] === 'one' && NUM_WORDS[t[i + 1]] == null)) { out.push(numFold(t[i])); i++; continue; }
    let total = 0; let cur = 0;
    for (; i < t.length && NUM_WORDS[t[i]] != null; i++) {
      const n = NUM_WORDS[t[i]];
      if (n === 100) cur = (cur || 1) * 100; else if (n === 1000) { total += (cur || 1) * 1000; cur = 0; } else cur += n;
    }
    out.push(String(total + cur));
  }
  return out;
}
/** Title tokens as typed: numbers as digits (a run of number words as one number), a split possessive joined ("lord s"
    -> "lords"), "&" as "and"; plurals kept. Index for index the same tokens titleFold() gives. */
export function titleTokens(s) {
  const t = toks(String(s).replace(/&/g, ' and ').replace(/(\p{L})['’]\s*s\b/gu, '$1s'));
  const out = [];
  for (let i = 0; i < t.length; i++) { if (t[i] === 's' && out.length) { out[out.length - 1] += 's'; continue; } out.push(t[i]); }
  return foldNumbers(out);
}
/** A trailing s dropped from a word of 4+ letters (plurals and possessives meet). */
export const dropS = (w) => (w.length >= 4 && w.endsWith('s') && !/ss$/.test(w) ? w.slice(0, -1) : w);
/** titleTokens() with plurals folded too (dropS). */
export const titleFold = (s) => titleTokens(s).map(dropS);
/** The title as the easy "lowercase" form types it: lowercase, apostrophes dropped, other punctuation gone. */
export const lowerPlain = (s) => norm(s).trim();
/** One-letter edit or two on a word of 5+ letters: the same word mistyped. Takes the words as typed (titleTokens, not
    titleFold): the 5 letters count before any plural fold ("times" takes a typo though "time" has 4), and a change that
    only adds or drops a plural s is no typo. */
export const typoOf = (q, t) => q !== t && t.length >= 5 && q.length >= 4 && lev(q, t) <= 2 && q[0] === t[0] && dropS(q) !== dropS(t);
/** Equal after title folding, or one edit apart on a 5+ letter word (Gate B's fuzzy title match). */
export const titleTokEq = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && lev(a, b) <= 1);
export const ARTICLE = /^\s*(the|a|regarding)\s+/i;
