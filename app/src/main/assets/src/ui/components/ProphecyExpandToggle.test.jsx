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

it('portals the FAB OUT of a transformed .pager-track to <body>', () => {
  const { container } = render(
    <div className="pager-track" style={{ transform: 'translateX(0px)' }}>
      <ProphecyExpandToggle allExpanded={false} onToggle={() => {}} />
    </div>,
  );
  const track = container.querySelector('.pager-track');
  // The fixed FAB must NOT be a descendant of the transformed track.
  expect(track.querySelector('.mode-toggle-wrap')).toBeNull();
  // It still exists in the document — portaled onto <body>.
  expect(document.body.querySelector('.mode-toggle-wrap')).not.toBeNull();
});

it('fires onToggle with the flipped state', () => {
  const onToggle = vi.fn();
  render(<ProphecyExpandToggle allExpanded={false} onToggle={onToggle} />);
  document.body.querySelector('.mode-btn')
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(onToggle).toHaveBeenCalledWith(true);
});

it('labels Collapse when expanded, Expand when collapsed', () => {
  const { rerender } = render(<ProphecyExpandToggle allExpanded={false} onToggle={() => {}} />);
  expect(document.body.querySelector('.mode-btn').textContent).toContain('Expand');
  rerender(<ProphecyExpandToggle allExpanded={true} onToggle={() => {}} />);
  expect(document.body.querySelector('.mode-btn').textContent).toContain('Collapse');
});

it('removes the portaled FAB from <body> on unmount (no leak)', () => {
  const { unmount } = render(<ProphecyExpandToggle allExpanded={false} onToggle={() => {}} />);
  expect(document.body.querySelector('.mode-toggle-wrap')).not.toBeNull();
  unmount();
  expect(document.body.querySelector('.mode-toggle-wrap')).toBeNull();
});
