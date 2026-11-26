/* SettingsScreen — the two rows the tour names, by the words the reader sees elsewhere.
   ─────────────────────────────────────────────────────────────────────────
   RED 2026-09-10 (settings-builder, Orchestrator's ruling on the review). The dice had two names:
   the Home button says "Surprise Me" and the Settings row said "Random Letter Button", so a reader
   sent here by the tour ("the Surprise Me button on Home") would not find it. And "Reading Position
   Dot — a pulsing gold dot" describes the marker's shape, which the resume-icon branch changes to a
   bookmark ribbon; the row now names what it DOES and fits both. The Find box must still reach the
   marker row by its new word. WS2 settings (U 8.7): the names are sentence case now. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { setupSettingsGlobals, teardownSettingsGlobals, renderSettings, row, rowLabels } from './settings-harness.jsx';

beforeEach(() => { setupSettingsGlobals(); });
afterEach(() => { cleanup(); teardownSettingsGlobals(); });

describe('SettingsScreen — the dice and the reading marker rows carry their on-screen names', () => {
  it('the dice row is "Surprise me button", the name the Home button shows; "Random Letter Button" is gone', () => {
    renderSettings();
    expect(row('Surprise me button')).toBeTruthy();
    expect(rowLabels()).not.toContain('Random Letter Button');
  });

  it('the marker row is "Reading position marker" and says what it does, not what shape it is', () => {
    renderSettings();
    const r = row('Reading position marker');
    expect(r).toBeTruthy();
    expect(rowLabels()).not.toContain('Reading Position Dot');
    const desc = r.querySelector('.settings-row-desc').textContent;
    expect(desc).toMatch(/where you left off/);
    expect(desc).toMatch(/top bar/);
    expect(desc).not.toMatch(/\bdot\b/i);
  });

  /* search200 UX D7: the row said the marker "follows you the moment you open any chapter or letter", but one
     opened from a search is a look and moves nothing until the reader reads it (utils/search-visit.js
     SEARCH_LOOK_MS). */
  it('D7: the marker row no longer promises it follows the moment you open a page', () => {
    renderSettings();
    const r = row('Reading position marker');
    const desc = r.querySelector('.settings-row-desc').textContent;
    expect(desc).not.toMatch(/the moment you open/);
    // WS2 settings: the row carries the design's short line (U 8.7)
    expect(desc).toBe('Shows where you left off, in the top bar. Tap it to go back.');
  });

  it('typing "marker" into Find settings still reaches the row, with its place', () => {
    renderSettings({}, {}, { expandGroups: false });
    fireEvent.change(screen.getByLabelText('Find settings'), { target: { value: 'marker' } });
    const r = row('Reading position marker');
    expect(r).toBeTruthy();
    expect(r.querySelector('.ws2-place').textContent).toBe('Reading · Your place');
  });
});

// look-8 (audit 11-23): the text size note says all text, and names the phone's font size only on Android.
describe('SettingsScreen — the text size note', () => {
  const note = () => [...document.querySelectorAll('.ws1-note')].find((p) => /size of all text/.test(p.textContent));
  it('on the web it says all text and icons and buttons, with no phone font clause', () => {
    renderSettings();
    expect(note().textContent).toBe('Changes the size of all text in the app. Icons and buttons stay the same size.');
  });
  it('in the APK it adds that the phone font size does not affect it', () => {
    /** @type {any} */ (globalThis).PlatformBridge.isAndroid = true;
    renderSettings();
    expect(note().textContent).toBe('Changes the size of all text in the app. Icons and buttons stay the same size. Your phone’s own font size does not affect it.');
  });
});
