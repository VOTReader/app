/**
 * audio-fragments-lib — THE corpus-side text domain for read-along.
 *
 * Pure: no fs, no vm, no writes. Callers supply an already-evaluated corpus
 * context (see CORPUS_FILES + buildCollections) and get back fragments whose
 * character offsets address the block's DOM textContent exactly.
 *
 * WHY THIS FILE EXISTS. The offsets read-along paints through are character
 * indices into a block's rendered textContent. That domain was, for months,
 * defined in three places with three different answers: the extractor (right),
 * tools/hone-sample.mjs (a naive segments.join('') — so every karaoke QA page
 * built after the 2026-08-12 fix showed spans shifted by exactly the drift the
 * fix removed), and any new checker (a fourth copy waiting to drift). One
 * definition now, three consumers: the extractor that feeds the aligner, the
 * gate that refuses to ship bad offsets, and the QA renderer the ear trusts.
 *
 * blockDomainText() is the primitive. It returns the block's text AND the
 * lineBounds set — the offsets where poetry lines butt together. Poetry lines
 * are separate <div>s, so their textContent concatenates with NO separator:
 * "...their dross" + "And take away..." reads "drossAnd". A boundary there sits
 * between two word characters and is perfectly legal, so any word-boundary
 * check that does not know lineBounds false-positives on every poetry line.
 */
// THE segment-level text domain — the same function the renderer paints
// through. Never re-implement segment joining; see segment-dom-text.js's own
// header for the bug that proves why.
import { segmentsDomText } from '../app/src/main/assets/src/utils/segment-dom-text.js';

/** Corpus data files a caller must evaluate into one shared context. */
export const CORPUS_FILES = Object.freeze([
  'volume-one.js', 'volume-two.js', 'volume-three.js', 'volume-four.js',
  'volume-five.js', 'volume-six.js', 'volume-seven.js',
  'letters-timothy.js', 'letters-flock.js', 'lords-rebuke.js',
  'wtlb-one.js', 'wtlb-two.js', 'the-blessed.js', 'holy-days.js',
]);

/**
 * Map an evaluated corpus context to the volKey -> items shape the aligner and
 * the app agree on. Holy Days is returned separately: its ghost entries carry
 * either shape and are classified per entry.
 * @param {any} ctx
 */
export function buildCollections(ctx) {
  const A = {
    one: [ctx.LETTERS_V1_PREFACE, ...ctx.LETTERS_V1], two: ctx.LETTERS,
    three: [ctx.LETTERS_V3_PREFACE, ...ctx.LETTERS_V3], four: [ctx.LETTERS_V4_PREFACE, ...ctx.LETTERS_V4],
    five: [ctx.LETTERS_V5_PREFACE, ...ctx.LETTERS_V5], six: [ctx.LETTERS_V6_PREFACE, ...ctx.LETTERS_V6],
    seven: [ctx.LETTERS_V7_PREFACE, ...ctx.LETTERS_V7],
    timothy: [ctx.LETTERS_TIMOTHY_PREFACE, ...ctx.LETTERS_TIMOTHY],
    flock: [ctx.LETTERS_FLOCK_PREFACE, ...ctx.LETTERS_FLOCK],
    rebuke: [ctx.LETTERS_REBUKE_PREFACE, ...ctx.LETTERS_REBUKE],
  };
  const B = { wtlb1: ctx.WTLB_ONE, wtlb2: ctx.WTLB_TWO, blessed: ctx.THE_BLESSED };
  return { A, B, holyDays: (ctx.HOLY_DAYS || []).filter(Boolean) };
}

/** Block types that render no data-hl-key container, so carry no fragments. */
const NO_FRAGMENTS = new Set(['heading', 'prophecy-group', 'cover-image']);

/**
 * THE rendered text of one Format-A block, plus the offsets where independently
 * rendered runs concatenate without a separator.
 *
 * @param {any} b
 * @returns {{ text: string, lineBounds: Set<number> } | null} null when the
 *   block renders no highlightable container.
 */
export function blockDomainText(b) {
  if (!b || NO_FRAGMENTS.has(b.type)) return null;
  if (b.type === 'para' || b.type === 'intro' || b.type === 'closing-fn') {
    return { text: segmentsDomText(b.segments), lineBounds: new Set() };
  }
  if (b.type === 'poetry') {
    const lineBounds = new Set();
    let text = '';
    const push = (lt) => { text += lt; lineBounds.add(text.length); };
    if (b.lines) for (const line of b.lines) push(segmentsDomText(line));
    else for (const seg of (b.segments || [])) push(segmentsDomText([{ ...seg, v: String(seg.v || '').replace(/^\n/, '') }]));
    lineBounds.delete(text.length);              // the block end is not an interior join
    return { text, lineBounds };
  }
  if (b.type === 'closing') return { text: String(b.text || ''), lineBounds: new Set() };
  return null;
}

