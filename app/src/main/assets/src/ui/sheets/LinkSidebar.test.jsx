/* LinkSidebar — SHEETS-UX 2026-07-12 chrome polish.
   ─────────────────────────────────────────────────────────────────
   Pins: (1) the close button carries an aria-label and sits AFTER the title
   in the DOM (right side, matching every other sheet); (2) the redundant
   "No links" count row is suppressed when the passage has no links (the
   empty body message already says so). Reads bare globals, so we stub. */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { LinkSidebar } from './LinkSidebar.jsx';

function stubStore(links) {
  window.LinkStore = {
    subscribe: () => () => {},
    getVersion: () => 1,
    getForKey: () => links,
    getForKeyPrefix: () => links,
  };
}
afterEach(() => { cleanup(); delete window.LinkStore; });

describe('LinkSidebar chrome', () => {
  it('close button is aria-labelled and comes after the title', () => {
    stubStore([]);
    const { container } = render(<LinkSidebar hlKey="bible:john:3:16" onClose={() => {}} onNavigate={() => {}} />);
    const header = container.querySelector('.link-sidebar-header');
    const kids = Array.from(header.children);
    const titleIdx = kids.findIndex(c => c.classList.contains('link-sidebar-title'));
    const closeIdx = kids.findIndex(c => c.classList.contains('link-sidebar-close'));
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(closeIdx).toBeGreaterThan(titleIdx); // close is on the right
    expect(container.querySelector('.link-sidebar-close').getAttribute('aria-label')).toBe('Close links');
  });

  it('empty passage: no redundant count row, just the empty message', () => {
    stubStore([]);
    const { container } = render(<LinkSidebar hlKey="bible:john:3:16" onClose={() => {}} onNavigate={() => {}} />);
    expect(container.querySelector('.link-sidebar-count')).toBeNull();
    expect(container.querySelector('.link-sidebar-empty')).toBeTruthy();
  });
});
