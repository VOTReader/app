/* anchor-resolve — re-anchoring a stored annotation onto the text on screen.
   ────────────────────────────────────────────────────────────────────────
   Every fixture below is REAL text pulled out of the running app, because
   the whole point is that translations differ in ways synthetic strings
   don't reproduce (an added comma here, a substituted divine name there, a
   completely restructured sentence in Young's Literal).

   The defect this locks down: a Bible verse annotation is anchored by
   bibleHlKey(book, chapter, verse), which says nothing about WHICH
   rendering was marked, while the record holds character offsets. Pick a
   different translation and those offsets point at different words —
   silently, and wrongly.

   (Scope, verified: `settings.restoredNames` is NOT part of this — it swaps
   chapter titles and section headings only, never verse text. The Name is
   restored in verse text by choosing the NKJV-R / KJV-R TRANSLATIONS, which
   is exactly the picker path this file is about.)
*/

import { describe, it, expect } from 'vitest';
import { resolveAnchor } from './anchor-resolve.js';

// John 3:16 — measured from the app on 2026-08-04.
const NKJV = 'For God so loved the world that He gave His only begotten Son, that whoever believes in Him should not perish but have everlasting life.';
const KJV  = 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';
const YLT  = 'for God did so love the world, that His Son -- the only begotten -- He gave, that every one who is believing in him may not perish, but may have life age-during.';

// 1 Corinthians 12:3 under NKJV vs the NKJV-R (Restored Name) translation.
// The substitution is six characters longer and occurs twice, so every offset
// after it shifts — the subtlest form of the bug, and the likeliest one for
// this app's reader, who has a standing reason to want the restored Name.
const PLAIN    = 'Therefore I make known to you that no one speaking by the Spirit of God calls Jesus accursed, and no one can say that Jesus is Lord except by the Holy Spirit.';
const RESTORED = 'Therefore I make known to you that no one speaking by the Spirit of God calls YahuShua accursed, and no one can say that YahuShua is Lord except by the Holy Spirit.';

/** Build a stored record the way SelectionToolbar does: offsets + the exact slice. */
const mark = (src, phrase) => {
  const start = src.indexOf(phrase);
  if (start < 0) throw new Error('fixture error: phrase not in source');
  return { start, end: start + phrase.length, text: phrase };
};

describe('resolveAnchor — tier 1: nothing changed', () => {
  it('returns the stored offsets untouched when the text still matches', () => {
    const m = mark(NKJV, 'should not perish');
    expect(resolveAnchor(NKJV, m)).toEqual({ start: m.start, end: m.end, exact: true });
  });

  it('is the identity for a mark spanning the whole verse', () => {
    const m = mark(NKJV, NKJV);
    expect(resolveAnchor(NKJV, m)).toEqual({ start: 0, end: NKJV.length, exact: true });
  });
});

describe('resolveAnchor — tier 2: same words, moved', () => {
  it('follows the phrase across a translation that only adds punctuation (KJV)', () => {
    // The bug: stored NKJV offsets 92-109 render as "him should not pe" in KJV.
    const m = mark(NKJV, 'should not perish');
    expect(KJV.slice(m.start, m.end)).toBe('him should not pe');   // the defect, pinned
    const at = resolveAnchor(KJV, m);
    expect(KJV.slice(at.start, at.end)).toBe('should not perish'); // the fix
    expect(at.exact).toBe(true);
  });

  it('absorbs a restored-name substitution EARLIER in the verse (the default mode)', () => {
    const m = mark(PLAIN, 'except by the Holy Spirit');
    expect(RESTORED.slice(m.start, m.end)).not.toBe('except by the Holy Spirit'); // shifted by +12
    const at = resolveAnchor(RESTORED, m);
    expect(RESTORED.slice(at.start, at.end)).toBe('except by the Holy Spirit');
  });

  it('picks the occurrence NEAREST the stored offset when a phrase repeats', () => {
    // "YahuShua" appears twice; a mark on the SECOND must not jump to the first.
    const second = RESTORED.indexOf('YahuShua', RESTORED.indexOf('YahuShua') + 1);
    const m = { start: second, end: second + 8, text: 'YahuShua' };
    const at = resolveAnchor(RESTORED, m);
    expect(at.start).toBe(second);
  });
});

