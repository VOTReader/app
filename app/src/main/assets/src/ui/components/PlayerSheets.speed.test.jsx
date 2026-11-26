// @ts-nocheck
/* Fix list 14: while a song plays (a mixed queue reached one with the Speed sheet open) the sheet showed the song's
   1×, so 1.5× or ± changed nothing on screen though the reading speed was saved. It shows the reading speed and
   says the song plays at 1×. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as ReactDOM from 'react-dom';
import { render, cleanup, screen } from '@testing-library/react';
import { SpeedSheet } from './PlayerSheets.jsx';

beforeEach(() => { window.ReactDOM = ReactDOM; window.useFocusTrap = () => ({ current: null }); window.SheetHandle = () => null; });
afterEach(() => { cleanup(); delete window.ReactDOM; delete window.useFocusTrap; delete window.SheetHandle; });

describe('SpeedSheet while a song plays', () => {
  it('lights the reading speed and says this song plays at 1×', () => {
    render(<SpeedSheet rate={1.5} song onClose={() => {}} />);
    expect(screen.getByRole('radio', { name: '1.5×' }).getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('.np-speed-sheet .np-sheet-note').textContent).toBe('This song plays at 1×. The speed here is for letters and chapters.');
  });

  it('a reading keeps the note it had', () => {
    render(<SpeedSheet rate={1} onClose={() => {}} />);
    expect(document.querySelector('.np-speed-sheet .np-sheet-note').textContent).toBe('Applies to letters and chapters. Songs always play at 1×.');
  });
});
