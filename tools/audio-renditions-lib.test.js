/* audio-renditions-lib — the rules that decide whether a reading reaches the app.
   ─────────────────────────────────────────────────────────────────────────
   The three fixtures FlockSync v2 §5 asks for are the first three describes:
   a letter with B, T and V; a partial alternate; a same-hash duplicate. Each
   is RED against the pre-2026-09-04 rules, which are quoted inline as
   `legacyAlternates` — the suppression test that hid a reader is a real
   regression risk, not a hypothetical, so the old behaviour is pinned beside
   the new one and the tests assert they DISAGREE. Delete the legacy function
   only when nobody could reintroduce it by accident.

   The load-bearing invariant: a rendition is dropped for exactly ONE reason —
   its asset-ID set is exactly the primary's. Not a subset, not "shorter than
   the primary", not "the primary rank won". */

import { describe, it, expect } from 'vitest';
import {
  READER_RANK, renditionFor, slotCount, completenessNote,
  composeAlternates, dedupeByAudioHash, countByReader, formatReaderCounts,
  studyChapterFor,
} from './audio-renditions-lib.mjs';

/** The rules as they stood before 2026-09-04 — kept ONLY to prove the change. */
function legacyAlternates(cands, primaryList) {
  const primaryIds = new Set(primaryList.map((t) => t.id));
  const primaryMain = primaryList.filter((t) => t.label !== 'Addendum').length;
  const readers = [...new Set(cands.map((c) => c.reader))]
    .sort((a, b) => READER_RANK[b] - READER_RANK[a]);
  const pairs = [];
  for (const reader of readers) {
    const r = renditionFor(cands, reader);
    if (!r.rows.length) continue;
    if (r.rows.every((row) => primaryIds.has(row.id))) continue;
    const mainRows = r.rows.filter((row) => row.label !== 'Addendum').length;
    if (r.kind !== 'full' && primaryMain > 1 && mainRows < primaryMain) continue;
    pairs.push([reader, r.rows.map((row) => (row.label ? [row.id, row.label] : [row.id]))]);
  }
  return pairs;
}

const cand = (kind, n, id, reader) => ({ kind, n, id, reader });
const readersOf = (pairs) => pairs.map((p) => p[0]);

// ── fixture 1 — one letter with B, T and V ───────────────────────────────

describe('fixture: a letter read by Benjamin, Timothy AND text-to-speech', () => {
  const cands = [
    cand('full', 0, 'idB', 'B'),
    cand('full', 0, 'idT', 'T'),
    cand('full', 0, 'idV', 'V'),
  ];
  // Benjamin supersedes, so the primary is his.
  const primary = [{ id: 'idB', label: null }];

  it('offers the two other readers, rank-ordered, and never re-offers the primary', () => {
    const pairs = composeAlternates(cands, primary);
    expect(readersOf(pairs)).toEqual(['T', 'V']);
    expect(pairs.map((p) => p[1])).toEqual([[['idT']], [['idV']]]);
  });

  it('marks neither as partial — a single full-letter reading is always complete', () => {
    for (const [, , note] of composeAlternates(cands, primary)) expect(note).toBeUndefined();
  });

  it('drops a reader whose rendition IS the primary, by set equality not by rank', () => {
    // V alone: its rendition equals the primary, so there is nothing to offer.
    const onlyV = [cand('full', 0, 'idV', 'V')];
    expect(composeAlternates(onlyV, [{ id: 'idV', label: null }])).toEqual([]);
  });
});

// ── fixture 2 — a PARTIAL alternate ──────────────────────────────────────

