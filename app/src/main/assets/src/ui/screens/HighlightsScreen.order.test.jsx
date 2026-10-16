// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* Sweep v067 — a mark that crosses containers quotes its parts in reading order.

   SelectionToolbar's multi-container branch adds every segment of one group in a single
   loop with created = Date.now(), so the segments almost always share `created`. The old
   tiebreak was `start`, a character offset inside each segment's OWN container: a highlight
   that begins mid-way through paragraph 1 (start 50) and runs into paragraph 2 (start 0)
   sorted paragraph 2 first, and the Highlights row quoted the passage back to front.

   Every hlKey ends in its block, verse or paragraph index (utils/hl-keys.js), so a
   numeric-aware compare of the keys gives document order; `start` only orders segments
   that share a key. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';
import { _collectMarks } from './HighlightsScreen.jsx';

const GLOBALS = ['AnnotationStore', 'normalizeExcerptDisplay'];
let marks = {};

beforeEach(() => {
  globalThis.normalizeExcerptDisplay = normalizeExcerptDisplay;
  globalThis.AnnotationStore = { subscribe: () => () => {}, getVersion: () => 0, all: () => marks };
});
afterEach(() => { GLOBALS.forEach((k) => { delete globalThis[k]; }); });

const seg = (id, start, text, created = 1000) => ({ id, groupId: 'g', kind: 'highlight', color: 'yellow', start, end: start + text.length, text, created });
const quote = () => _collectMarks().find((m) => m.groupId === 'g').text;

describe('Highlights — a multi-container mark quotes in reading order (sweep v067)', () => {
  it('a selection from mid-paragraph into the next paragraph reads first-then-second', () => {
    marks = {
      'letter:the-letter:3': [seg('a', 50, 'the end of the first paragraph')],
      'letter:the-letter:4': [seg('b', 0, 'and the start of the second')],
    };
    expect(quote()).toBe('the end of the first paragraph and the start of the second');
  });

  it('orders block indices as numbers, not strings (9 before 10)', () => {
    marks = {
      'letter:the-letter:9': [seg('a', 12, 'nine')],
      'letter:the-letter:10': [seg('b', 0, 'ten')],
      'letter:the-letter:11': [seg('c', 0, 'eleven')],
    };
    expect(quote()).toBe('nine ten eleven');
  });

  it('crosses a Bible chapter boundary in order (Genesis 1:31 then 2:1)', () => {
    marks = {
      'bible:genesis:2:1': [seg('b', 0, 'Thus the heavens')],
      'bible:genesis:1:31': [seg('a', 20, 'it was very good')],
    };
    expect(quote()).toBe('it was very good Thus the heavens');
  });

  it('reads a verse, then its study notes, then the next verse (study:<ch>:12-s0)', () => {
    marks = {
      'study:matthew-5:13': [seg('c', 0, 'Ye are the salt')],
      'study:matthew-5:12-v0': [seg('b2', 0, 'vot note')],
      'study:matthew-5:12-s0': [seg('b1', 0, 'scripture note')],
      'study:matthew-5:12': [seg('a', 30, 'great is your reward')],
    };
    expect(quote()).toBe('great is your reward scripture note vot note Ye are the salt');
  });

  it('follows the prophecy cards in the order they render (intro, ot, nt, vot)', () => {
    marks = {
      'letter:ch:6:vot:0': [seg('d', 0, 'volumes')],
      'letter:ch:6:nt:0': [seg('c', 0, 'fulfilled')],
      'letter:ch:6:ot:0': [seg('b', 0, 'prophesied')],
      'letter:ch:6:intro:1': [seg('a', 40, 'introduced')],
    };
    expect(quote()).toBe('introduced prophesied fulfilled volumes');
  });

  it('still orders by start within one container', () => {
    marks = {
      'wtlb:entry:2': [seg('b', 40, 'second'), seg('a', 5, 'first')],
    };
    expect(quote()).toBe('first second');
  });

  it('keeps created as the first key when the segments were made at different times', () => {
    marks = {
      'letter:the-letter:3': [seg('a', 50, 'later', 2000)],
      'letter:the-letter:4': [seg('b', 0, 'earlier', 1000)],
    };
    expect(quote()).toBe('earlier later');
  });
});
