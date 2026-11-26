/* NoteSheet names the unfiled bucket with the shared constant (r3 review: NoteSheet.jsx wrote the words out by
   hand, so a rename in data/notebook-label.js would have missed the note sheet). The constant is swapped for a marker
   here: a sheet that writes its own words shows them instead of the marker. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
import { NoteSheet } from './NoteSheet.jsx';

// vi.mock is hoisted above the imports, so NoteSheet loads with the marker.
vi.mock('../../data/notebook-label.js', () => ({ NOT_IN_A_NOTEBOOK: 'MARKER: the shared name' }));

/** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;

afterEach(() => {
  cleanup();
  for (const k of ['HL_COLORS', 'NoteStore', 'AnnotationStore', 'NotebookStore', 'NoteDefaultStore', 'relativeDate']) delete (/** @type {any} */ (window))[k];
});

describe('NoteSheet: a note in no notebook', () => {
  it('says where it is with the shared name', () => {
    const w = /** @type {any} */ (window);
    w.HL_COLORS = ['yellow'];
    w.NoteStore = { subscribe: () => () => {}, getVersion: () => 1, get: () => ({ groupId: 'g1', color: 'yellow', body: 'Saved', fullText: 'anchor', keys: ['k'], notebookIds: [], created: 1, updated: 2 }), update: vi.fn(), remove: vi.fn() };
    w.AnnotationStore = { subscribe: () => () => {}, getVersion: () => 1, getByGroup: () => [{ key: 'k', ann: { id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'anchor' } }], removeGroup: vi.fn(), recolorGroup: vi.fn(), convertGroup: vi.fn() };
    w.NotebookStore = { get: () => null };
    w.NoteDefaultStore = { set: vi.fn(), get: () => ({ style: 'highlight', color: 'blank' }) };
    w.relativeDate = () => '1w ago';
    render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
    expect(document.body.textContent).toContain('MARKER: the shared name');
    expect(document.body.textContent).not.toContain('Not in a notebook');
  });
});
