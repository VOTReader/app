/* Gate A, conformity (PLAN 1.5; search200, 2026-10-18): is a writer's query the form its target names?
   ─────────────────────────────────────────────────────────────────
   Pure: judged from q (and, misremembered, `from`) against the target's own words, never the engine. The rules are the
   tier table of PLAN 1.2 as the briefs (tri/brief-*.md) put them:
     exact          q is a run of `remembered` (case and punctuation aside); per form its length, content words and place
                    (start / middle / end / across the boundary), typed-forms a run once & / digits / apostrophes /
                    hyphens are folded, with at least one such change made
     misremembered  `from` is a run of `remembered`; slips = the word-level edit distance from `from` to q; hard keeps
                    40% of `from`'s content words and is never a run of the target; reordered, register, merged and
                    half each checked for their own shape
     title          medium: q's words (folded) an in-order subset of the title's, never the whole title (number-swap and
                    punct-swap: the whole title typed differently, never an easy form); hard: 50% of the title's content
                    words kept and never an in-order subset of the words as typed (plurals kept: a plural changed is a
                    word wrong, and a typo is measured on the whole word), then the form's own shape
   gateA(target, {q, from}) -> { pass, why: [codes], meta }. Codes name the rule, never the query.
   ─────────────────────────────────────────────────────────────────── */
import { FUNCTION, toks, norm, isContent, contentOf, numFold, foldNumbers, isNumWord, isDigitTok, typedFold, registerPair, isOldWord,
  COLLECTION_WORDS, editScript, slips, contentSlip, isSubseq, stem, titleFold, titleTokens, lowerPlain, typoOf, titleTokEq, ARTICLE } from './lex.mjs';

/** Where q's tokens stand as a run inside r's tokens. */
export function occurrences(q, r) {
  const out = [];
  if (!q.length) return out;
  for (let i = 0; i + q.length <= r.length; i++) { let k = 0; while (k < q.length && r[i + k] === q[k]) k++; if (k === q.length) out.push(i); }
  return out;
}
const lowerRaw = (s) => String(s).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const canon = (s) => String(s).replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const words = (s) => (String(s).trim().match(/\S+/g) || []).length;

/** The window of r's tokens a typed-forms query folds to (& -> and, numbers -> digits, spaces and hyphens gone), or null. */
export function typedRun(q, r) {
  const target = typedFold(q);
  if (!target) return null;
  const f = r.map(numFold);
  for (let i = 0; i < f.length; i++) { let s = ''; for (let j = i; j < f.length && s.length < target.length; j++) { s += f[j]; if (s === target) return [i, j + 1]; } }
  return null;
}
/** How many typed changes q makes against the raw text: & for and, a digit for a number word, an apostrophe dropped,
    a hyphen split or joined, two words joined. */
