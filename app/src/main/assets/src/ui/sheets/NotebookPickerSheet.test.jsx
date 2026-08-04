/* NotebookPickerSheet — transactional Save semantics (2026-07-12).
   ─────────────────────────────────────────────────────────────────
   Owner-reported: membership toggles used to write straight to NoteStore,
   so the (then-nonexistent) Save was implicit and closing the sheet kept
   half-made changes. The sheet is now transactional: toggles buffer
   locally, the footer Save commits the diff, and ×/backdrop/Escape/back
   discard — gated by a ConfirmStrip when there are unsaved changes.

   Uses the REAL ConfirmStrip + modalRegistry (vitest.setup.js supplies
   useModalRegistry); stores are stubbed as the bare globals the sheet
   reads. */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { NotebookPickerSheet } from './NotebookPickerSheet.jsx';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';

/** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;

/**
 * @param {{ memberIds?: string[], notebooks?: { id: string, name: string }[] }} [opts]
 */
function setupStores({ memberIds = [], notebooks } = {}) {
  const nbList = notebooks || [
    { id: 'nb1', name: 'Psalms Study' },
    { id: 'nb2', name: 'Prayers' },
  ];
  window.NoteStore = {
    subscribe: () => () => {},
    getVersion: () => 1,
    get: () => ({ groupId: 'g1', color: 'yellow', body: '', fullText: 'anchor', keys: ['k'], notebookIds: memberIds.slice() }),
    toggleNotebook: vi.fn(),
  };
  window.NotebookStore = {
    subscribe: () => () => {},
    getVersion: () => 1,
    list: () => nbList.slice(),
    add: vi.fn((name) => {
      const nb = { id: 'nb-new', name };
      nbList.push(nb);
      return nb;
    }),
    remove: vi.fn(),
    get: (id) => nbList.find(nb => nb.id === id) || null,
  };
}

beforeEach(() => {
  modalRegistry._reset();
});

afterEach(() => {
  cleanup();
  modalRegistry._reset();
  delete window.NoteStore;
  delete window.NotebookStore;
});

describe('NotebookPickerSheet — buffered toggles', () => {
  it('is a labelled modal and notebook rows work from the keyboard', () => {
    setupStores();
    render(<NotebookPickerSheet groupId="g1" onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Add to Notebook' });
    const row = screen.getByRole('button', { name: /Psalms Study/ });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(row, { key: ' ' });
    expect(row.className).toContain('checked');
  });

  it('tapping a notebook row does NOT write to the store (buffered until Save)', () => {
    setupStores();
    const { container } = render(<NotebookPickerSheet groupId="g1" onClose={() => {}} />);
    fireEvent.click(screen.getByText('Psalms Study'));
    // Visually selected…
    expect(container.querySelector('.nb-picker-row.checked')).toBeTruthy();
    // …but nothing persisted yet — Save is the only commit path.
    expect(window.NoteStore.toggleNotebook).not.toHaveBeenCalled();
  });

  it('Save commits exactly the buffered diff and closes', () => {
    setupStores({ memberIds: ['nb2'] });
    const onClose = vi.fn();
    render(<NotebookPickerSheet groupId="g1" onClose={onClose} />);
    fireEvent.click(screen.getByText('Psalms Study'));  // add nb1
    fireEvent.click(screen.getByText('Prayers'));       // remove nb2
    fireEvent.click(screen.getByText('Save'));
    const calls = window.NoteStore.toggleNotebook.mock.calls.map(c => c[1]).sort();
    expect(calls).toEqual(['nb1', 'nb2']);
    expect(onClose).toHaveBeenCalled();
  });

  it('Save is disabled when nothing changed', () => {
    setupStores({ memberIds: ['nb1'] });
    render(<NotebookPickerSheet groupId="g1" onClose={() => {}} />);
    expect(/** @type {HTMLButtonElement} */ (screen.getByText('Save')).disabled).toBe(true);
  });

  it('the × with unsaved changes gates behind a discard ConfirmStrip; confirming closes WITHOUT committing', () => {
    setupStores();
    const onClose = vi.fn();
    const { container } = render(<NotebookPickerSheet groupId="g1" onClose={onClose} />);
    fireEvent.click(screen.getByText('Psalms Study'));
    fireEvent.click(container.querySelector('.nb-picker-close'));
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('.nb-picker-discard-confirm')).toBeTruthy();
    fireEvent.click(screen.getByText('Yes, discard'));
    expect(onClose).toHaveBeenCalled();
    expect(window.NoteStore.toggleNotebook).not.toHaveBeenCalled();
  });

  it('the × with NO changes closes immediately (no needless confirm)', () => {
    setupStores({ memberIds: ['nb1'] });
    const onClose = vi.fn();
    const { container } = render(<NotebookPickerSheet groupId="g1" onClose={onClose} />);
    fireEvent.click(container.querySelector('.nb-picker-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('creating a notebook is immediate (real container) but the auto-selection is still buffered', () => {
    setupStores();
    const { container } = render(<NotebookPickerSheet groupId="g1" onClose={() => {}} />);
    fireEvent.change(container.querySelector('.nb-picker-new-input'), { target: { value: 'Fresh Notebook' } });
    fireEvent.click(screen.getByText('Create'));
    expect(window.NotebookStore.add).toHaveBeenCalledWith('Fresh Notebook');
    // The new notebook shows checked in the buffer…
    expect(screen.getByText('Fresh Notebook')).toBeTruthy();
    expect(container.querySelector('.nb-picker-row.checked')).toBeTruthy();
    // …but membership is not persisted until Save.
    expect(window.NoteStore.toggleNotebook).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Save'));
    expect(window.NoteStore.toggleNotebook).toHaveBeenCalledWith('g1', 'nb-new');
  });

  it('the Escape/Android-back dispatcher routes through the same discard gate (registry-owned dismissal)', () => {
    setupStores();
    const onClose = vi.fn();
    const { container } = render(<NotebookPickerSheet groupId="g1" onClose={onClose} />);
    fireEvent.click(screen.getByText('Psalms Study'));
    expect(modalRegistry.openIds()).toContain('notebook-picker-sheet');
    act(() => { modalRegistry.peek().dismiss(); });
    // Dirty → the gate comes up instead of a silent close.
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('.nb-picker-discard-confirm')).toBeTruthy();
  });
});