// A sentence longer than this many tokens is sub-split at clause boundaries
// ("; " / ": " / " — ") so the highlight tracks one thought at a time — VOT's
// poetic prose chains 30-50-token cascades that otherwise paint a 3-line
// block (owner report 2026-08-10). Split points never fall below 3 tokens a
// side, so "Jesus wept."-scale units are unaffected.
export const CLAUSE_SPLIT_TOKENS = 12;

export function clauseSplit(text, base) {
  const toks = (t) => t.split(/\s+/).filter(Boolean).length;
  if (toks(text) <= CLAUSE_SPLIT_TOKENS) return [{ cs: base, ce: base + text.length, text }];
  // Boundary strength 1: "; " / ": " / em-dash. Strength 2 (only while a piece
  // is still over budget): ", " before a clause-opening conjunction — VOT's
  // cascades chain with ", until" / ", and" / ", that", not semicolons.
  const CONJ = /^(?:until|and|that|for|so|then|yet|nor|but|who|whom|which|when|even|behold|lest|as)\b/i;
  const pieces = [];
  const splitAt = (t0, b0, re, guard) => {
    const out = [];
    let start = 0;
    let m;
    while ((m = re.exec(t0)) !== null) {
      const cut = m.index + m[0].length;
      if (guard && !CONJ.test(t0.slice(cut))) continue;
      const left = t0.slice(start, cut).replace(/\s+$/, '');
      if (toks(left) >= 3 && toks(t0.slice(cut)) >= 3) {
        out.push({ cs: b0 + start, ce: b0 + start + left.length, text: left });
        start = cut;
      }
    }
    out.push({ cs: b0 + start, ce: b0 + t0.length, text: t0.slice(start) });
    return out;
  };
  for (const p of splitAt(text, base, /(?:;\s+|:\s+| — |—\s+)/g, false)) {
    if (toks(p.text) > CLAUSE_SPLIT_TOKENS) {
      pieces.push(...splitAt(p.text, p.cs, /,\s+/g, true));
    } else {
      pieces.push(p);
    }
  }
  return pieces;
}

/**
 * Sentence spans of one block, as [start, end) offsets.
 *
 * A terminator only ENDS a sentence when whitespace or the block end follows
 * it. That one condition is what separates a real boundary from a period
 * living inside a token, and it is not cosmetic: the old single-regex form
 * could not express it, so when the terminator run failed to reach whitespace
 * the engine backtracked to the previous space and left the remainder to start
 * the next fragment mid-token. Measured damage, all three shapes:
 *
 *   "the U.S.A. still"   -> "Is the" | "A."          ("U.S." painted by nobody)
 *   "GodOnline.com"      -> "...(the" | "com website sign).”"
 *   "“Immanu El!”, then" -> "who cry, “Immanu" | "”, then break My..."
 *
 * The last is both owner symptoms at once: `El!` never highlights, and the
 * next clause opens one character early on an orphaned quote mark.
 *
 * Trailing digits stay part of the boundary: inline footnote markers sit hard
 * against the period ("...as it is written.1 I AM THE LORD."), and a marker
 * that ends a sentence must not strand the word before it.
 */
export function sentenceSpans(text) {
  const out = [];
  const re = /[.!?…]+["”’)\]]*[0-9]*/g;
  let start = 0;
  while (start < text.length && /\s/.test(text[start])) start++;
  let m;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    if (end < text.length && !/\s/.test(text[end])) continue;   // inside a token — not a boundary
    let n = end;
    while (n < text.length && /\s/.test(text[n])) n++;           // fragments never carry edge whitespace
    // A new sentence starts with a capital. Where the next word is lowercase
    // the terminator belongs to the sentence it sits in — a quoted outburst
    // ("Have compassion!" saying within themselves...) or an abbreviation
    // (the U.S.A. still a nation). Six of these exist in the corpus and all
    // six are false boundaries that split a thought mid-flow; nothing legitimate
    // is suppressed, because VOT sentences are capitalized without exception.
    // Merged sentences are still sub-split by clauseSplit, so this never
    // produces a longer wash than the clause budget allows.
    if (n < text.length && /[a-z]/.test(text[n])) continue;
    if (text.slice(start, end).trim().length >= 2) out.push([start, end]);
    start = n;
    re.lastIndex = n;
  }
  if (start < text.length && text.slice(start).trim().length >= 2) out.push([start, text.length]);
  return out;
}

