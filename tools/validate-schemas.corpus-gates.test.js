/**
 * c43 corpus gates — RED-first tests for the three holes the 2026-09-01 review
 * found in the translation data and the footnote quotations:
 *   1. the KJV lost its small-caps divine name in a regeneration and no gate saw it
 *   2. the verse-gap warning was blind at both chapter edges and buried in noise
 *   3. footnote values tagged with a bundled translation carried other wording
 * Written before the validator code existed; each describe names the finding.
 */
import { describe, it, expect } from 'vitest';
import {
  validateKjvInvariants,
  KJV_DIVINE_NAME_FLOORS,
  KJV_CANON,
  validateTranslationVerseSet,
  verseSetAllowlist,
  TEXTUS_RECEPTUS_ONLY_VERSES,
  VERSIFICATION_DIFFERENCES,
  validateTaggedDictValues,
  validateTranslationMap,
} from './validate-schemas.js';

// ── 1. data-corpus-1: the KJV keeps its LORD ────────────────────────────

describe('validateKjvInvariants — the small-caps divine name (data-corpus-1)', () => {
  const kjvLike = {
    genesis: { '1': [{ n: 1, text: 'In the beginning God created the heaven and the earth.' }] },
    exodus: { '6': [{ n: 3, text: 'by my name JEHOVAH was I not known to them.' }, { n: 4, text: 'the LORD said unto Moses' }] },
    psalms: { '23': [{ n: 1, text: 'The LORD is my shepherd; I shall not want.' }, { n: 2, text: 'O Lord GOD, thou hast begun' }] },
  };
  const opts = { canon: null, floors: { LORD: 2, GOD: 1, JEHOVAH: 1 } };

  it('passes a map that holds the floors, and reports the counts', () => {
    const r = validateKjvInvariants(kjvLike, opts);
    expect(r.errors).toEqual([]);
    expect(r.counts.LORD).toBe(2);
    expect(r.counts.GOD).toBe(1);
    expect(r.counts.JEHOVAH).toBe(1);
  });

  it('fails a case-flattened map (the 2026-05-28 regen: "Lord" where the KJV prints "LORD")', () => {
    const flat = JSON.parse(JSON.stringify(kjvLike));
    flat.psalms['23'][0].text = 'The Lord is my shepherd; I shall not want.';
    flat.exodus['6'][1].text = 'the Lord said unto Moses';
    const r = validateKjvInvariants(flat, opts);
    expect(r.errors.some((e) => /"LORD" appears 0 times, below the floor of 2/.test(e))).toBe(true);
  });

  it('counts whole words only — "Lord\'s" and "LORDS" are not the divine name', () => {
    const r = validateKjvInvariants({ a: { '1': [{ n: 1, text: 'the LORDS house; the LORD\'S doing' }] } }, { canon: null, floors: { LORD: 1 } });
    expect(r.counts.LORD).toBe(1);
  });

  it('holds the canon totals when asked', () => {
    const r = validateKjvInvariants(kjvLike, { canon: { books: 3, chapters: 3, verses: 6 }, floors: {} });
    expect(r.errors.some((e) => /5 verses, the KJV canon has 6/.test(e))).toBe(true);
    expect(validateKjvInvariants(kjvLike, { canon: { books: 3, chapters: 3, verses: 5 }, floors: {} }).errors).toEqual([]);
  });

  it('ships floors that a flattened regen cannot pass and a faithful one clears', () => {
    // 6,574 / 310 / 5 measured after the c43 restore; 6 / 2 / 1 before it.
    expect(KJV_DIVINE_NAME_FLOORS.LORD).toBeGreaterThanOrEqual(6500);
    expect(KJV_DIVINE_NAME_FLOORS.LORD).toBeLessThanOrEqual(6574);
    expect(KJV_DIVINE_NAME_FLOORS.GOD).toBeGreaterThanOrEqual(300);
    expect(KJV_DIVINE_NAME_FLOORS.JEHOVAH).toBeGreaterThanOrEqual(4);
    expect(KJV_CANON).toEqual({ books: 66, chapters: 1189, verses: 31102 });
  });
});

