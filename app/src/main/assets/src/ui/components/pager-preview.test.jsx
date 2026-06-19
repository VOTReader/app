// @ts-nocheck — presentational render assertions; React is a global (vitest.setup.js)
/* pager-preview — the neighbor-page shell for the finger-follow page swipe.
   The peek is now the REAL screen rendered inert (kind:'screen'); this file
   wraps it in the sliding `.pager-peek` shell or renders a boundary card. The
   load-bearing assertions: the shell is aria-hidden + HTML-inert (out of the
   focus / a11y tree), it renders exactly what pager.peek() handed it, and
   resolveNeighborLetter degrades safely when corpus globals are absent. */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PagerPeek, resolveNeighborLetter, savedScrollFor, letterScrollKey } from './pager-preview.jsx';

afterEach(cleanup);

describe('PagerPeek wrapper', () => {
  it('renders a screen peek — the inert neighbor element — inside an aria-hidden, HTML-inert shell', () => {
    const el = <div className="screen-scroll"><h1 className="hero-title">The Narrow Gate</h1><p>body text here</p></div>;
    const { container } = render(<PagerPeek side="next" desc={{ kind: 'screen', el }} />);
    const shell = container.querySelector('.pager-peek-next');
    expect(shell).toBeTruthy();
    expect(shell.getAttribute('aria-hidden')).toBe('true');
    // HTML `inert` keeps the clone non-interactive + out of the a11y/focus tree.
    expect(shell.hasAttribute('inert')).toBe(true);
    // It renders the real element it was handed (its own .screen-scroll), verbatim.
    expect(shell.querySelector('.screen-scroll')).toBeTruthy();
    expect(container.querySelector('.hero-title').textContent).toBe('The Narrow Gate');
    expect(container.textContent).toContain('body text here');
  });

  it('puts the shell on the correct side', () => {
    const el = <div className="screen-scroll">x</div>;
    const { container } = render(<PagerPeek side="prev" desc={{ kind: 'screen', el }} />);
    expect(container.querySelector('.pager-peek-prev')).toBeTruthy();
    expect(container.querySelector('.pager-peek-next')).toBeNull();
  });

  it('renders a boundary card peek (no full content)', () => {
    const { container } = render(
      <PagerPeek side="next" desc={{ kind: 'boundary', eyebrow: 'Next · A Return to the Garden', title: 'A Return to the Garden' }} />
    );
    const shell = container.querySelector('.pager-peek-next');
    expect(shell).toBeTruthy();
    expect(shell.getAttribute('aria-hidden')).toBe('true');
    expect(shell.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('.pager-peek-boundary')).toBeTruthy();
    expect(container.querySelector('.bottom-nav-label').textContent).toBe('Next · A Return to the Garden');
    expect(container.querySelector('.bottom-nav-title').textContent).toBe('A Return to the Garden');
  });

  it('renders nothing for a null descriptor (a dead end)', () => {
    const { container } = render(<PagerPeek side="next" desc={null} />);
    expect(container.querySelector('.pager-peek')).toBeNull();
  });
});

describe('resolveNeighborLetter', () => {
  it('returns null safely when corpus globals are unavailable', () => {
    // COL_BY_KEY is undefined in the test env — the typeof guard must hold.
    expect(resolveNeighborLetter('two', 'some-id')).toBeNull();
    expect(resolveNeighborLetter(null, null)).toBeNull();
  });
});

describe('savedScrollFor — neighbor saved-scroll lookup for the inert peek', () => {
  it('returns the saved record for a key, null for a miss / bad input', () => {
    const prev = window.__scrollPositions;
    window.__scrollPositions = { 'letter-x': { y: 120, anchorKey: 'k' } };
    expect(savedScrollFor('letter-x')).toEqual({ y: 120, anchorKey: 'k' });
    expect(savedScrollFor('missing')).toBeNull();
    expect(savedScrollFor(null)).toBeNull();
    window.__scrollPositions = prev;
  });
  it('returns null when no positions are published yet', () => {
    const prev = window.__scrollPositions;
    delete window.__scrollPositions;
    expect(savedScrollFor('anything')).toBeNull();
    window.__scrollPositions = prev;
  });
});

describe('letterScrollKey', () => {
  it('returns null safely when corpus globals are unavailable', () => {
    // COL_BY_KEY is undefined in the test env — the typeof guard must hold.
    expect(letterScrollKey('two', 'some-id')).toBeNull();
    expect(letterScrollKey(null, null)).toBeNull();
  });
});
