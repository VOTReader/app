/* MultiNotePopover — SHEETS-UX 2026-07-12 viewport clamp.
   ─────────────────────────────────────────────────────────────────
   Pins: (1) every note renders + is pickable; (2) the placement no longer
   runs off the bottom of the viewport — a tap near the bottom with a tall
   popover FLIPS ABOVE the point (previously the lower rows were pushed off
   screen with no way to reach them). Reads bare globals, so we stub them,
   and stub Element.scrollHeight (jsdom has no layout) to drive the clamp. */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MultiNotePopover } from './MultiNotePopover.jsx';

const notesById = {};
function seed(n) {
  for (let i = 1; i <= n; i++) notesById['g' + i] = { groupId: 'g' + i, color: 'yellow', body: 'Reflection ' + i, fullText: 'anchor ' + i, notebookIds: [], created: 1, updated: 2 };
}

beforeEach(() => {
  window.NoteStore = { get: (gid) => notesById[gid] || null };
  window.NotebookStore = { get: () => null };
  window.relativeDate = () => '1w ago';
});
afterEach(() => {
  cleanup();
  for (const k of Object.keys(notesById)) delete notesById[k];
  delete window.NoteStore; delete window.NotebookStore; delete window.relativeDate;
});

describe('MultiNotePopover rendering', () => {
  it('renders every note row + the count header', () => {
    seed(5);
    const payload = { groupIds: ['g1', 'g2', 'g3', 'g4', 'g5'], x: 180, y: 300 };
    render(<MultiNotePopover payload={payload} onClose={() => {}} onPick={() => {}} />);
    expect(screen.getByText('5 notes here')).toBeTruthy();
    expect(screen.getByText('Reflection 1')).toBeTruthy();
    expect(screen.getByText('Reflection 5')).toBeTruthy();
  });

  it('onPick fires with the tapped note groupId', () => {
    seed(2);
    const onPick = vi.fn();
    render(<MultiNotePopover payload={{ groupIds: ['g1', 'g2'], x: 100, y: 200 }} onClose={() => {}} onPick={onPick} />);
    fireEvent.click(screen.getByText('Reflection 2'));
    expect(onPick).toHaveBeenCalledWith('g2');
  });
});

describe('MultiNotePopover viewport clamp', () => {
  let scrollDesc;
  beforeEach(() => {
    scrollDesc = Object.getOwnPropertyDescriptor(window.Element.prototype, 'scrollHeight');
    Object.defineProperty(window.Element.prototype, 'scrollHeight', { configurable: true, get() { return 400; } });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 812 });
  });
  afterEach(() => {
    if (scrollDesc) Object.defineProperty(window.Element.prototype, 'scrollHeight', scrollDesc);
  });

  it('a tall popover opened near the bottom flips ABOVE the tap point', () => {
    seed(6);
    const { container } = render(
      <MultiNotePopover payload={{ groupIds: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'], x: 180, y: 760 }} onClose={() => {}} onPick={() => {}} />
    );
    const pop = /** @type {HTMLElement} */ (container.querySelector('.multinote-popover'));
    const top = parseInt(pop.style.top, 10);
    // Flipped above the 760 tap point (old code parked it at y+12 = 772, off-screen).
    expect(top).toBeLessThan(760);
    // And it fits within the viewport (top + capped height <= 812).
    const maxH = parseInt(pop.style.maxHeight, 10);
    expect(top + maxH).toBeLessThanOrEqual(812);
    expect(pop.style.overflowY).toBe('auto');
  });
});