// ── 2. data-corpus-5: the verse set at both chapter edges ───────────────

describe('validateTranslationVerseSet — both chapter edges, allowlisted with a reason (data-corpus-5)', () => {
  const ref = {
    songofsolomon: { '1': [{ n: 1, text: 'a' }, { n: 2, text: 'b' }, { n: 3, text: 'c' }] },
    romans: { '16': [{ n: 25, text: 'x' }, { n: 26, text: 'y' }, { n: 27, text: 'z' }] },
    mark: { '9': [{ n: 43, text: 'p' }, { n: 44, text: 'q' }, { n: 45, text: 'r' }] },
  };
  const complete = {
    songofsolomon: { '1': [{ n: 1, text: 'A' }, { n: 2, text: 'B' }, { n: 3, text: 'C' }] },
    romans: { '16': [{ n: 25, text: 'X' }, { n: 26, text: 'Y' }, { n: 27, text: 'Z' }] },
    mark: { '9': [{ n: 43, text: 'P' }, { n: 44, text: 'Q' }, { n: 45, text: 'R' }] },
  };
  const none = { missing: new Set(), extra: new Set() };

  it('passes a translation that carries every reference verse', () => {
    const r = validateTranslationVerseSet(complete, ref, { fileName: 't.js', allow: none });
    expect(r.errors).toEqual([]);
    expect(r.checked).toBe(9);
  });

  it('ERRORS on a chapter that starts at verse 2 (the leading edge the gap warning never saw)', () => {
    const m = JSON.parse(JSON.stringify(complete));
    m.songofsolomon['1'].shift();
    const r = validateTranslationVerseSet(m, ref, { fileName: 't.js', allow: none });
    expect(r.errors).toEqual([expect.stringMatching(/t\.js: songofsolomon 1:1 is missing/)]);
    // the old adjacent-pair check is silent on exactly this shape
    expect(validateTranslationMap(m, { fileName: 't.js' }).warnings).toEqual([]);
  });

  it('ERRORS on a chapter that stops short (the trailing edge)', () => {
    const m = JSON.parse(JSON.stringify(complete));
    m.romans['16'].pop();
    const r = validateTranslationVerseSet(m, ref, { fileName: 't.js', allow: none });
    expect(r.errors).toEqual([expect.stringMatching(/romans 16:27 is missing/)]);
    expect(validateTranslationMap(m, { fileName: 't.js' }).warnings).toEqual([]);
  });

  it('ERRORS on a present-but-blank verse (the HNV shipped five of them as "")', () => {
    const m = JSON.parse(JSON.stringify(complete));
    m.romans['16'][0].text = '';
    const r = validateTranslationVerseSet(m, ref, { fileName: 't.js', allow: none });
    expect(r.errors).toEqual([expect.stringMatching(/romans 16:25 is present but BLANK/)]);
    // ...and the message says what to do about it, because "allowlist it" is
    // the wrong answer for this class (data-corpus-6, 2026-09-04).
    expect(r.errors[0]).toMatch(/must be LEFT OUT/);
  });

  it('ERRORS on an extra verse the reference does not have (it can never render)', () => {
    const m = JSON.parse(JSON.stringify(complete));
    m.romans['16'].push({ n: 28, text: 'extra' });
    const r = validateTranslationVerseSet(m, ref, { fileName: 't.js', allow: none });
    expect(r.errors).toEqual([expect.stringMatching(/romans 16:28 is an extra verse/)]);
  });

  it('a mid-chapter gap is an ERROR too, not a warning', () => {
    const m = JSON.parse(JSON.stringify(complete));
    m.mark['9'].splice(1, 1); // drop 9:44
    const r = validateTranslationVerseSet(m, ref, { fileName: 't.js', allow: none });
    expect(r.errors).toEqual([expect.stringMatching(/mark 9:44 is missing/)]);
  });

  it('an allowlisted omission is counted, not errored', () => {
    const m = JSON.parse(JSON.stringify(complete));
    m.mark['9'].splice(1, 1); // 9:44 — a Textus Receptus verse
    const r = validateTranslationVerseSet(m, ref, { fileName: 'bible-asv.js' });
    expect(r.errors).toEqual([]);
    expect(r.allowed).toBe(1);
  });

  it('a BLANK verse is an error even when the allowlist covers that reference', () => {
    // data-corpus-6: the allowlist grants permission to be ABSENT, and blankness
    // is not absence. An absent verse falls through to the alias, the base hop
    // and the NKJV; a blank one used to be handed back and rendered as a
    // numbered row with no scripture in it. Storing "we do not carry this
    // verse" as an empty string also makes the file claim a verse it lacks.
    for (const blank of ['', '   ', null, undefined, 42]) {
      const m = JSON.parse(JSON.stringify(complete));
      m.mark['9'][1] = { n: 44, text: blank };   // 9:44 IS allowlisted for every file
      const r = validateTranslationVerseSet(m, ref, { fileName: 'bible-asv.js' });
      expect(r.errors, `blank shape ${JSON.stringify(blank)}`)
        .toEqual([expect.stringMatching(/mark 9:44 is present but BLANK/)]);
    }
  });

  it('the SAME reference passes once the blank row is left out', () => {
    const m = JSON.parse(JSON.stringify(complete));
    m.mark['9'].splice(1, 1);
    const r = validateTranslationVerseSet(m, ref, { fileName: 'bible-asv.js' });
    expect(r.errors).toEqual([]);
    expect(r.allowed).toBe(1);
  });

  it('ships the sixteen Textus Receptus verses for every file and the Romans versification rows for WEB/HNV only', () => {
    expect(TEXTUS_RECEPTUS_ONLY_VERSES).toHaveLength(16);
    expect(TEXTUS_RECEPTUS_ONLY_VERSES).toContain('mark 9:44');
    expect(TEXTUS_RECEPTUS_ONLY_VERSES).toContain('romans 16:24');
    const asv = verseSetAllowlist('bible-asv.js');
    expect(asv.missing.size).toBe(16);
    expect(asv.extra.size).toBe(0);
    const web = verseSetAllowlist('bible-web.js');
    expect(web.missing.has('romans 16:25')).toBe(true);
    expect(web.extra.has('romans 14:24')).toBe(true);
    // every row states WHY it is allowed and names the alias that keeps the
    // doxology readable — an allowlist entry with no reason is how a real
    // missing verse would sneak in.
    expect(VERSIFICATION_DIFFERENCES.every((p) => /_VERSIFICATION_ALIAS/.test(p.why))).toBe(true);
    expect(VERSIFICATION_DIFFERENCES.every((p) => /14:24-26/.test(p.why))).toBe(true);
    // nothing here is allowed for a file the owner did not name
    expect(verseSetAllowlist('bible-lsv.js').missing.has('romans 16:25')).toBe(false);
  });

  it('skips with a warning, not an error, when the reference is unavailable', () => {
    const r = validateTranslationVerseSet(complete, null, { fileName: 't.js' });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });
});

