/* LinkSidebar — SHEETS-UX 2026-07-12 chrome polish.
   ─────────────────────────────────────────────────────────────────
   Pins: (1) the close button carries an aria-label and sits AFTER the title
   in the DOM (right side, matching every other sheet); (2) the redundant
   "No links" count row is suppressed when the passage has no links (the
   empty body message already says so). Reads bare globals, so we stub. */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LinkSidebar } from './LinkSidebar.jsx';

function stubStore(links) {
  window.LinkStore = {
    subscribe: () => () => {},
    getVersion: () => 1,
    getForKey: () => links,
    getForKeyPrefix: () => links,
    getTouching: () => links,
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
    const dialog = screen.getByRole('dialog', { name: 'Links' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('empty passage: no redundant count row, just the empty message', () => {
    stubStore([]);
    const { container } = render(<LinkSidebar hlKey="bible:john:3:16" onClose={() => {}} onNavigate={() => {}} />);
    expect(container.querySelector('.link-sidebar-count')).toBeNull();
    expect(container.querySelector('.link-sidebar-empty')).toBeTruthy();
  });
});

describe('LinkSidebar on a Bible verse (mw17 s29.4)', () => {
  it('lists a partial-verse link its verse icon counted, instead of "No links yet"', async () => {
    const { LinkStore } = await import('../../stores/link-store.js');
    localStorage.clear();
    LinkStore._resetForTests({ forceLoaded: true });
    localStorage.setItem('vot-links', JSON.stringify([{
      id: 'p1', created: 1,
      source: { type: 'letter', key: 'letter:wide-path:2', label: 'The Wide Path' },
      target: { type: 'bible', key: 'bible:john:3:16:12-40', label: 'John 3:16', bookId: 'john', chapter: 3, verse: 16, text: 'the world' },
    }]));
    window.LinkStore = LinkStore;
    window.LinkCard = ({ lnk }) => <div className="stub-card">{lnk.id}</div>;
    render(<LinkSidebar hlKey="bible:john:3:16" onClose={() => {}} onNavigate={() => {}} />);
    expect(screen.queryByText('No links yet')).toBeNull();
    expect(document.querySelector('.link-sidebar-count').textContent).toBe('1 link');
    expect(document.querySelector('.stub-card').textContent).toBe('p1');
    delete window.LinkCard;
  });
});
