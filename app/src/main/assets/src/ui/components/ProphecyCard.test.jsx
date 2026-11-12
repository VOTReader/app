// @ts-nocheck — free-var globals stubbed per test (bundle-d component contract)
/* W44 (sweep 2026-10-13): a prophecy card that mounted while LetterView still held
   an expand/collapse-all signal from an earlier letter applied it, over its own
   saved state: collapse-all carried into later chapters. A card now acts only on a
   signal that changes while it is mounted. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ProphecyCard } from './ProphecyCard.jsx';

beforeEach(() => {
  globalThis.Segments = () => null;
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
});
afterEach(() => {
  cleanup();
  delete globalThis.Segments;
  delete globalThis.StaticSubtree;
});

const card = (props) => (
  <ProphecyCard type="ot" tag="Old Testament Prophecy" blocks={[]} fnProps={{}} stateKey="L2:3:ot" {...props} />
);
const expanded = () => document.querySelector('.prophecy-card-header').getAttribute('aria-expanded');

describe('ProphecyCard — W44: the expand/collapse-all signal', () => {
  it('a signal left from an earlier letter does not touch a card that mounts after it', () => {
    const statesRef = { current: {} };
    render(card({ expandSignal: -1, statesRef }));
    expect(expanded()).toBe('true');                        // its default, not the old collapse-all
    expect(statesRef.current['L2:3:ot']).toBeUndefined();
  });

  it('a saved state wins over a stale signal at mount', () => {
    const statesRef = { current: { 'L2:3:ot': false } };
    render(card({ expandSignal: 2, statesRef }));
    expect(expanded()).toBe('false');
  });

  it('a signal that changes while the card is mounted still applies', () => {
    const statesRef = { current: {} };
    const { rerender } = render(card({ expandSignal: 0, statesRef }));
    rerender(card({ expandSignal: -1, statesRef }));
    expect(expanded()).toBe('false');
    expect(statesRef.current['L2:3:ot']).toBe(false);
    rerender(card({ expandSignal: 1, statesRef }));
    expect(expanded()).toBe('true');
  });
});

describe('ProphecyCard — the new card language (studies pass 2026-11-12)', () => {
  it('its chevron is the Collapse-all control icon, hidden from a screen reader, turned when closed', () => {
    const statesRef = { current: { 'L2:3:ot': false } };
    render(card({ statesRef }));
    const chev = document.querySelector('.prophecy-card-chevron');
    expect(chev.getAttribute('aria-hidden')).toBe('true');
    expect(chev.querySelector('svg polyline').getAttribute('points')).toBe('6 9 12 15 18 9');
    expect(chev.textContent).toBe('');
    expect(chev.classList.contains('collapsed')).toBe(true);
    expect(document.querySelector('.prophecy-card').className).toBe('prophecy-card pc-ot');
  });
});
