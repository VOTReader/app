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

  it('the colour dot is drawn inside a button a finger can hit (#10)', () => {
    setupStores({ body: 'Saved note' });
    render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
    const btn = screen.getByRole('button', { name: 'Change note color' });
    expect(btn.className).toBe('note-sheet-color-hit');
    expect(btn.querySelector('.note-sheet-color-dot').getAttribute('data-color')).toBe('yellow');
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

  // s29.2 (n90): saving an edit of an existing note goes back to reading it, not out of the sheet.
  it('Save on an EXISTING note returns to read mode instead of closing', () => {
    setupStores({ body: 'original words' });
    const onClose = vi.fn();
    const { container } = render(<NoteSheet groupId="g1" startInEditMode={false} onClose={onClose} />);
    fireEvent.click(container.querySelector('.note-sheet-menu-btn'));
    fireEvent.click(screen.getByText('Edit note'));
    fireEvent.change(container.querySelector('.note-sheet-textarea'), { target: { value: 'changed words' } });
    fireEvent.click(screen.getByText('Save'));
    expect(window.NoteStore.update).toHaveBeenCalledWith('g1', { body: 'changed words' });
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('.note-sheet-textarea')).toBeNull();
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

/* A15 — the note's Share reports its outcome instead of swallowing it. */
describe('NoteSheet Share outcome (A15)', () => {
  /** @type {PropertyDescriptor | undefined} */ let origClipboard;
  /** @type {PropertyDescriptor | undefined} */ let origShare;
  beforeEach(() => {
    origClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    origShare = Object.getOwnPropertyDescriptor(navigator, 'share');
    /** @type {any} */ (globalThis).showToast = vi.fn();
  });
  afterEach(() => {
    delete /** @type {any} */ (globalThis).showToast;
    if (origClipboard) Object.defineProperty(navigator, 'clipboard', origClipboard);
    else delete /** @type {any} */ (navigator).clipboard;
    if (origShare) Object.defineProperty(navigator, 'share', origShare);
    else delete /** @type {any} */ (navigator).share;
  });
  /** @param {string} prop @param {any} value */
  function setNav(prop, value) {
    Object.defineProperty(navigator, prop, { value, writable: true, configurable: true });
  }
  async function shareFromMenu() {
    setupStores({ body: 'Saved note' });
    const { container } = render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
    fireEvent.click(/** @type {Element} */ (container.querySelector('.note-sheet-menu-btn')));
    fireEvent.click(screen.getByText('Share'));
    await act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
  }

  it('a refused share AND a refused copy tell the reader, instead of doing nothing', async () => {
    setNav('share', undefined);
    setNav('clipboard', { writeText: () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })) });
    await shareFromMenu();
    const calls = /** @type {any} */ (globalThis).showToast.mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0].text).toMatch(/Couldn.t share or copy/);
  });

  it('no share sheet: copies instead and says to paste it', async () => {
    setNav('share', undefined);
    setNav('clipboard', { writeText: () => Promise.resolve() });
    await shareFromMenu();
    const calls = /** @type {any} */ (globalThis).showToast.mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0].text).toMatch(/Copied instead/);
  });

  /* n6-08 (sweep 2): the note shared its words with no reference or link;
     the selection Share got both in A8. The link names the passage, never the note. */
  it('(n6-08) a shared note carries its passage reference and a link to it; journal writing does not travel as a link', async () => {
    const sent = /** @type {any[]} */ ([]);
    setNav('share', (d) => { sent.push(d); return Promise.resolve(); });
    for (const key of ['bible:john:3:16', 'journal:abc:0']) {
      setupStores({ body: 'Saved note' });
      window.AnnotationStore.getByGroup = () => [{ key, ann: { id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'anchor' } }];
      const { container, unmount } = render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
      fireEvent.click(/** @type {Element} */ (container.querySelector('.note-sheet-menu-btn')));
      fireEvent.click(screen.getByText('Share'));
      await act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
      unmount();
    }
    expect(sent.length).toBe(2);
    // U07.2: quoted and cited, the note marked as the reader's own, so it can't read as Scripture.
    expect(sent[0].text.startsWith('\u201Canchor\u201D \u2014 ')).toBe(true);
    expect(sent[0].text.split('\n')[0]).toContain('3:16');
    expect(sent[0].text).toContain('\n\nMy note: Saved note\n\n');
    expect(sent[0].text).toContain('?p=bible%3Ajohn%3A3%3A16');
    expect(sent[1].text).toBe('anchor\n\nSaved note');
  });

  /* share-fn (Corbin 2026-10-25, "share the website link the default one"): a note on a letter
     sends the letter's page on the website, as the selection's Share does; Share Includes App
     Link sends the app's. */
  it('a note on a letter shares the website link by default, the app link under App Link', async () => {
    const g = /** @type {any} */ (globalThis);
    const sent = /** @type {any[]} */ ([]);
    setNav('share', (d) => { sent.push(d); return Promise.resolve(); });
    g.findEntryContext = () => ({ kind: 'letter', screen: 'vot-letter', collection: 'Volume Two', title: 'The Wide Path' });
    try {
      for (const settings of [{}, { shareLink: 'app' }]) {
        g.StateStore = { get: () => ({ settings }) };
        setupStores({ body: 'Saved note' });
        window.AnnotationStore.getByGroup = () => [{ key: 'letter:the-wide-path:1', ann: { id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'anchor' } }];
        const { container, unmount } = render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
        fireEvent.click(/** @type {Element} */ (container.querySelector('.note-sheet-menu-btn')));
        fireEvent.click(screen.getByText('Share'));
        await act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
        unmount();
      }
    } finally { delete g.findEntryContext; delete g.StateStore; }
    expect(sent.length).toBe(2);
    expect(sent[0].text.endsWith('\n\nhttps://www.thevolumesoftruth.com/The_Wide_Path')).toBe(true);
    expect(sent[1].text.endsWith('\n\nhttps://votreader.github.io/app/?p=letter%3Athe-wide-path%3A1')).toBe(true);
  });

  it('a share the reader cancels stays quiet', async () => {
    setNav('share', () => Promise.reject(Object.assign(new Error('Share canceled'), { name: 'AbortError' })));
    await shareFromMenu();
    expect(/** @type {any} */ (globalThis).showToast).not.toHaveBeenCalled();
  });
});

