/* ProphecyExpandToggle — portal contract.
   ─────────────────────────────────────────
   The FAB is position:fixed (.mode-toggle-wrap). When it lived inside the
   reading screen's `.pager-track`, a page-swipe settle put a transient
   `transform` on that track; a transformed ancestor becomes the containing
   block for fixed descendants, so the FAB's bottom/right re-anchored to the
   tall scrolled track and floated off-position during the ~300ms settle
   window. Same defect class as the ScriptureSheet / FootnoteSheet bug fixed
   2026-06-21 — the fix portals the FAB to <body> so it can never be a
   descendant of a transformed track. */

import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { ProphecyExpandToggle } from './ProphecyExpandToggle.jsx';

beforeEach(() => {
  // ProphecyExpandToggle reads ReactDOM as a free-var global (window-attached in prod).
  /** @type {any} */ (globalThis).ReactDOM = ReactDOM;
});
afterEach(() => { cleanup(); });

it('renders in place, in the page flow (nothing floats over a reader)', () => {
  const { container } = render(
    <div className="pager-track">
      <ProphecyExpandToggle allExpanded={false} onToggle={() => {}} />
    </div>,
  );
  expect(container.querySelector('.pager-track .prophecy-expand-row')).not.toBeNull();
  expect(document.body.querySelector('.mode-toggle-wrap')).toBeNull();
});

it('fires onToggle with the flipped state', () => {
  const onToggle = vi.fn();
  render(<ProphecyExpandToggle allExpanded={false} onToggle={onToggle} />);
  document.body.querySelector('.prophecy-expand-btn')
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(onToggle).toHaveBeenCalledWith(true);
});

it('labels Collapse when expanded, Expand when collapsed, and says which', () => {
  const { rerender } = render(<ProphecyExpandToggle allExpanded={false} onToggle={() => {}} />);
  const btn = () => document.body.querySelector('.prophecy-expand-btn');
  expect(btn().textContent).toBe('Expand all cards');
  expect(btn().getAttribute('aria-expanded')).toBe('false');
  rerender(<ProphecyExpandToggle allExpanded={true} onToggle={() => {}} />);
  expect(btn().textContent).toBe('Collapse all cards');
  expect(btn().getAttribute('aria-expanded')).toBe('true');
});
