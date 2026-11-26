// @ts-nocheck — node built-ins load the real data files (as AnswersExtras.test.jsx does)
/* reader-behaviour-n4 (audit 11-23): Words To Live By: Part Two's compilation chips ran two entries behind the
   files ("Section 2 · 29–56" plays Entries 31-58). The labels now come from the synced rows, on the real data. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { relabelSections } from './section-labels.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (file, expr) => { const ctx = {}; runInNewContext(readFileSync(resolve(DATA, file), 'utf8') + ';this.X=' + expr + ';', ctx); return ctx.X; };
const SECTIONS = load('audio-manifest.js', 'AUDIO_SECTIONS');
const SYNC = load('audio-sync-sections.js', 'AUDIO_SYNC_SECTIONS');
const ENTRIES = { wtlb1: load('wtlb-one.js', 'WTLB_ONE'), wtlb2: load('wtlb-two.js', 'WTLB_TWO') };
const entriesOf = (vk) => ENTRIES[vk] || null;
const labels = (secs) => secs.map((s) => s[0]);

describe('relabelSections — a compilation names the entries its file reads', () => {
  it('Part Two: each section is labelled from its synced rows, contiguous to the last entry', () => {
    const out = relabelSections(SECTIONS.wtlb2, SYNC, entriesOf);
    expect(labels(out)).toEqual([
      'Section 1 · Intro–30', 'Section 2 · 31–58', 'Section 3 · 59–86', 'Section 4 · 87–114',
      'Section 5 · 115–142', 'Section 6 · 143–172', 'Section 7 · 173–' + ENTRIES.wtlb2[ENTRIES.wtlb2.length - 1].num,
    ]);
    // The file ids and readers are untouched: only the words change.
    expect(out.map((s) => s.slice(1))).toEqual(SECTIONS.wtlb2.map((s) => s.slice(1)));
  });

  it('Part One already agrees, so it is returned as it is (an unproved entry, 125, does not move a boundary)', () => {
    expect(relabelSections(SECTIONS.wtlb1, SYNC, entriesOf)).toBe(SECTIONS.wtlb1);
  });

  it('keeps the hand labels until the timings or the entries are there', () => {
    expect(relabelSections(SECTIONS.wtlb2, null, entriesOf)).toBe(SECTIONS.wtlb2);
    expect(relabelSections(SECTIONS.wtlb2, SYNC, () => null)).toBe(SECTIONS.wtlb2);
    expect(relabelSections(SECTIONS.wtlb2, {}, entriesOf)).toBe(SECTIONS.wtlb2);
  });
});
