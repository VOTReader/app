/* BookmarkCreateSheet — "A Thought" field removal (2026-07-12, owner call).
   ─────────────────────────────────────────────────────────────────
   The optional free-text thought ("A few words for your future self…")
   is gone from bookmark creation AND editing. These pin: no textarea in
   either mode, an EDIT commit passes the legacy thought through UNTOUCHED
   (editing a label must never destroy old data), and a CREATE commit
   sends an empty thought. Also pins the label-only canSave gating.

   The row action sheet (BookmarksScreen) similarly must no longer offer
   Add/Edit Thought. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BookmarkCreateSheet } from './BookmarkCreateSheet.jsx';
import { BookmarkPopover } from './BookmarkPopover.jsx';
import { BookmarkRowActionSheet } from '../screens/BookmarksScreen.jsx';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';

/** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;

afterEach(() => {
  cleanup();
  modalRegistry._reset();
  delete window.BookmarkStore;
});

describe('BookmarkCreateSheet — thought field removed', () => {
  it('is exposed as a labelled modal dialog', () => {
    render(
      <BookmarkCreateSheet
        pending={{ hlKey: 'bible:psalms:23:1', defaultLabel: 'Psalms 23:1' }}
        onConfirm={() => {}} onCancel={() => {}}
      />
    );
    const dialog = screen.getByRole('dialog', { name: 'New Bookmark' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('CREATE mode renders no thought textarea and no "A Thought" label', () => {
    const { container } = render(
      <BookmarkCreateSheet
        pending={{ hlKey: 'bible:psalms:23:1', defaultLabel: 'Psalms 23:1', sourceLabel: 'Psalms 23' }}
        onConfirm={() => {}} onCancel={() => {}}
      />
    );
    expect(container.querySelector('.bkm-create-thought-input')).toBeNull();
    expect(screen.queryByText(/A Thought/)).toBeNull();
  });

  it('EDIT mode renders no thought textarea either', () => {
    const { container } = render(
      <BookmarkCreateSheet
        pending={{ editId: 'b1', hlKey: 'bible:psalms:23:1', currentLabel: 'My verse', currentThought: 'legacy words' }}
        onConfirm={() => {}} onCancel={() => {}}
      />
    );
    expect(container.querySelector('.bkm-create-thought-input')).toBeNull();
  });

  it('EDIT commit passes the LEGACY thought through untouched (label edits never destroy old data)', () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <BookmarkCreateSheet
        pending={{ editId: 'b1', hlKey: 'bible:psalms:23:1', currentLabel: 'My verse', currentThought: 'legacy words' }}
        onConfirm={onConfirm} onCancel={() => {}}
      />
    );
    const input = container.querySelector('.bkm-create-label-input');
    fireEvent.change(input, { target: { value: 'Renamed verse' } });
    fireEvent.click(container.querySelector('.navpick-confirm-green'));
    expect(onConfirm).toHaveBeenCalledWith({
      editId: 'b1',
      hlKey: 'bible:psalms:23:1',
      label: 'Renamed verse',
      thought: 'legacy words',
    });
  });

  it('CREATE commit sends an empty thought', () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <BookmarkCreateSheet
        pending={{ hlKey: 'bible:psalms:23:1', defaultLabel: 'Psalms 23:1' }}
        onConfirm={onConfirm} onCancel={() => {}}
      />
    );
    fireEvent.click(container.querySelector('.navpick-confirm-green'));
    expect(onConfirm).toHaveBeenCalledWith({
      editId: null,
      hlKey: 'bible:psalms:23:1',
      label: 'Psalms 23:1',
      thought: '',
    });
  });

  /* W48: the words a bookmark was made on ride to the store, so its icon can
     follow them after an edit; an edit never touches the record's own words. */
  it('CREATE commit passes the recorded words through; EDIT sends none', () => {
    const onConfirm = vi.fn();
    const { container, unmount } = render(
      <BookmarkCreateSheet
        pending={{ hlKey: 'bible:psalms:23:1:4-15', defaultLabel: 'Lord is my', text: 'Lord is my' }}
        onConfirm={onConfirm} onCancel={() => {}}
      />
    );
    fireEvent.click(container.querySelector('.navpick-confirm-green'));
    expect(onConfirm).toHaveBeenLastCalledWith(expect.objectContaining({ editId: null, text: 'Lord is my' }));
    unmount();

    const onEdit = vi.fn();
    const edit = render(
      <BookmarkCreateSheet
        pending={{ editId: 'b1', hlKey: 'bible:psalms:23:1:4-15', currentLabel: 'Mine', text: 'Lord is my' }}
        onConfirm={onEdit} onCancel={() => {}}
      />
    );
    fireEvent.change(edit.container.querySelector('.bkm-create-label-input'), { target: { value: 'Renamed' } });
    fireEvent.click(edit.container.querySelector('.navpick-confirm-green'));
    expect(onEdit.mock.calls[0][0]).not.toHaveProperty('text');
  });

  it('EDIT-mode Save stays disabled until the label actually changes', () => {
    const { container } = render(
      <BookmarkCreateSheet
        pending={{ editId: 'b1', hlKey: 'k', currentLabel: 'Same', currentThought: '' }}
        onConfirm={() => {}} onCancel={() => {}}
      />
    );
    const save = /** @type {HTMLButtonElement} */ (container.querySelector('.navpick-confirm-green'));
    expect(save.disabled).toBe(true);
    fireEvent.change(container.querySelector('.bkm-create-label-input'), { target: { value: 'Different' } });
    expect(save.disabled).toBe(false);
  });

  // Sweep low (mw9): clearing the label enabled Save, and the commit fell back to the same label (a no-op
  // write that only bumped 'updated').
  it('EDIT-mode Save stays disabled while the label is empty or blank', () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <BookmarkCreateSheet
        pending={{ editId: 'b1', hlKey: 'k', currentLabel: 'Same', defaultLabel: 'Same', currentThought: '' }}
        onConfirm={onConfirm} onCancel={() => {}}
      />
    );
    const save = /** @type {HTMLButtonElement} */ (container.querySelector('.navpick-confirm-green'));
    const input = container.querySelector('.bkm-create-label-input');
    fireEvent.change(input, { target: { value: '' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(input, { target: { value: '   ' } });
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('BookmarkRowActionSheet — thought actions removed', () => {
  it('offers Open / Edit Label / Delete only — no Add/Edit Thought', () => {
    window.BookmarkStore = { remove: vi.fn(), update: vi.fn() };
    render(
      <BookmarkRowActionSheet
        bkm={{ id: 'b1', hlKey: 'k', label: 'A bookmark', thought: 'legacy' }}
        onClose={() => {}} onNavigate={() => {}} onEditLabel={() => {}} onDelete={() => {}}
      />
    );
    expect(screen.getByText('Open Bookmark')).toBeTruthy();
    expect(screen.getByText('Edit Label')).toBeTruthy();
    expect(screen.getByText('Delete Bookmark')).toBeTruthy();
    expect(screen.queryByText(/Thought/)).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Bookmark actions' }).getAttribute('aria-modal')).toBe('true');
  });
});

describe('BookmarkPopover accessibility', () => {
  it('uses modal popover semantics and contains focus', () => {
    window.BookmarkStore = {
      get: () => ({ id: 'b1', label: 'A bookmark', created: 1 }),
      remove: vi.fn(),
    };
    render(<BookmarkPopover bkmIds={['b1']} x={100} y={100} onClose={() => {}} onNavigate={() => {}} onDeleteDone={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Bookmark actions' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
