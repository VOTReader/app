/* NoteSheet — empty-note primary action + honest-Save close semantics.
   ─────────────────────────────────────────────────────────────────
   Part 1 (empty-note action): a note with no body used to show a passive
   hint that made the most common action a two-step discovery. Read mode
   now renders a real "Add note text" button that jumps straight into edit
   mode.

   Part 2 (honest Save, 2026-07-12, owner-reported): every dismissal of an
   edit-mode sheet must behave like Cancel — a fresh never-saved note is
   DISCARDED (not stranded in the store, which made the Save button look
   cosmetic), typed-but-unsaved text is gated behind a discard ConfirmStrip,
   and discarding a note that was attached to a PRE-EXISTING mark removes
   only the note record, never the user's original highlight. The Escape /
   Android-back dispatcher path is pinned via the REAL modalRegistry (the
   sheet registers its own entry now).

   NoteSheet reads bare globals, so we stub them; ConfirmStrip is the REAL
   component (vitest.setup.js supplies useModalRegistry/modalRegistry). */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { NoteSheet } from './NoteSheet.jsx';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';

/** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;

function setupStores({ body = '' } = {}) {
  window.HL_COLORS = ['yellow', 'green', 'blue'];
  window.NoteStore = {
    subscribe: () => () => {},
    getVersion: () => 1,
    get: () => ({ groupId: 'g1', color: 'yellow', body, fullText: 'anchor', keys: ['k'], notebookIds: [], created: 1, updated: 2 }),
    update: vi.fn(),
    remove: vi.fn(),
  };
  window.AnnotationStore = {
    subscribe: () => () => {},
    getVersion: () => 1,
    getByGroup: () => [{ key: 'k', ann: { id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'anchor' } }],
    removeGroup: vi.fn(),
    recolorGroup: vi.fn(),
    convertGroup: vi.fn(),
  };
  window.NotebookStore = { get: () => null };
  window.NoteDefaultStore = { set: vi.fn(), get: () => ({ style: 'highlight', color: 'blank' }) };
  window.relativeDate = () => '1w ago';
}

beforeEach(() => {
  modalRegistry._reset();
});

afterEach(() => {
  cleanup();
  modalRegistry._reset();
  delete window.HL_COLORS;
  delete window.NoteStore;
  delete window.AnnotationStore;
  delete window.NotebookStore;
  delete window.NoteDefaultStore;
  delete window.relativeDate;
});

describe('NoteSheet empty-note action', () => {
  it('is exposed as a labelled modal dialog', () => {
    setupStores({ body: 'Saved note' });
    render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Note' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('read mode on an EMPTY note renders the "Add note text" button', () => {
    setupStores({ body: '' });
    render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
    expect(screen.getByText('Add note text')).toBeTruthy();
  });

  it('tapping the button enters edit mode (textarea appears, button gone)', () => {
    setupStores({ body: '' });
    const { container } = render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Add note text'));
    expect(container.querySelector('.note-sheet-textarea')).toBeTruthy();
    expect(container.querySelector('.note-sheet-empty-btn')).toBeNull();
  });

  it('read mode on a note WITH a body renders the body, not the button', () => {
    setupStores({ body: 'my reflection' });
    const { container } = render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
    expect(screen.getByText('my reflection')).toBeTruthy();
    expect(container.querySelector('.note-sheet-empty-btn')).toBeNull();
  });
});

describe('NoteSheet honest-Save close semantics (2026-07-12)', () => {
  it('backdrop close on a FRESH untyped note (freshGroup) discards the whole group — nothing lingers', () => {
    setupStores({ body: '' });
    const onClose = vi.fn();
    const { container } = render(
      <NoteSheet groupId="g1" startInEditMode={true} freshGroup={true} onClose={onClose} />
    );
    fireEvent.click(container.querySelector('.note-sheet-overlay'));
    expect(window.AnnotationStore.removeGroup).toHaveBeenCalledWith('g1');
    expect(window.NoteStore.remove).toHaveBeenCalledWith('g1');
    expect(window.NoteStore.update).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('discarding a fresh note ATTACHED to a pre-existing mark removes only the note record — the mark survives', () => {
    setupStores({ body: '' });
    const onClose = vi.fn();
    const { container } = render(
      <NoteSheet groupId="g1" startInEditMode={true} freshGroup={false} onClose={onClose} />
    );
    fireEvent.click(container.querySelector('.note-sheet-overlay'));
    expect(window.AnnotationStore.removeGroup).not.toHaveBeenCalled();
    expect(window.NoteStore.remove).toHaveBeenCalledWith('g1');
    expect(onClose).toHaveBeenCalled();
  });

  it('typed-but-unsaved text gates the dismissal behind a discard ConfirmStrip; confirming discards', () => {
    setupStores({ body: '' });
    const onClose = vi.fn();
    const { container } = render(
      <NoteSheet groupId="g1" startInEditMode={true} freshGroup={true} onClose={onClose} />
    );
    fireEvent.change(container.querySelector('.note-sheet-textarea'), { target: { value: 'half a thought' } });
    fireEvent.click(container.querySelector('.note-sheet-overlay'));
    // Nothing destroyed or closed yet — the confirm gate is up instead.
    expect(onClose).not.toHaveBeenCalled();
    expect(window.NoteStore.remove).not.toHaveBeenCalled();
    const confirm = container.querySelector('.note-sheet-discard-confirm');
    expect(confirm).toBeTruthy();
    expect(confirm.textContent).toContain('Discard this note?');
    fireEvent.click(screen.getByText('Yes, discard'));
    expect(window.AnnotationStore.removeGroup).toHaveBeenCalledWith('g1');
    expect(window.NoteStore.remove).toHaveBeenCalledWith('g1');
    expect(onClose).toHaveBeenCalled();
  });

  it('the confirm gate can be cancelled — editing resumes with the text intact', () => {
    setupStores({ body: '' });
    const onClose = vi.fn();
    const { container } = render(
      <NoteSheet groupId="g1" startInEditMode={true} freshGroup={true} onClose={onClose} />
    );
    fireEvent.change(container.querySelector('.note-sheet-textarea'), { target: { value: 'keep me' } });
    fireEvent.click(container.querySelector('.note-sheet-overlay'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(container.querySelector('.note-sheet-discard-confirm')).toBeNull();
    expect(/** @type {HTMLTextAreaElement} */ (container.querySelector('.note-sheet-textarea')).value).toBe('keep me');
    expect(window.NoteStore.remove).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Save commits the typed body — the ONLY path that persists it', () => {
    setupStores({ body: '' });
    const onClose = vi.fn();
    const { container } = render(
      <NoteSheet groupId="g1" startInEditMode={true} freshGroup={true} onClose={onClose} />
    );
    fireEvent.change(container.querySelector('.note-sheet-textarea'), { target: { value: 'a finished thought' } });
    fireEvent.click(screen.getByText('Save'));
    expect(window.NoteStore.update).toHaveBeenCalledWith('g1', { body: 'a finished thought' });
    expect(window.AnnotationStore.removeGroup).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('the Escape/Android-back dispatcher routes through the SAME cancel semantics (registry-owned dismissal)', () => {
    setupStores({ body: '' });
    const onClose = vi.fn();
    render(<NoteSheet groupId="g1" startInEditMode={true} freshGroup={true} onClose={onClose} />);
    // The sheet registers its own modal entry now; the dispatcher's dismiss
    // must discard the fresh group exactly like the backdrop does — a bare
    // "null the target" here was the stranded-note bug.
    expect(modalRegistry.openIds()).toContain('note-sheet');
    act(() => { modalRegistry.peek().dismiss(); });
    expect(window.AnnotationStore.removeGroup).toHaveBeenCalledWith('g1');
    expect(window.NoteStore.remove).toHaveBeenCalledWith('g1');
    expect(onClose).toHaveBeenCalled();
  });

  it('Cancel on an EXISTING note with edits gates, then reverts to read mode without writing', () => {
    setupStores({ body: 'original words' });
    const onClose = vi.fn();
    const { container } = render(
      <NoteSheet groupId="g1" startInEditMode={false} onClose={onClose} />
    );
    // Enter edit via ⋯ → Edit note
    fireEvent.click(container.querySelector('.note-sheet-menu-btn'));
    fireEvent.click(screen.getByText('Edit note'));
    fireEvent.change(container.querySelector('.note-sheet-textarea'), { target: { value: 'changed words' } });
    fireEvent.click(screen.getByText('Cancel'));
    const confirm = container.querySelector('.note-sheet-discard-confirm');
    expect(confirm).toBeTruthy();
    expect(confirm.textContent).toContain('Discard changes?');
    fireEvent.click(screen.getByText('Yes, discard'));
    // Back in read mode, nothing persisted, nothing removed, sheet still open.
    expect(container.querySelector('.note-sheet-textarea')).toBeNull();
    expect(screen.getByText('original words')).toBeTruthy();
    expect(window.NoteStore.update).not.toHaveBeenCalled();
    expect(window.NoteStore.remove).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
