/* SettingsScreen — the two rows the tour names, by the words the reader sees elsewhere.
   ─────────────────────────────────────────────────────────────────────────
   RED 2026-09-10 (settings-builder, Orchestrator's ruling on the review). The dice had two names:
   the Home button says "Surprise Me" and the Settings row said "Random Letter Button", so a reader
   sent here by the tour ("the Surprise Me button on Home") would not find it. And "Reading Position
   Dot — a pulsing gold dot" describes the marker's shape, which the resume-icon branch changes to a
   bookmark ribbon; the row now names what it DOES and fits both. The Find box must still reach the
   marker row by its new word. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { setupSettingsGlobals, teardownSettingsGlobals, renderSettings, row, rowLabels } from './settings-harness.jsx';

beforeEach(() => { setupSettingsGlobals(); });
afterEach(() => { cleanup(); teardownSettingsGlobals(); });

describe('SettingsScreen — the dice and the reading marker rows carry their on-screen names', () => {
  it('the dice row is "Surprise Me Button", the name the Home button shows; "Random Letter Button" is gone', () => {
    renderSettings();
    expect(row('Surprise Me Button')).toBeTruthy();
    expect(rowLabels()).not.toContain('Random Letter Button');
  });

  it('the marker row is "Reading Position Marker" and says what it does, not what shape it is', () => {
    renderSettings();
    const r = row('Reading Position Marker');
    expect(r).toBeTruthy();
    expect(rowLabels()).not.toContain('Reading Position Dot');
    fireEvent.click(r.querySelector('.settings-info-btn'));
    const desc = r.querySelector('.settings-row-desc').textContent;
    expect(desc).toMatch(/where you left off reading/);
    expect(desc).toMatch(/top bar/);
    expect(desc).not.toMatch(/\bdot\b/i);
  });

  it('typing "marker" into Find settings still reaches the row', () => {
    renderSettings({}, {}, { expandGroups: false });
    fireEvent.change(screen.getByLabelText('Find settings'), { target: { value: 'marker' } });
    expect(row('Reading Position Marker')).toBeTruthy();
  });
});