export function formatAFragments(letter) {
  const out = [];
  (letter.blocks || []).forEach((b, bi) => {
    if (b.type === 'para' || b.type === 'intro' || b.type === 'closing-fn') {
      const { text } = blockDomainText(b);
      for (const [s, e] of sentenceSpans(text)) {
        for (const piece of clauseSplit(text.slice(s, e), s)) {
          if (piece.text.trim().length >= 2) out.push({ bi, cs: piece.cs, ce: piece.ce, text: piece.text });
        }
      }
      // Alpha-less fragments (footnote-marker digits like "12" stranded after a
      // sentence's closing period) must never highlight solo — merge each into
      // its predecessor's span (owner rule: numbers ride with their sentence).
      for (let i = out.length - 1; i >= 0; i--) {
        const f = out[i];
        if (/[a-zA-Z]/.test(f.text)) continue;
        if (i > 0 && f.bi === out[i - 1].bi) {
          out[i - 1].ce = f.ce;                    // fold back onto its sentence
          out[i - 1].text += f.text;
          out.splice(i, 1);
        } else if (i + 1 < out.length && f.bi === out[i + 1].bi) {
          out[i + 1].cs = f.cs;                    // block-leading digit: fold forward
          out[i + 1].text = f.text + out[i + 1].text;
          out.splice(i, 1);
        } else {
          out.splice(i, 1);                        // digit alone in its block: unspoken, drop
        }
      }
    } else if (b.type === 'poetry') {
      // Each poetry line is its own <Segments> run (LetterView), so the guard
      // applies WITHIN a line; consecutive lines are separate divs, whose
      // textContent concatenates with no separator.
      const { text, lineBounds } = blockDomainText(b);
      let pos = 0;
      for (const end of [...lineBounds, text.length].sort((x, y) => x - y)) {
        const lt = text.slice(pos, end);
        if (lt.trim().length >= 2) out.push({ bi, cs: pos, ce: end, text: lt });
        pos = end;
      }
    } else if (b.type === 'closing') {
      const t = String(b.text || '');
      if (t.trim().length >= 2) out.push({ bi, cs: 0, ce: t.length, text: t });
    }
  });
  return out;
}

/**
 * A paragraph as SPOKEN, at exactly the corpus text's length.
 *
 * Every character the reader does not say is blanked to a space rather than
 * removed, so an offset into this string IS an offset into `p.text`. That one
 * property is what lets Format B carry real character offsets at all: the
 * aligner can sentence-split and clause-split here and the result already
 * addresses the corpus, which is the only domain that does not move. (The
 * rendered domain moves with the footnote route, with soft line breaks, and
 * even with whether the lazy Bible corpus has landed — utils/format-b-dom-text.js
 * projects onto it at paint time.)
 *
 * A reference keeps its words: the readers speak the cites aloud, and those
 * words are what anchor the matcher. Padding them back out to the marker's
 * width costs nothing — the tokenizer splits on non-letters anyway.
 */
export function formatBSpoken(raw) {
  const text = String(raw == null ? '' : raw);
  const blank = (n) => ' '.repeat(n);
  let out = text
    .replace(/\{\{ref:([^}]+)\}\}/g, (m, ref) => {
      const words = ref.trim();
      return words.length <= m.length ? words + blank(m.length - words.length) : words.slice(0, m.length);
    })
    .replace(/\{\{nav:[^}]+\}\}/g, (m) => blank(m.length));
  // Emphasis markers and the attribution brackets are printed, never spoken.
  out = out.replace(/\*\*|[_*[\]~†]/g, (m) => blank(m.length));
  if (out.length !== text.length) throw new Error('formatBSpoken changed length: ' + text.slice(0, 60));
  return out;
}

/**
 * Format B fragments, at CLAUSE granularity in the corpus offset domain.
 *
 * Was one fragment per paragraph with a `-1` sentinel meaning "paint the whole
 * block" — up to 3,785 characters, roughly four minutes of motionless gold on
 * the longest entry. The stated reason (the rendered domain shifts with
 * footnotesMode) is real but small; see format-b-dom-text.js for what actually
 * moves. With the projection in place the offsets can be real.
 */
export function formatBFragments(entry) {
  const out = [];
  (entry.paragraphs || []).forEach((p, pi) => {
    const raw = String(p.text || '');
    const spoken = formatBSpoken(raw);
    // A soft line break here is a deliberate poetic one -- it renders as
    // <br/> -- not a wrap: of the ~2,000 breaks in the Format B corpus exactly
    // TWO continue a sentence onto the next line. So a line is a unit, the same
    // way a Format A poetry line is, and the wash tracks the reader line by
    // line instead of holding a whole stanza motionless.
    const lines = [];
    let at = 0;
    for (const line of spoken.split('\n')) {
      lines.push([at, at + line.length]);
      at += line.length + 1;
    }
    for (const [ls, le] of lines) {
      for (const [s0, e0] of sentenceSpans(spoken.slice(ls, le))) {
        for (const piece of clauseSplit(spoken.slice(ls + s0, ls + e0), ls + s0)) {
          // Blanked markup can leave a span opening or closing on spaces; a
          // fragment must sit on the words it actually covers.
          let cs = piece.cs;
          let ce = piece.ce;
          while (cs < ce && /\s/.test(spoken[cs])) cs++;
          while (ce > cs && /\s/.test(spoken[ce - 1])) ce--;
          const text = spoken.slice(cs, ce);
          if (/[a-zA-Z]/.test(text) && text.trim().length >= 2) out.push({ pi, cs, ce, text });
        }
      }
    }
  });
  return out;
}

/** Every fragment for one corpus item, keyed by its shape. */
export function fragmentsFor(item) {
  return item.blocks
    ? { format: 'A', fragments: formatAFragments(item) }
    : { format: 'B', fragments: formatBFragments(item) };
}