/* ds2 (2026-10-13): the text being typed lives only in this sheet's state, so an app update
   waits while it is in edit mode (sw-register.js reloads once the hold lets go). */
describe('NoteSheet holds the app-update reload while a note is being typed (ds2)', () => {
  it('edit mode holds it; read mode does not; closing lets go', async () => {
    const { updateHolds } = await import('../../utils/update-hold.js');
    setupStores({ body: 'Saved note' });
    const read = render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
    expect(updateHolds()).toEqual([]);
    read.unmount();
    const edit = render(<NoteSheet groupId="g1" startInEditMode={true} onClose={() => {}} />);
    expect(updateHolds()).toEqual(['note']);
    edit.unmount();
    expect(updateHolds()).toEqual([]);
  });
});

// Sweep low (mw10): the edit-mode style buttons were all named "A", with no pressed state.
describe('NoteSheet edit-mode style and colour buttons', () => {
  it('are named and say which style and colour are current', () => {
    setupStores();
    render(<NoteSheet groupId="g1" startInEditMode={true} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Highlight' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Underline' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Squiggle underline' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'yellow' }).getAttribute('aria-pressed')).toBe('true');
  });
});

/* ds5 A06.1 (idea sweep 2026-10-22): Delete note removes the note's mark too, and the confirm said
   only 'Delete this note?'. It now names the mark, as the toolbar's remove confirm does. */
describe('NoteSheet delete confirm names the mark that goes with the note (ds5 A06.1)', () => {
  const openDelete = (container) => {
    fireEvent.click(container.querySelector('.note-sheet-menu-btn'));
    fireEvent.click(screen.getByText('Delete note'));
  };

  it('a coloured highlight: "Delete this note and its highlight?"', () => {
    setupStores({ body: 'my reflection' });
    const { container } = render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
    openDelete(container);
    expect(container.querySelector('.note-sheet-menu').textContent).toContain('Delete this note and its highlight?');
  });

  it('an underline names the underline', () => {
    setupStores({ body: 'my reflection' });
    window.AnnotationStore.getByGroup = () => [{ key: 'k', ann: { id: 'g1', groupId: 'g1', kind: 'underline', color: 'blue', text: 'anchor' } }];
    const { container } = render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
    openDelete(container);
    expect(container.querySelector('.note-sheet-menu').textContent).toContain('Delete this note and its underline?');
  });

  it('an icon-only note (blank highlight) asks only about the note', () => {
    setupStores({ body: 'my reflection' });
    const get = window.NoteStore.get;
    window.NoteStore.get = () => ({ ...get(), color: 'blank' });
    const { container } = render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
    openDelete(container);
    const text = container.querySelector('.note-sheet-menu').textContent;
    expect(text).toContain('Delete this note?');
    expect(text).not.toContain('highlight');
  });

  // RC.11 (UX sweep 2026-10-22, sel/21 -> sel/26): the green note's highlight covered an older yellow, and the
  // yellow came back after the delete with no word. The confirm now says so.
  it('says when the yellow under the note highlight shows again', () => {
    setupStores({ body: 'my reflection' });
    const green = { id: 'g1', groupId: 'g1', kind: 'highlight', color: 'green', text: 'anchor', start: 0, end: 20, created: 2 };
    window.AnnotationStore.getByGroup = () => [{ key: 'k', ann: green }];
    window.AnnotationStore.get = () => [{ id: 'y1', groupId: 'y1', kind: 'highlight', color: 'yellow', start: 5, end: 9, created: 1 }, green];
    const { container } = render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
    openDelete(container);
    expect(container.querySelector('.note-sheet-menu').textContent)
      .toContain('Delete this note and its highlight? The yellow under it shows again.');
  });
});
