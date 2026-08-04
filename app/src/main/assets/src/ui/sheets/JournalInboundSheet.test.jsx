/* JournalInboundSheet — SHEETS-UX 2026-07-12 a11y.
   ─────────────────────────────────────────────────────────────────
   The entry rows are role="button" divs; they are now keyboard-focusable
   (tabIndex 0) and activate on Enter/Space. Reads bare globals, so we stub. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { JournalInboundSheet } from './JournalInboundSheet.jsx';

function stubGlobals() {
  window.JournalIndexStore = { entriesReferencing: () => ['je1'] };
  window.JournalStore = { get: (id) => ({ id, title: 'Morning prayer', updated: 2, created: 1 }) };
  window.JournalHelpers = {
    entryDisplayTitle: (e) => e.title,
    longDate: () => 'July 12, 2026',
    previewText: () => 'Wrote about the passage',
  };
}
afterEach(() => {
  cleanup();
  ['JournalIndexStore', 'JournalStore', 'JournalHelpers'].forEach(k => delete window[k]);
});

describe('JournalInboundSheet keyboard a11y', () => {
  it('is a labelled modal and contains initial focus', () => {
    stubGlobals();
    render(<JournalInboundSheet refKey="bible:john:3:16" resourceLabel="John 3:16" onClose={() => {}} onOpenEntry={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: '1 journal entry · John 3:16' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('entry rows are focusable', () => {
    stubGlobals();
    const { container } = render(<JournalInboundSheet refKey="bible:john:3:16" resourceLabel="John 3:16" onClose={() => {}} onOpenEntry={() => {}} />);
    const item = container.querySelector('.jrn-inbound-item');
    expect(item).toBeTruthy();
    expect(item.getAttribute('tabindex')).toBe('0');
  });

  it('Enter activates an entry row', () => {
    stubGlobals();
    const onOpenEntry = vi.fn();
    const { container } = render(<JournalInboundSheet refKey="bible:john:3:16" resourceLabel="John 3:16" onClose={() => {}} onOpenEntry={onOpenEntry} />);
    fireEvent.keyDown(container.querySelector('.jrn-inbound-item'), { key: 'Enter' });
    expect(onOpenEntry).toHaveBeenCalled();
  });

  it('Space activates an entry row', () => {
    stubGlobals();
    const onOpenEntry = vi.fn();
    const { container } = render(<JournalInboundSheet refKey="bible:john:3:16" resourceLabel="John 3:16" onClose={() => {}} onOpenEntry={onOpenEntry} />);
    fireEvent.keyDown(container.querySelector('.jrn-inbound-item'), { key: ' ' });
    expect(onOpenEntry).toHaveBeenCalled();
  });
});
