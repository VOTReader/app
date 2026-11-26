/* data-2 (audit 11-23): the restore confirm showed only the file's counts and no media line,
   so "Journal entries 0" never said this phone had 4 that would go. It now shows the file
   beside this phone, photos and recordings included. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BackupCounts } from './SettingsScreen.jsx';
import { summarizeBackupManifest } from '../../utils/backup-verify.js';

afterEach(cleanup);
/** What a cell shows on screen: its text without the words kept for screen readers. */
const vis = (x) => [...x.childNodes].filter((c) => !(c.classList && c.classList.contains('sr-only'))).map((c) => c.textContent).join('');
const rows = (c) => [...c.querySelectorAll('.ws3-count')].map((r) => [r.children[0].textContent, ...[...r.querySelectorAll('.ws3-count-n')].map(vis)]);
/** The words a screen reader hears for a dash cell, and that the dash itself is hidden from it. */
const spoken = (cell) => { expect(cell.querySelector('[aria-hidden="true"]').textContent).toBe('–'); expect(cell.getAttribute('aria-label')).toBeNull(); expect(cell.getAttribute('title')).toBeNull(); return cell.querySelector('.sr-only').textContent; };

describe('BackupCounts (data-2)', () => {
  const file = { notes: 0, highlights: 0, journal: 0, bookmarks: 1, mediaCount: 0 };

  it('REPRO: with this phone given, each row reads file | this phone, photos and recordings included', () => {
    const { container } = render(<BackupCounts s={file} here={{ notes: 6, highlights: 55, journal: 4, bookmarks: 2, mediaCount: 3 }} />);
    expect(container.querySelector('.ws3-counts').className).toContain('has-here');
    expect(rows(container)).toEqual([
      ['', 'Backup', 'This phone'],
      ['Notes', '0', '6'], ['Highlights', '0', '55'], ['Journal entries', '0', '4'], ['Bookmarks', '1', '2'],
      ['Photos and recordings', '0', '3'],
    ]);
  });

  it('without it (the backup check sheet) one column, as before, plus the media line', () => {
    const { container } = render(<BackupCounts s={{ ...file, mediaCount: 7 }} />);
    expect(container.querySelector('.ws3-counts').className).not.toContain('has-here');
    expect(rows(container)[4]).toEqual(['Photos and recordings', '7']);
    expect(rows(container)).toHaveLength(5);
  });
});

/* data-7 (audit 11-23): links, notebooks, reading plans and read marks, which a restore overwrites too, had no row,
   so a plans-and-progress backup read as zeros and this phone's read marks never showed beside it. */
describe('BackupCounts: the kinds past the first four (data-7)', () => {
  const four = { notes: 0, highlights: 0, journal: 0, bookmarks: 0, mediaCount: 0 };

  it('REPRO: each kind the file holds gets a row, before the media line', () => {
    const { container } = render(<BackupCounts s={{ ...four, links: 3, notebooks: 1, plans: 1, readMarks: 4 }} />);
    expect(rows(container)).toEqual([
      ['Notes', '0'], ['Highlights', '0'], ['Journal entries', '0'], ['Bookmarks', '0'],
      ['Links', '3'], ['Notebooks', '1'], ['Reading plans', '1'], ['Marked read', '4'],
      ['Photos and recordings', '0'],
    ]);
  });

  it('beside this phone: a kind only the phone holds still gets its row, so a reader sees what goes', () => {
    const { container } = render(<BackupCounts s={{ ...four, links: 0, plans: 0, notebooks: 0, readMarks: 0 }}
      here={{ ...four, links: 0, plans: 2, notebooks: 0, readMarks: 627 }} />);
    expect(rows(container).slice(5)).toEqual([['Reading plans', '0', '2'], ['Marked read', '0', '627'], ['Photos and recordings', '0', '0']]);
  });

  it('an old summary without those fields (or a phone count that failed) shows the first rows only, and no crash', () => {
    const { container } = render(<BackupCounts s={four} here={{}} />);
    expect(rows(container).map((r) => r[0])).toEqual(['', 'Notes', 'Highlights', 'Journal entries', 'Bookmarks', 'Photos and recordings']);
  });
});