describe('fixture: a partial alternate (the rendition the old rules threw away)', () => {
  // The letter has five sections. V read all five; Timothy read only two.
  const cands = [
    ...[1, 2, 3, 4, 5].map((n) => cand('section', n, 'V' + n, 'V')),
    cand('section', 1, 'T1', 'T'),
    cand('section', 2, 'T2', 'T'),
  ];
  const primary = [1, 2, 3, 4, 5].map((n) => ({ id: 'V' + n, label: `Section ${n}` }));

  it('the OLD rules discarded Timothy entirely — this is the regression', () => {
    expect(readersOf(legacyAlternates(cands, primary))).toEqual([]);
  });

  it('the new rules offer Timothy with a completeness note', () => {
    const pairs = composeAlternates(cands, primary);
    expect(readersOf(pairs)).toEqual(['T']);
    expect(pairs[0][1]).toEqual([['T1', 'Section 1'], ['T2', 'Section 2']]);
    expect(pairs[0][2]).toBe('2 of 5 sections');
  });

  it('a reader who covers every known slot carries NO note', () => {
    const full = [...cands, cand('section', 3, 'T3', 'T'), cand('section', 4, 'T4', 'T'), cand('section', 5, 'T5', 'T')];
    const pairs = composeAlternates(full, primary);
    expect(pairs[0][2]).toBeUndefined();
  });

  it('counts parts, not sections, when the letter is split into parts', () => {
    const parts = [
      cand('part', 1, 'V1', 'V'), cand('part', 2, 'V2', 'V'), cand('part', 3, 'V3', 'V'),
      cand('part', 1, 'M1', 'M'),
    ];
    const p = composeAlternates(parts, [{ id: 'V1', label: 'Part 1' }, { id: 'V2', label: 'Part 2' }, { id: 'V3', label: 'Part 3' }]);
    expect(p.find((x) => x[0] === 'M')[2]).toBe('1 of 3 parts');
  });

  it('an addendum never counts toward completeness', () => {
    const withAdd = [
      cand('section', 1, 'V1', 'V'), cand('section', 2, 'V2', 'V'),
      cand('section', 1, 'T1', 'T'), cand('addendum', 0, 'Tadd', 'T'),
    ];
    const pairs = composeAlternates(withAdd, [{ id: 'V1', label: 'Section 1' }, { id: 'V2', label: 'Section 2' }]);
    const t = pairs.find((p) => p[0] === 'T');
    expect(t[1]).toEqual([['T1', 'Section 1'], ['Tadd', 'Addendum']]);
    expect(t[2]).toBe('1 of 2 sections');
  });

  it('a lone part PLUS an addendum is still a lone part — no meaningless ordinal', () => {
    // Shipped as a defect: rows.length was 2 because the addendum counted, so
    // `one:christmas` gained a "Part 1" chip the voice picker had never shown.
    const cands = [
      cand('part', 1, 'V1', 'V'), cand('addendum', 0, 'Vadd', 'V'),
      cand('full', 0, 'B1', 'B'),
    ];
    const pairs = composeAlternates(cands, [{ id: 'B1', label: null }]);
    const v = pairs.find((p) => p[0] === 'V');
    expect(v[1]).toEqual([['V1'], ['Vadd', 'Addendum']]);
    expect(v[2]).toBeUndefined();
  });

  it('a reader whose rows are a strict SUBSET of a mixed-reader primary is still offered', () => {
    // The primary flatten takes the best reader per slot, so it can be mixed:
    // Benjamin's section 1 + Timothy's section 2. Timothy's own rendition is a
    // subset of that primary — the old subset test hid him.
    const mixed = [cand('section', 1, 'B1', 'B'), cand('section', 2, 'T2', 'T')];
    const primaryMixed = [{ id: 'B1', label: 'Section 1' }, { id: 'T2', label: 'Section 2' }];
    expect(readersOf(legacyAlternates(mixed, primaryMixed))).toEqual([]);
    expect(readersOf(composeAlternates(mixed, primaryMixed))).toEqual(['B', 'T']);
  });
});

// ── fixture 3 — a same-hash duplicate ────────────────────────────────────

describe('fixture: the same audio under two Drive ids (compare audio, not names)', () => {
  it('collapses a duplicate and keeps the collection folder over "0. ALL LETTERS"', () => {
    const { records, collapsed } = dedupeByAudioHash([
      { id: 'fill', hash: 'abc', fill: true, reader: 'B' },
      { id: 'real', hash: 'abc', fill: false, reader: 'B' },
      { id: 'other', hash: 'zzz', fill: false, reader: 'V' },
    ]);
    expect(records.map((r) => r.id)).toEqual(['real', 'other']);
    expect(collapsed).toEqual([{ kept: 'real', dropped: 'fill', hash: 'abc' }]);
  });

  it('keeps the stronger attribution when the same audio is labelled two ways', () => {
    const { records } = dedupeByAudioHash([
      { id: 'asV', hash: 'abc', fill: false, reader: 'V' },
      { id: 'asB', hash: 'abc', fill: false, reader: 'B' },
    ]);
    expect(records.map((r) => r.id)).toEqual(['asB']);
  });

  it('the survivor holds the FIRST record’s position, so the fill-last ordering still holds', () => {
    const { records } = dedupeByAudioHash([
      { id: 'a', hash: 'h1', reader: 'V' },
      { id: 'dupWinner', hash: 'h1', reader: 'B' },
      { id: 'c', hash: 'h2', reader: 'V' },
    ]);
    expect(records.map((r) => r.id)).toEqual(['dupWinner', 'c']);
  });

  it('keeps the id the manifest already ships, so a regeneration costs no mirror upload', () => {
    // The copies are byte-identical audio. Re-picking between them changes
    // nothing a listener hears and forces a fresh upload of every re-picked
    // asset — which is exactly what happened before the incumbent tiebreak:
    // two Benjamin readings moved to a differently-filed copy of the same
    // recording and went missing from the release.
    const recs = [
      { id: 'nice-provenance', hash: 'abc', fill: false, reader: 'B' },
      { id: 'already-shipped', hash: 'abc', fill: true, reader: 'B' },
    ];
    expect(dedupeByAudioHash(recs).records.map((r) => r.id)).toEqual(['nice-provenance']);
    expect(dedupeByAudioHash(recs, new Set(['already-shipped'])).records.map((r) => r.id))
      .toEqual(['already-shipped']);
  });

  it('falls back to provenance when NEITHER copy is already shipped', () => {
    const recs = [
      { id: 'fill', hash: 'abc', fill: true, reader: 'B' },
      { id: 'real', hash: 'abc', fill: false, reader: 'B' },
    ];
    expect(dedupeByAudioHash(recs, new Set(['unrelated'])).records.map((r) => r.id)).toEqual(['real']);
  });

  it('collapses nothing when the listing carries no hashes — the pre-hash listing is unchanged', () => {
    const recs = [{ id: 'a', reader: 'V' }, { id: 'b', reader: 'V' }, { id: 'c', reader: 'B' }];
    const { records, collapsed } = dedupeByAudioHash(recs);
    expect(records).toEqual(recs);
    expect(collapsed).toEqual([]);
  });

  it('two ids with DIFFERENT audio are never collapsed, however alike their names', () => {
    const { records } = dedupeByAudioHash([
      { id: 'take1', hash: 'h1', reader: 'T' },
      { id: 'take2', hash: 'h2', reader: 'T' },
    ]);
    expect(records).toHaveLength(2);
  });
});