describe('resolveAnchor — tier 3: punctuation-insensitive', () => {
  it('re-anchors a phrase whose only difference is an inserted comma', () => {
    // NKJV "the world that He gave" vs KJV "the world, that he gave".
    const m = mark(NKJV, 'the world that He gave');
    expect(KJV.indexOf('the world that He gave')).toBe(-1);   // exact search cannot find it
    const at = resolveAnchor(KJV, m);
    expect(at).not.toBeNull();
    expect(KJV.slice(at.start, at.end)).toBe('the world, that he gave');
    expect(at.exact).toBe(false);
  });
});

describe('resolveAnchor — no honest anchor', () => {
  it('returns null when the wording genuinely differs (YLT restructures the verse)', () => {
    const m = mark(NKJV, 'whoever believes in Him');
    expect(resolveAnchor(YLT, m)).toBeNull();
  });

  it('null means SKIP, never paint — the caller must not fall back to raw offsets', () => {
    const m = mark(NKJV, 'should not perish');
    // Proof of why: those raw offsets land on unrelated words in YLT.
    expect(YLT.slice(m.start, m.end)).toBe('who is believing ');
    expect(resolveAnchor(YLT, m)).toBeNull();
  });
});

describe('resolveAnchor — robustness', () => {
  it('keeps a legacy record that has no stored text (clamped offsets, best effort)', () => {
    const at = resolveAnchor(NKJV, { start: 4, end: 7 });
    expect(at).toEqual({ start: 4, end: 7, exact: false });
  });

  it('clamps out-of-range offsets instead of throwing', () => {
    expect(resolveAnchor(NKJV, { start: 9999, end: 10000 })).toBeNull();
    const at = resolveAnchor(NKJV, { start: 0, end: 9999 });
    expect(at.end).toBe(NKJV.length);
  });

  it('handles empty / missing inputs', () => {
    expect(resolveAnchor('', { start: 0, end: 1, text: 'x' })).toBeNull();
    expect(resolveAnchor(NKJV, null)).toBeNull();
    expect(resolveAnchor(null, { start: 0, end: 1 })).toBeNull();
  });

  it('never returns an inverted or empty range', () => {
    for (const src of [NKJV, KJV, YLT, PLAIN, RESTORED]) {
      for (const phrase of ['God', 'the', 'Son', 'not']) {
        const i = NKJV.indexOf(phrase);
        if (i < 0) continue;
        const at = resolveAnchor(src, { start: i, end: i + phrase.length, text: phrase });
        if (at) expect(at.end).toBeGreaterThan(at.start);
      }
    }
  });
});

/* ── Integration: what HighlightableText does with an unanchorable mark ──
   The rule the engine implements on top of resolveAnchor: a bare highlight
   that cannot be placed is SKIPPED (never paint words the reader did not
   mark), but a mark carrying the reader's own NOTE is kept over the whole
   verse with its paint blanked — because dropping it would take the note
   icon with it and leave text the user WROTE unreachable in that
   translation. This suite pins the decision, not the pixels. */
describe('unanchorable marks — the note-access rule', () => {
  const bare = mark(NKJV, 'whoever believes in Him');

  it('a bare highlight cannot be anchored in YLT (so the engine skips it)', () => {
    expect(resolveAnchor(YLT, bare)).toBeNull();
  });

  it('the same is true for a note-bearing mark — the engine, not the resolver, keeps it', () => {
    // resolveAnchor is deliberately kind-agnostic: it answers "where is this
    // text", not "what should be painted". The keep-the-note policy lives in
    // HighlightableText so the resolver stays a pure string function.
    const noteMark = { ...bare, kind: 'note', groupId: 'g1' };
    expect(resolveAnchor(YLT, noteMark)).toBeNull();
    expect(resolveAnchor(NKJV, noteMark)).not.toBeNull();
  });
});