// ── 3. data-corpus-3: a tagged value is the bundled translation ─────────

describe('validateTaggedDictValues — a tagged ref must match the bundled translation (data-corpus-3)', () => {
  const hnv = { '1corinthians': { '3': [{ n: 11, text: 'For no one can lay any other foundation than that which has been laid, which is Yeshua the Messiah.' }] } };
  const kjv = {
    hebrews: { '10': [{ n: 7, text: 'Then said I, Lo, I come (in the volume of the book it is written of me,) to do thy will, O God.' }] },
    jeremiah: { '20': [{ n: 11, text: 'But the LORD is with me as a mighty terrible one:' }] },
    daniel: { '8': [{ n: 23, text: 'And in the latter time of their kingdom,' }, { n: 24, text: 'And his power shall be mighty, but not by his own power:' }] },
    psalms: { '40': [{ n: 7, text: 'kjv psalm seven' }, { n: 8, text: 'kjv psalm eight' }] },
  };
  const maps = { HNV: hnv, KJV: kjv };
  const bookIdFor = (raw) => ({ '1 Corinthians': '1corinthians', Hebrews: 'hebrews', Jeremiah: 'jeremiah', Daniel: 'daniel', Psalm: 'psalms', Psalms: 'psalms' })[raw] || null;
  const opts = { where: 'test', translation: (tag) => maps[tag] || null, bookIdFor };

  it('passes a value that is the bundled text (whitespace and curly quotes aside)', () => {
    const r = validateTaggedDictValues([{ '1 Corinthians 3:11 (HNV)': 'For no one can lay any other foundation than that which has been laid,  which is Yeshua the Messiah.' }], opts);
    expect(r.errors).toEqual([]);
    expect(r.checked).toBe(1);
  });

  it('ERRORS when an HNV-tagged value carries wording the HNV does not contain', () => {
    const r = validateTaggedDictValues([{ '1 Corinthians 3:11 (HNV)': 'For no one can lay any other foundation than that which has been laid, which is Jesus Christ.' }], opts);
    expect(r.errors).toEqual([expect.stringMatching(/"1 Corinthians 3:11 \(HNV\)": the value is not the bundled HNV text/)]);
  });

  it('is case-sensitive, so a flattened divine name in the source shows up (Jeremiah 20:11 vs a "Lord" KJV)', () => {
    const flat = { jeremiah: { '20': [{ n: 11, text: 'But the Lord is with me as a mighty terrible one:' }] } };
    const r = validateTaggedDictValues([{ 'Jeremiah 20:11 (KJV)': 'But the LORD is with me as a mighty terrible one:' }], { ...opts, translation: () => flat });
    expect(r.errors).toHaveLength(1);
  });

  it('drops "N. " verse markers before comparing a multi-verse value', () => {
    const r = validateTaggedDictValues([{ 'Daniel 8:23-24 (KJV)': '23. And in the latter time of their kingdom, 24. And his power shall be mighty, but not by his own power:' }], opts);
    expect(r.errors).toEqual([]);
  });

  it('flags a literal newline in a tagged value', () => {
    const r = validateTaggedDictValues([{ 'Jeremiah 20:11 (KJV)': 'But the LORD\nis with me as a mighty terrible one:' }], opts);
    expect(r.errors).toEqual([expect.stringMatching(/literal newline/)]);
  });

  it('ERRORS when the tagged ref does not resolve in its own translation', () => {
    const r = validateTaggedDictValues([{ 'Hebrews 11:1 (KJV)': 'anything' }], opts);
    expect(r.errors).toEqual([expect.stringMatching(/does not resolve in the bundled KJV/)]);
  });

  it('compound keys: a labelled part with its own tag is checked, a labelled untagged part is NKJV and skipped', () => {
    const value = 'Psalm 40:7-8 — 7. nkjv seven 8. nkjv eight | Hebrews 10:7 (KJV) — Then said I, Lo, I come (in the volume of the book it is written of me,) to do thy will, O God.';
    const r = validateTaggedDictValues([{ 'Psalm 40:7-8, Hebrews 10:7 (KJV)': value }], opts);
    expect(r.errors).toEqual([]);
    expect(r.skipped).toBe(1);
    const bad = value.replace('to do thy will, O God.', 'to do Your will, O God.');
    expect(validateTaggedDictValues([{ 'Psalm 40:7-8, Hebrews 10:7 (KJV)': bad }], opts).errors).toHaveLength(1);
  });

  it('ignores keys with no bundled tag (NKJV default, CJB/NIV tags without a bundle)', () => {
    const r = validateTaggedDictValues([{ 'John 3:16': 'x', 'John 3:16 (CJB)': 'y', 'John 3:16 (NKJV)': 'z' }], opts);
    expect(r.checked).toBe(0);
    expect(r.errors).toEqual([]);
  });

  it('warns and skips when the bundled translation is unavailable', () => {
    const r = validateTaggedDictValues([{ '1 Corinthians 3:11 (HNV)': 'x' }], { ...opts, translation: () => null });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });
});