// ── the slot rules the composition rests on ──────────────────────────────

describe('renditionFor — one reader, one playable queue', () => {
  it('a full-letter track beats that reader’s own section splits', () => {
    const r = renditionFor([
      cand('section', 1, 's1', 'T'), cand('full', 0, 'f', 'T'), cand('section', 2, 's2', 'T'),
    ], 'T');
    expect(r).toEqual({ kind: 'full', rows: [{ id: 'f', label: null }] });
  });

  it('sections beat parts, and both come back in slot order', () => {
    const r = renditionFor([
      cand('part', 1, 'p1', 'V'), cand('section', 2, 's2', 'V'), cand('section', 1, 's1', 'V'),
    ], 'V');
    expect(r.kind).toBe('sections');
    expect(r.rows).toEqual([{ id: 's1', label: 'Section 1' }, { id: 's2', label: 'Section 2' }]);
  });

  it('a duplicate upload of the same slot is dropped, first seen wins', () => {
    const r = renditionFor([cand('full', 0, 'first', 'B'), cand('full', 0, 'second', 'B')], 'B');
    expect(r.rows).toEqual([{ id: 'first', label: null }]);
  });

  it('an addendum alone is not a rendition', () => {
    expect(renditionFor([cand('addendum', 0, 'a', 'T')], 'T').rows).toEqual([]);
  });

  it('a lone track KEEPS its ordinal here — only composeAlternates knows if it is the whole letter', () => {
    const r = renditionFor([cand('part', 1, 'p1', 'M')], 'M');
    expect(r.rows).toEqual([{ id: 'p1', label: 'Part 1' }]);
    // ...and a complete one-part rendition sheds it on the way into the manifest.
    expect(composeAlternates([cand('part', 1, 'p1', 'M'), cand('part', 1, 'v1', 'V')],
      [{ id: 'v1', label: null }])).toEqual([['M', [['p1']]]]);
  });

  it('returns nothing for a reader who recorded nothing', () => {
    expect(renditionFor([cand('full', 0, 'x', 'V')], 'T').rows).toEqual([]);
  });
});

describe('slotCount + completenessNote', () => {
  it('counts DISTINCT slots across every reader, not files', () => {
    const cands = [
      cand('section', 1, 'a', 'V'), cand('section', 1, 'b', 'T'), cand('section', 2, 'c', 'V'),
    ];
    expect(slotCount(cands, 'section')).toBe(2);
  });

  it('never marks a full-letter rendition as partial', () => {
    expect(completenessNote([cand('section', 1, 'a', 'V'), cand('section', 2, 'b', 'V')],
      { kind: 'full', rows: [{ id: 'f', label: null }] })).toBeNull();
  });
});

describe('reader counting for the report', () => {
  it('counts B/T/V/M separately and keeps zeroes out of the printed line', () => {
    const counts = countByReader([['id1', 'B'], ['id2', 'V'], ['id3', 'V']], (r) => r[1]);
    expect(counts).toEqual({ B: 1, T: 0, V: 2, M: 0 });
    expect(formatReaderCounts(counts)).toBe('B×1, V×2');
  });

  it('says "none" rather than an empty string when nothing was counted', () => {
    expect(formatReaderCounts(countByReader([], (r) => r[1]))).toBe('none');
  });
});

