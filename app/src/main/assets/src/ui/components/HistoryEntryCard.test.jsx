// @ts-nocheck — free-var globals stubbed per test (bundle-d component contract)
/* HistoryEntryCard — the collection line stops guessing (C2-C [C2]).
   ═══════════════════════════════════════════════════════════════════════
   THE DEFECT: the label chain ENDED at 'Volume Two'.

     entry.volume === 1 ? 'Volume One' : _volCol ? _volCol.label : 'Volume Two'

   So any letter row the collection registry could not resolve was labelled
   Volume Two — on the one screen whose entire job is telling the reader what
   they read. Same class as the misattributed letter-link the corpus audits
   were built to catch: not "unknown", a confident wrong answer.

   The registry now answers first; the LEGACY numeric `volume` (a recorded
   datum, not a guess) still names volumes one and two; anything left drops
   the line entirely rather than inventing a collection.
*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { HistoryEntryCard } from './HistoryEntryCard.jsx';
import { timeAgo } from '../../utils/dates.js';

const GLOBALS = ['COL_BY_INDEX_SC', 'studyAbbrev', 'timeAgo'];

beforeEach(() => {
  globalThis.COL_BY_INDEX_SC = new Map([
    ['vot-five-index', { label: 'Volume Five', readKey: 'volume-five' }],
  ]);
  globalThis.studyAbbrev = (_slug, fallback) => fallback || '';
  globalThis.timeAgo = timeAgo;
});
afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const label = () => {
  const el = document.querySelector('.history-entry-label');
  return el ? el.textContent : null;
};
const title = () => document.querySelector('.ui-row-title').textContent;

const show = (entry, props = {}) => render(
  <HistoryEntryCard entry={entry} onSelect={() => {}} {...props} />,
);

const LETTER = {
  type: 'letter', key: 'lt:x', letterId: 'x', letterTitle: 'A Letter',
  letterNum: 4, ts: Date.now(),
};

describe('HistoryEntryCard — letter rows', () => {
  it('names the collection the registry resolves', () => {
    show({ ...LETTER, volumeScreen: 'vot-five-index' });
    expect(label()).toBe('Volume Five');
  });

  it('shows NO collection line when the row cannot be resolved (was "Volume Two")', () => {
    show({ ...LETTER });
    expect(label()).toBeNull();
    expect(document.body.textContent).not.toContain('Volume Two');
    expect(title()).toBe('A Letter');    // the row itself is unharmed
  });

  it('shows no line for an index screen the registry has retired', () => {
    show({ ...LETTER, volumeScreen: 'vot-gone-index' });
    expect(label()).toBeNull();
  });

  it('still honours a legacy numeric volume — that one was recorded', () => {
    show({ ...LETTER, volume: 1 });
    expect(label()).toBe('Volume One');
    cleanup();
    show({ ...LETTER, volume: 2 });
    expect(label()).toBe('Volume Two');
  });

  it('prefers the registry over a stale legacy number when both are present', () => {
    show({ ...LETTER, volume: 1, volumeScreen: 'vot-five-index' });
    expect(label()).toBe('Volume Five');
  });

  it('falls back to "Letter N" for a title-less row', () => {
    show({ ...LETTER, letterTitle: null, volumeScreen: 'vot-five-index' });
    expect(title()).toBe('Letter 4');
  });
});

describe('HistoryEntryCard — chapter and study rows', () => {
  it('names a chapter row by its book', () => {
    show({ type: 'chapter', key: 'ch', bookId: 'psalms', bookTitle: 'Psalms', chapterNum: 23, chapterTitle: 'The Lord Is My Shepherd', ts: Date.now() });
    expect(label()).toBe('Psalms');
    expect(title()).toBe('The Lord Is My Shepherd');
  });

  it('never prints "undefined" for a chapter row with no book title', () => {
    show({ type: 'chapter', key: 'ch', bookId: 'psalms', chapterNum: 23, ts: Date.now() });
    expect(label()).toBeNull();
    expect(document.body.textContent).not.toContain('undefined');
    expect(title()).toBe('Chapter 23');
  });

  it('names a study row by its abbreviation', () => {
    show({ type: 'study-chapter', key: 'st', studySlug: 'lamb', studyTitle: 'The Lamb of God', chapterNum: 3, chapterTitle: null, ts: Date.now() });
    expect(label()).toBe('The Lamb of God');
    expect(title()).toBe('Part 3');
  });
});

/* reader-behaviour-n3 (audit 11-23): an entry collection's row said "Letter 63", and an Answers topic carried a
   number that is only its place in the file. The number takes the collection's own noun; Answers shows none. */
describe('HistoryEntryCard — each collection names its own pieces', () => {
  beforeEach(() => {
    globalThis.COL_BY_INDEX_SC = new Map([
      ['wtlb-two-index', { volKey: 'wtlb2', label: 'Words To Live By: Part Two', kind: 'wtlb' }],
      ['answers-home', { volKey: 'answers', label: 'Answers Only God Can Give', kind: 'wtlb' }],
      ['holy-days-index', { volKey: 'holydays', label: 'Regarding The Holy Days', kind: 'holy-days' }],
    ]);
  });

  it('a Words To Live By row says Entry N', () => {
    show({ ...LETTER, letterNum: 31, volumeScreen: 'wtlb-two-index' });
    expect(document.querySelector('.history-entry-num').textContent).toBe('Entry 31');
    cleanup();
    show({ ...LETTER, letterTitle: null, letterNum: 31, volumeScreen: 'wtlb-two-index' });
    expect(title()).toBe('Entry 31');
  });

  it('an Answers topic shows no number', () => {
    show({ ...LETTER, letterTitle: 'Regarding the Sabbath', letterNum: 63, volumeScreen: 'answers-home' });
    expect(label()).toBe('Answers Only God Can Give');
    expect(document.querySelector('.history-entry-num')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Letter 63|Entry 63/);
  });

  it('the Holy Days keep Letter N', () => {
    show({ ...LETTER, letterNum: 2, volumeScreen: 'holy-days-index' });
    expect(document.querySelector('.history-entry-num').textContent).toBe('Letter 2');
  });
});

describe('HistoryEntryCard — row mechanics', () => {
  it('renders the chip it is handed, and passes the entry back on select', () => {
    const picked = [];
    const entry = { ...LETTER, volumeScreen: 'vot-five-index' };
    render(
      <HistoryEntryCard entry={entry} onSelect={(e) => picked.push(e)} chip={<span className="idx-min-chip">~3 min</span>} />,
    );
    expect(document.querySelector('.idx-min-chip').textContent).toBe('~3 min');
    fireEvent.click(document.querySelector('.ui-row'));
    expect(picked).toEqual([entry]);
  });
});

/* n130: the number is named beside the collection (it used to stand alone, reading like a rank). */
describe('HistoryEntryCard — the number is named (n130)', () => {
  it('a titled row names its number beside the collection; an untitled one does not repeat it', () => {
    show({ ...LETTER, volumeScreen: 'vot-five-index' });
    expect(document.querySelector('.history-entry-num').textContent).toBe('Letter 4');
    expect(document.querySelector('.chapter-card-num')).toBeNull();
    cleanup();
    show({ ...LETTER, letterTitle: null, volumeScreen: 'vot-five-index' });
    expect(document.querySelector('.history-entry-num')).toBeNull();
  });
});