/* A kind the backup does not carry is left untouched by a restore: "0" there read as a wipe. A dash says the file
   has none of it; 0 stays for a kind the file carries empty. Counted through the real summary, as the sheet is. */
describe('BackupCounts: a dash for a kind the file does not carry', () => {
  const sum = (doc) => summarizeBackupManifest({ exportVersion: 3, ...doc });

  it('REPRO: missing kinds read "–" beside this phone; a carried empty kind reads 0', () => {
    const s = sum({ exportVersion: 2, data: {}, stores: { 'vot-notes': {}, 'vot-links': [{ id: 'l1' }] } });
    const { container } = render(<BackupCounts s={s} here={{ notes: 6, highlights: 55, journal: 4, bookmarks: 2, links: 0, readMarks: 627, mediaCount: 3 }} />);
    expect(rows(container)).toEqual([
      ['', 'Backup', 'This phone'],
      ['Notes', '0', '6'], ['Highlights', '–', '55'], ['Journal entries', '–', '4'], ['Bookmarks', '–', '2'],
      ['Links', '1', '0'], ['Marked read', '–', '627'],
      ['Photos and recordings', '–', '3'],
    ]);
    const dash = [...container.querySelectorAll('.ws3-count-n')].find((x) => vis(x) === '–');
    expect(spoken(dash)).toBe('Not in this backup');
  });

  it('the check sheet (one column) shows the same dashes', () => {
    const { container } = render(<BackupCounts s={sum({ stores: { 'vot-bookmarks': [] }, media: [] })} />);
    expect(rows(container)).toEqual([
      ['Notes', '–'], ['Highlights', '–'], ['Journal entries', '–'], ['Bookmarks', '0'], ['Photos and recordings', '0'],
    ]);
  });

  it('a v3 file with only counts (no stores block, which the restore would not write) is a dash on every row', () => {
    const { container } = render(<BackupCounts s={sum({ counts: { 'vot-notes': 2, 'vot-state': 1, _media: 0 }, media: [] })} />);
    const r = rows(container);
    expect(r).toContainEqual(['Notes', '–']);
    expect(r).not.toContainEqual(['Notes', '2']);
    const notes = [...container.querySelectorAll('.ws3-count')].find((x) => x.children[0].textContent === 'Notes');
    expect(spoken(notes.querySelector('.ws3-count-n'))).toBe('Not in this backup');
  });

  it('a store the restore will skip (it fails the shape check) reads "skipped" in sight and to screen readers', () => {
    const { container } = render(<BackupCounts s={sum({ stores: { 'vot-notes': {}, 'vot-links': 'junk' }, media: [] })} here={{ notes: 1, links: 4 }} />);
    expect(rows(container)).toContainEqual(['Links', 'skipped', '4']);
    const cell = [...container.querySelectorAll('.ws3-count')].find((x) => x.children[0].textContent === 'Links').querySelector('.ws3-count-n');
    expect(cell.className).toContain('is-skipped');
    expect(cell.querySelector('[aria-hidden="true"]').textContent).toBe('skipped');
    expect(cell.querySelector('.sr-only').textContent).toBe("Will be skipped: this app can't read this part of the backup");
  });

  it('a damaged vot-links on a phone with no links still gets its row (the row rule counts skipped kinds)', () => {
    const { container } = render(<BackupCounts s={sum({ stores: { 'vot-notes': {}, 'vot-links': 'junk' }, media: [] })} here={{ notes: 1, links: 0 }} />);
    expect(rows(container)).toContainEqual(['Links', 'skipped', '0']);
  });

  it('the two notebook stores are two rows: a file with only journal notebooks does not claim the others', () => {
    const s = sum({ stores: { 'vot-journal-notebooks': { list: [{ id: 'j1' }, { id: 'j2' }] } }, media: [] });
    const { container } = render(<BackupCounts s={s} here={{ notebooks: 3, journalNotebooks: 1 }} />);
    const r = rows(container);
    expect(r).toContainEqual(['Notebooks', '–', '3']);
    expect(r).toContainEqual(['Journal notebooks', '2', '1']);
  });
});