/* ── studyChapterFor — which recordings are study chapters ─────────────────
   The RED is Purity: six recordings, six chapters, one-to-one. The controls
   are what make it mean anything, because the naive version of this rule
   (match a chapter title anywhere in a filename) passes Purity and then steals
   letters — a Bible/Letter Study is assembled FROM letters, so its chapter
   titles ARE letter titles. Measured over the real listing on 2026-09-05: 25
   letter recordings across nine collection folders and the AI songs would be
   claimed as study chapters if the folder scope were dropped. */
describe('studyChapterFor — a study recording, or nothing', () => {
  const CHAPTERS = [
    { id: 'purity-ch1', title: 'Purity Part One: Purity is Important to God' },
    { id: 'purity-ch2', title: 'Purity Part Two: Avoiding Sin' },
    { id: 'purity-ch3', title: 'Purity Part Three: True Repentance' },
    { id: 'purity-ch4', title: 'Purity Part Four: Purification Through the Word of God' },
    { id: 'purity-ch5', title: 'Purity Part Five: Purified in the Spirit' },
    { id: 'purity-ch6', title: 'Purity Part Six: Purified Through the Blood of Messiah' },
    { id: 'lamb-of-god-ch13', title: 'Wisdom Regarding Those Who Killed The Messiah, Who Is Called Christ' },
    { id: 'lamb-of-god-ch15', title: 'The True Chronology Chart' },
  ];
  const S = '17. Bible-Letter Studies/';

  it('maps each of Purity\'s six recordings to its own chapter', () => {
    // Real archive filenames: the separator drifts between ": ", " - " and "_",
    // and each carries a trailing section range the corpus does not have.
    const got = [
      'Purity Part One_Purity is Important to God_1.1-1.4 (read by text-to-speech).mp3',
      'Purity Part Two_Avoiding Sin_2.1-2.4 (read by text-to-speech).mp3',
      'Purity Part Three - True Repentance_3.1-3.2 (read by text-to-speech).mp3',
      'Purity Part Four - Purification Through the Word of God_4.1-4.2 (read by text-to-speech).mp3',
      'Purity Part Five - Purified in the Spirit_5.0 (read by text-to-speech).mp3',
      'Purity Part Six - Purified Through the Blood of Messiah_6.0-6.1 (read by text-to-speech).mp3',
    ].map((n) => studyChapterFor(S + n, CHAPTERS));
    expect(got).toEqual(['purity-ch1', 'purity-ch2', 'purity-ch3',
                         'purity-ch4', 'purity-ch5', 'purity-ch6']);
  });

  it('refuses a LETTER whose title is a study chapter title verbatim', () => {
    // THE control. V1.004 is a letter; lamb-of-god-ch13 is that same text
    // inside a study. Only the folder tells them apart, so a rule without the
    // scope check passes the test above and silently reassigns this recording.
    const letter = '1. Volume 1 - Audio Letters/'
      + 'V1.004_Wisdom Regarding Those Who Killed The Messiah, Who Is Called Christ (read by text-to-speech).mp3';
    expect(studyChapterFor(letter, CHAPTERS)).toBeNull();
    // ...and the same words INSIDE the studies folder do resolve, which is what
    // proves the refusal above is about the folder and not about the title.
    expect(studyChapterFor(S + 'Wisdom Regarding Those Who Killed The Messiah, Who Is Called Christ.mp3',
                           CHAPTERS)).toBe('lamb-of-god-ch13');
  });

  it('refuses a track that spans a whole study rather than one chapter', () => {
    // The Lamb of God recording covers chapters 0-14. It has to be CUT, and
    // "many" must not collapse to "the first one" — that would ship fifteen
    // chapters of audio under one chapter id, painting the wrong text.
    expect(studyChapterFor(
      S + 'YahuShua-The Lamb of God_The TRUE Chronology of The Messiahs Crucifixion and Resurrection.mp3',
      CHAPTERS)).toBeNull();
  });

  it('refuses a non-mp3 in the studies folder', () => {
    expect(studyChapterFor(S + 'Bible:Letter Study PDFs/Satan\'s Devices Part 2 Study.pdf', CHAPTERS)).toBeNull();
  });

  it('is case-insensitive about the extension', () => {
    // One file in 5,151 is ".MP3" (TSOT_Matthew-Chapter-001.MP3). A
    // case-sensitive test drops exactly one chapter and reads like an archive gap.
    expect(studyChapterFor(S + 'Purity Part Two_Avoiding Sin_2.1-2.4.MP3', CHAPTERS)).toBe('purity-ch2');
  });
});
