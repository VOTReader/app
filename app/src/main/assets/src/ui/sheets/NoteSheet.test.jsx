/* NoteSheet — empty-note primary action.
   ─────────────────────────────────────────────────────────────────
   A note with no body used to show a passive hint ("Tap ⋯ → Edit to add
   text") that made the most common action a two-step discovery. Read mode
   now renders a real "Add note text" button that jumps straight into edit
   mode. These lock down: the button renders only for an empty body, tapping
   it opens the editor (textarea), and a note WITH a body renders the body
   instead. NoteSheet reads bare globals, so we stub them. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NoteSheet } from './NoteSheet.jsx';

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

afterEach(() => {
  cleanup();
  delete window.HL_COLORS;
  delete window.NoteStore;
  delete window.AnnotationStore;
  delete window.NotebookStore;
  delete window.NoteDefaultStore;
  delete window.relativeDate;
});

describe('NoteSheet empty-note action', () => {
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
