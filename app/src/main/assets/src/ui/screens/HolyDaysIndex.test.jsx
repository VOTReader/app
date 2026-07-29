// @ts-nocheck — bare-name globals, same reality as the sibling suites
/* HolyDaysIndex — FABLE5 [12] Year view. Pins: the toggle defaults to the
   existing List view (VolumeLetterIndex untouched), Year view renders one
   timeline row per entry IN DATA ORDER with tap-through via onSelect, and
   nothing is authored — rows carry exactly the entry's own title/label. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HolyDaysIndex } from './HolyDaysIndex.jsx';

const LETTERS = [
  { id: 'the-holy-days', num: 1, title: 'The Holy Days', date: 'Words To Live By: Part Two' },
  { id: 'embracing-the-gift', num: 2, title: 'Embracing The Gift', date: 'Words To Live By: Part One' },
  { id: 'passover', num: 3, title: 'The Passover', date: 'Volume Two' },
];

beforeEach(() => {
  globalThis.HolyDaysPlaylistHeader = () => null;
  globalThis.VolumeLetterIndex = vi.fn(() => React.createElement('div', { 'data-testid': 'vli' }));
});
afterEach(() => { cleanup(); delete globalThis.HolyDaysPlaylistHeader; delete globalThis.VolumeLetterIndex; });

describe('HolyDaysIndex — [12] year view', () => {
  it('defaults to the List view (the shared VolumeLetterIndex, props passed through)', () => {
    render(React.createElement(HolyDaysIndex, { letters: LETTERS, onSelect: vi.fn(), isRead: () => false, markAsReadEnabled: false, currentLetter: null }));
    expect(screen.getByTestId('vli')).toBeTruthy();
    expect(globalThis.VolumeLetterIndex).toHaveBeenCalledWith(
      expect.objectContaining({ volumeTitle: 'Regarding The Holy Days', letters: LETTERS }),
      undefined,
    );
  });

  it('Year view renders every entry in data order with its own title + label; tap navigates', () => {
    const onSelect = vi.fn();
    render(React.createElement(HolyDaysIndex, { letters: LETTERS, onSelect, isRead: () => false, markAsReadEnabled: false, currentLetter: null }));
    fireEvent.click(screen.getByRole('tab', { name: 'Year view' }));
    const rows = Array.from(document.querySelectorAll('.hd-timeline-row'));
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.querySelector('.hd-timeline-name').textContent))
      .toEqual(['The Holy Days', 'Embracing The Gift', 'The Passover']);
    expect(rows[2].querySelector('.hd-timeline-src').textContent).toBe('Volume Two');
    fireEvent.click(rows[1]);
    expect(onSelect).toHaveBeenCalledWith('embracing-the-gift');
  });

  it('read checkmarks appear only when markAsRead is enabled and the entry is read', () => {
    render(React.createElement(HolyDaysIndex, {
      letters: LETTERS, onSelect: vi.fn(),
      isRead: (id) => id === 'passover', markAsReadEnabled: true, currentLetter: null,
    }));
    fireEvent.click(screen.getByRole('tab', { name: 'Year view' }));
    const rows = Array.from(document.querySelectorAll('.hd-timeline-row'));
    expect(rows[2].querySelector('.hd-timeline-read')).toBeTruthy();
    expect(rows[0].querySelector('.hd-timeline-read')).toBeNull();
  });
});