export function typedChanges(q, text) {
  const ql = lowerRaw(q); const tl = lowerRaw(text); const qt = toks(q); const tt = toks(text);
  let n = 0;
  if (/&/.test(q) && tt.includes('and')) n++;
  if (qt.some((w) => isDigitTok(w) && tt.some((x) => isNumWord(x) && numFold(x) === w))) n++;
  const has = (hay, w) => new RegExp('(^|[^a-z0-9\'-])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9\'-])').test(hay);
  for (const aw of new Set(tl.match(/[a-z0-9]+(?:'[a-z0-9]+)+|[a-z]+s'(?![a-z])/g) || [])) if (has(ql, aw.replace(/'/g, '')) && !ql.includes(aw)) n++;
  for (const hw of new Set(tl.match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) || [])) { const p = hw.split('-'); if ((ql.includes(p.join(' ')) || has(ql, p.join(''))) && !ql.includes(hw)) n++; }
  const ts = new Set(tt);
  for (const w of qt) if (!ts.has(w)) for (let i = 0; i + 1 < tt.length; i++) if (tt[i] + tt[i + 1] === w) { n++; break; }
  for (const hw of new Set(ql.match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) || [])) if (!tl.includes(hw) && occurrences(hw.split('-'), tt).length) n++;
  return n;
}

/** Share of `from`'s content words that q keeps (the same word or its stem; each used once). */
export function retention(from, q) {
  const cf = contentOf(from);
  if (!cf.length) return 1;
  const pool = q.map(stem); let kept = 0;
  for (const w of cf) { const i = pool.indexOf(stem(w)); if (i >= 0) { kept++; pool[i] = null; } }
  return kept / cf.length;
}
const dist = (a, b) => slips(editScript(a, b)).length;
/** The fewest slips left once one chunk of 2+ words of `from` is moved elsewhere (a reordered misquote). */
export function bestMove(f, q) {
  let best = Infinity;
  for (let i = 0; i < f.length; i++) for (let j = i + 2; j <= f.length; j++) {
    const chunk = f.slice(i, j); const rest = f.slice(0, i).concat(f.slice(j));
    for (let k = 0; k <= rest.length; k++) { if (k === i) continue; const d = dist(rest.slice(0, k).concat(chunk, rest.slice(k)), q); if (d < best) best = d; }
  }
  return best;
}
/** Levenshtein tables over token prefixes: T[a][k] = distance(f[0:a], q[0:k]). */
function prefixTable(f, q) {
  const T = Array.from({ length: f.length + 1 }, (_, a) => { const r = new Array(q.length + 1).fill(0); r[0] = a; return r; });
  for (let k = 0; k <= q.length; k++) T[0][k] = k;
  for (let a = 1; a <= f.length; a++) for (let k = 1; k <= q.length; k++) T[a][k] = Math.min(T[a - 1][k] + 1, T[a][k - 1] + 1, T[a - 1][k - 1] + (f[a - 1] === q[k - 1] ? 0 : 1));
  return T;
}
/** A merged misquote: q = the start of `from` (in the first sentence) + its end (in the second), a middle of 2+ words
    gone. fromAt: where `from` starts in the span; n1: the first sentence's token count. Returns the fewest slips left
    (d) and the words that fit keeps (from[0:a] + from[b:]). */
export function mergedFit(f, q, fromAt, n1) {
  const P = prefixTable(f, q);
  const S = prefixTable(f.slice().reverse(), q.slice().reverse()); // S[x][y] = distance(f's last x, q's last y)
  let best = { d: Infinity, kept: [] };
  for (let a = 1; a < f.length; a++) {
    if (fromAt + a > n1) break; // the kept start ends inside the first sentence
    for (let b = Math.max(a + 2, n1 - fromAt); b < f.length; b++) { // the kept end starts inside the second
      for (let k = 1; k < q.length; k++) {
        const d = P[a][k] + S[f.length - b][q.length - k];
        if (d < best.d) best = { d, kept: f.slice(0, a).concat(f.slice(b)) };
      }
    }
  }
  return best;
}

const EXACT = {
  'long-run': { min: 9, max: 14, content: 4 }, 'short-sentence': {}, 'pasted-quoted': { min: 6, max: 14 },
  start: { min: 5, max: 8, content: 2 }, middle: { min: 5, max: 8, content: 2 }, end: { min: 5, max: 8, content: 2 },
  'rare-short': { min: 3, max: 4, content: 2 }, 'common-words': { min: 5, max: 7 }, boundary: { min: 6, max: 10 }, 'typed-forms': { min: 5, max: 10 },
};
function exact(t, q, why, meta) {
  const R = toks(t.remembered); let Q = toks(q);
  const lim = EXACT[t.form];
  if (!lim) { why.push('form?'); return; }
  if (t.form === 'pasted-quoted') {
    const m = /^\s*["“]([\s\S]+)["”]\s*$/.exec(q);
    if (!m) { why.push('not-quoted'); return; }
    Q = toks(m[1]);
    if (!occurrences(Q, R).length) { why.push('not-run'); return; }
    if (!canon(t.remembered).includes(canon(m[1]))) why.push('not-verbatim');
  } else if (t.form === 'typed-forms') {
    const at = typedRun(q, R);
    if (!at) { why.push('not-run'); return; }
    if (!typedChanges(q, t.remembered)) why.push('no-typed-change');
    const n = words(q);
    if (n < lim.min || n > lim.max) why.push(`words:${n}`);
    return;
  }
  const occ = occurrences(Q, R);
  if (!occ.length) { why.push('not-run'); return; }
  const n = Q.length;
  if (lim.min && (n < lim.min || n > lim.max)) why.push(`words:${n}`);
  if (lim.content && Q.filter(isContent).length < lim.content) why.push(`content:${Q.filter(isContent).length}`);
  switch (t.form) {
    case 'long-run': meta.atStart = occ.every((i) => i === 0); break;
    case 'short-sentence': if (n !== R.length) why.push('not-whole-sentence'); break;
    case 'start': if (!occ.includes(0)) why.push('not-start'); break;
    case 'middle': if (!occ.some((i) => i > 0 && i + n < R.length)) why.push('not-middle'); break;
    case 'end': if (!occ.some((i) => i + n === R.length)) why.push('not-end'); break;
    case 'common-words': { const f = Q.filter((w) => FUNCTION.has(w)).length; if (f < 0.6 * n) why.push(`function:${f}/${n}`); break; }
    case 'boundary': {
      if (/[.!?…]/.test(q)) why.push('period');
      const n1 = toks(t.span ? t.span.first : '').length;
      if (!occ.some((i) => i < n1 && i + n > n1)) why.push('not-across');
      break;
    }
    default:
  }
}
function misremembered(t, q, from, why, meta) {
  if (!from || !String(from).trim()) { why.push('no-from'); return; }
  const R = toks(t.remembered); const Q = toks(q); const F = toks(from);
  const at = occurrences(F, R);
  if (!at.length) { why.push('from-not-run'); return; }
  const ops = editScript(F, Q); const s = slips(ops).length; const cs = ops.filter(contentSlip).length;
  meta.slips = s; meta.words = Q.length;
  const len = (lo, hi) => { if (Q.length < lo || Q.length > hi) why.push(`words:${Q.length}`); };
  if (t.tier === 'easy') { len(6, 12); if (s !== 1) why.push(`slips:${s}`); return; }
  if (t.tier === 'medium') { len(6, 14); if (s < 2 || s > 3) why.push(`slips:${s}`); if (!cs) why.push('no-content-slip'); return; }
  // A merged misquote is measured on the words it keeps (the start and the end: its middle is gone by design).
  let fit = null;
  if (t.form === 'merged') {
    const n1 = toks(t.span ? t.span.first : '').length;
    const ok = at.filter((i) => i < n1 && i + F.length > n1);
    if (!ok.length) { why.push('from-not-across'); return; }
    fit = ok.map((i) => mergedFit(F, Q, i, n1)).sort((x, y) => x.d - y.d)[0];
  }
  const r = retention(fit ? fit.kept : F, Q);
  meta.retention = Math.round(r * 100) / 100;
  if (r < 0.4) why.push(`retention:${Math.round(r * 100)}%`);
  if (occurrences(Q, R).length) why.push('is-run');
  switch (t.form) {
    case 'many-slips': len(7, 16); if (s < 4) why.push(`slips:${s}`); break;
    case 'reordered': { len(5, 18); const d = bestMove(F, Q); meta.moveSlips = d; if (!(d <= 2 && d < s)) why.push('not-reordered'); break; }
    case 'register': {
      len(6, 16);
      const subs = ops.filter((o) => o.op === 'sub' && registerPair(o.a, o.b)).length;
      const thou = F.includes('thou');
      const old = F.filter((w) => isOldWord(w, thou)).length;
      meta.registerSwaps = subs;
      if (old && ops.some((o) => o.op === 'eq' && isOldWord(o.a, thou))) why.push('register-partial');
      if (subs < Math.min(2, Math.max(1, old))) why.push(`register-swaps:${subs}`);
      break;
    }
    case 'merged': meta.mergeSlips = fit.d; if (!(fit.d <= 2)) why.push('not-merged'); break;
    case 'half': {
      len(6, 18);
      let p = 0; while (p < F.length && p < Q.length && F[p] === Q[p]) p++;
      meta.prefix = p;
      if (p < 4 || p > 6) why.push(`prefix:${p}`);
      const c2 = editScript(F.slice(p), Q.slice(p)).filter(contentSlip).length;
      if (c2 < 2) why.push(`content-slips-after:${c2}`);
      break;
    }
    default: why.push('form?');
  }
}
/** Greedy matches of q's title words in the title's, each {f: folded, r: as typed}: equal once folded, or one letter
    apart on 5+ letters; with `loose`, a typo of the word as typed too. */
function titleMatches(qw, tw, loose) {
  const pool = tw.slice(); let m = 0;
  for (const w of qw) { const i = pool.findIndex((x) => x != null && (titleTokEq(w.f, x.f) || (loose && typoOf(w.r, x.r)))); if (i >= 0) { m++; pool[i] = null; } }
  return m;
}
const paired = (f, r) => f.map((x, i) => ({ f: x, r: r[i] }));
/** The title with each nonempty set of its in-word hyphens (the first 6) joined. */
function hyphenJoins(T) {
  const at = [...String(T).matchAll(/(?<=\p{L})[-‐‑](?=\p{L})/gu)].map((m) => m.index).slice(0, 6);
  const out = [];
  for (let k = 1; k < 1 << at.length; k++) out.push(at.reduceRight((s, i, j) => ((k >> j) & 1 ? s.slice(0, i) + s.slice(i + 1) : s), String(T)));
  return out;
}
function collectionVocab(collection) {
  const v = new Set(titleFold(collection));
  for (const p of COLLECTION_WORDS) for (const w of titleFold(p)) v.add(w);
  for (const [w, n] of Object.entries({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 })) if (v.has(w) || v.has(String(n))) { v.add(String(n)); v.add(w); }
  return v;
}
function title(t, q, why, meta) {
  const T = t.title; const QF = titleFold(q); const TF = titleFold(T);
  const sub = isSubseq(QF, TF); const whole = QF.join(' ') === TF.join(' ');
  const easyForms = new Set([lowerPlain(T), lowerRaw(T)]);
  if (t.tier === 'easy') {
    if (t.form === 'lowercase') {
      if (/[A-Z]/.test(q)) why.push('not-lowercase');
      if (toks(q).join(' ') !== toks(T).join(' ')) why.push('not-whole-title');
      if (/[.,:;!?"“”()[\]—–]/.test(q)) why.push('punct-kept');
    } else if (canon(q) !== canon(T)) why.push(toks(q).join(' ') === toks(T).join(' ') ? 'not-as-written' : 'not-whole-title');
    return;
  }
  if (t.tier === 'medium') {
    if (t.form === 'number-swap' || t.form === 'punct-swap') {
      // a punct-swap may join any in-word hyphen (the brief: "a hyphen split or joined"), never two words a space parts
      const subJ = sub || (t.form === 'punct-swap' && hyphenJoins(T).some((v) => isSubseq(QF, titleFold(v))));
      if (!subJ) { why.push('not-subset'); return; }
      // the whole title is allowed here, typed differently, but never as one of the easy forms types it
      if (easyForms.has(lowerRaw(q))) { why.push('equals-easy'); return; }
      if (t.form === 'number-swap') {
        // a number typed the other way: a digit where the title has number words, or words where it has a digit
        const qt = toks(q); const tt = toks(T);
        if (!((qt.some(isDigitTok) && tt.some(isNumWord)) || (tt.some(isDigitTok) && qt.some(isNumWord)))) why.push('no-number-swap');
        if (!isSubseq(foldNumbers(qt), foldNumbers(tt))) why.push('not-subset');
      } else {
        const letters = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        if (letters(q) !== letters(T)) why.push('not-punct-swap');
      }
      return;
    }
    if (!sub) { why.push('not-subset'); return; }
    if (whole) { why.push('whole-title'); return; }
    if (t.form === 'article-dropped') { if (!ARTICLE.test(T) || QF.join(' ') !== TF.slice(1).join(' ')) why.push('not-article-dropped'); }
    else if (t.form === 'word-dropped') { if (QF.length !== TF.length - 1) why.push(`dropped:${TF.length - QF.length}`); }
    else if (t.form === 'memorable-part') { if (QF.length > TF.length - 2 || QF.length < 2 || !QF.some(isContent)) why.push('not-part'); }
    else why.push('form?');
    return;
  }
  // hard: judged on the words as typed (QR, TR: titleTokens, plurals kept), so a plural changed is a word wrong and a
  // typo is measured on the whole word; the content words kept are counted on the folded words (QF, TF).
  const QR = titleTokens(q); const TR = titleTokens(T);
  const tc = paired(TF, TR).filter((w) => isContent(w.f));
  const kept = tc.length ? titleMatches(paired(QF, QR).filter((w) => isContent(w.f)), tc, true) / tc.length : 1;
  meta.retention = Math.round(kept * 100) / 100;
  if (kept < 0.5) why.push(`retention:${Math.round(kept * 100)}%`);
  if (isSubseq(QR, TR)) { why.push('is-subset'); return; }
  const ops = editScript(TR, QR);
  const subs = ops.filter((o) => o.op === 'sub'); const dels = ops.filter((o) => o.op === 'del'); const ins = ops.filter((o) => o.op === 'ins');
  switch (t.form) {
    case 'words-wrong': if (!subs.length || subs.length + dels.length + ins.length > 2) why.push('not-words-wrong'); break;
    case 'reordered': {
      const ms = (a) => { const m = new Map(); for (const w of a) m.set(w, (m.get(w) || 0) + 1); return m; };
      const A = ms(QF); const B = ms(TF); let diff = 0; let content = false;
      for (const k of new Set([...A.keys(), ...B.keys()])) { const d = Math.abs((A.get(k) || 0) - (B.get(k) || 0)); diff += d; if (d && isContent(k)) content = true; }
      // folded, a reordered title holds the title's words, and something moved (still in order once folded: nothing did)
      if (diff > 2 || content || sub) why.push('not-reordered');
      break;
    }
    case 'typo': {
      const sl = slips(ops);
      if (!sl.length || sl.length > 2 || !sl.every((o) => o.op === 'sub' && typoOf(o.b, o.a))) why.push('not-typo');
      break;
    }
    case 'collection-word': {
      const vocab = collectionVocab(t.collection || '');
      const pool = TF.slice(); const extra = []; // q's words the title does not hold
      for (const w of QF) { const i = pool.findIndex((x) => x != null && titleTokEq(w, x)); if (i >= 0) pool[i] = null; else extra.push(w); }
      const fromCol = extra.filter((w) => vocab.has(w));
      if (!fromCol.length) why.push('no-collection-word');
      else if (extra.some((w) => !vocab.has(w) && !FUNCTION.has(w))) why.push('extra-words');
      const rest = QF.filter((w) => !(vocab.has(w) && !TF.includes(w)));
      if (!isSubseq(rest, TF)) why.push('not-title-part');
      break;
    }
    case 'dropped-wrong': if (!subs.length || !(dels.length >= 1) || subs.length + dels.length + ins.length > 3) why.push('not-dropped-wrong'); break;
    default: why.push('form?');
  }
}

/** Gate A for one query. */
export function gateA(t, o) {
  const why = []; const meta = {};
  const q = o && typeof o.q === 'string' ? o.q.trim() : '';
  if (!q) return { pass: false, why: ['missing'], meta };
  if (t.style === 'exact') exact(t, q, why, meta);
  else if (t.style === 'misremembered') misremembered(t, q, o.from, why, meta);
  else title(t, q, why, meta);
  return { pass: !why.length, why, meta };
}
export { norm };
