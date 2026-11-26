/* data-2 (audit 11-23): the restore confirm showed only the file's counts and no media line,
   so "Journal entries 0" never said this phone had 4 that would go. It now shows the file
   beside this phone, photos and recordings included. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BackupCounts } from './SettingsScreen.jsx';

afterEach(cleanup);
const rows = (c) => [...c.querySelectorAll('.ws3-count')].map((r) => [r.children[0].textContent, ...[...r.querySelectorAll('.ws3-count-n')].map((x) => x.textContent)]);

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
