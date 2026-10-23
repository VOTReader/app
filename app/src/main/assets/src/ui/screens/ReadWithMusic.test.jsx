// @ts-nocheck — the corpus and audio globals are stubbed per test
/* ReadWithMusic — which letters "Letters read with music" lists (s21.3, idea sweep 2026-10-22).
   The list kept only collections a literal reading order names, so a reading in a new or renamed collection
   vanished without a word. A collection the app registers now comes after that order, in the registry's
   order; only one this build does not have at all is left out (its letters cannot open). */
import { describe, it, expect, afterEach } from 'vitest';
import { readingLetters } from './ReadWithMusic.jsx';

const GLOBALS = ['AUDIO_ALTERNATES', 'AUDIO_MANIFEST', 'COL_BY_KEY', 'colLetterArr', 'SongCatalog'];

afterEach(() => { GLOBALS.forEach((k) => { delete globalThis[k]; }); });

function collections(map) {
  globalThis.COL_BY_KEY = new Map(Object.keys(map).map((volKey) => [volKey, { volKey, label: map[volKey].label, letters: map[volKey].letters }]));
  globalThis.colLetterArr = (col) => col.letters;
}

describe('readingLetters', () => {
  it('keeps a registered collection the reading order does not name, after the order; drops an unknown one', () => {
    collections({
      holydays: { label: 'Holy Days', letters: [{ id: 'passover', title: 'Passover' }] },
      wtlb1: { label: 'Words to Live By, Part One', letters: [{ id: 'come', title: 'Come' }, { id: 'go', title: 'Go' }] },
    });
    globalThis.AUDIO_ALTERNATES = {
      'holydays:passover': [['M', 'x']],
      'wtlb1:go': [['M', 'x']],
      'wtlb1:come': [['M', 'x']],
      'ghost:nowhere': [['M', 'x']],
    };
    const rows = readingLetters();
    expect(rows.map((r) => r.key)).toEqual(['wtlb1:come', 'wtlb1:go', 'holydays:passover']);
    expect(rows[2]).toMatchObject({ title: 'Passover', colLabel: 'Holy Days' });
  });

  it('keeps the reading order of the named collections', () => {
    collections({
      wtlb1: { label: 'W1', letters: [{ id: 'a', title: 'A' }] },
      one: { label: 'Volume One', letters: [{ id: 'b', title: 'B' }] },
    });
    globalThis.AUDIO_MANIFEST = { 'wtlb1:a': [[0, 'M']], 'one:b': [[0, 'M']] };
    expect(readingLetters().map((r) => r.key)).toEqual(['one:b', 'wtlb1:a']);
  });
});
