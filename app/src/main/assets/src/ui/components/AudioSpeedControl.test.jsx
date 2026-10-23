/* W42 (sweep 2026-10-13): Escape in the listening desk's typed-speed field cancelled
   the typing AND reached the app's document-level Escape handler, which closed the
   whole desk (the top of the modal registry). It now stops at the field. */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AudioSpeedReadout } from './AudioSpeedControl.jsx';

afterEach(() => { cleanup(); });

describe('AudioSpeedReadout — W42: Escape in the typed-speed field', () => {
  it('cancels the typing and goes no further than the field', () => {
    let reached = 0;
    const onDoc = () => { reached++; };
    document.addEventListener('keydown', onDoc);
    try {
      render(<AudioSpeedReadout rate={1} />);
      fireEvent.click(screen.getByRole('button', { name: 'Speed, tap to type a value' }));
      const field = screen.getByLabelText('Playback speed', { selector: 'input[type="number"], input:not([type="range"])' });
      fireEvent.keyDown(field, { key: 'Escape' });
      expect(reached).toBe(0);
      expect(screen.getByRole('button', { name: 'Speed, tap to type a value' })).toBeTruthy(); // typing cancelled
    } finally {
      document.removeEventListener('keydown', onDoc);
    }
  });
});
