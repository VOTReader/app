/* AnnotationActionChip — style switcher (B2).
   ─────────────────────────────────────────────────────────────────
   The chip on a plain highlight had Remove · Color · Convert-to-note
   but no way to restyle (highlight ↔ underline ↔ squiggle). B2 adds a
   Style mode. These lock down: the Style button is on the main row, the
   mode restyles via AnnotationStore.convertGroup, the current kind shows
   active, and restyling a NOTE also updates the last-used note default
   (mirroring the NoteSheet). The chip reads bare globals, so we stub them. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AnnotationActionChip } from './AnnotationActionChip.jsx';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';

// The chip's confirm mode renders the REAL ConfirmStrip (a bare global at
// runtime) so the confirm-gate test below is non-vacuous.
/** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;

afterEach(() => {
  cleanup();
  delete window.AnnotationStore;
  delete window.NoteStore;
  delete window.NoteDefaultStore;
  delete window.HL_COLORS;
});

const chipProps = { x: 100, y: 100, hlKey: 'k', groupId: 'g1' };

function setupStores(ann, { isNote = false } = {}) {
  window.HL_COLORS = ['yellow', 'green', 'blue'];
  window.AnnotationStore = {
    get: () => [ann],
    convertGroup: vi.fn(),
    recolorGroup: vi.fn(),
    removeGroup: vi.fn(),
    getByGroup: () => [{ key: 'k', ann }],
  };
  window.NoteStore = {
    get: () => (isNote ? { groupId: ann.groupId } : null),
    remove: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
  };
  window.NoteDefaultStore = { set: vi.fn() };
}

describe('AnnotationActionChip style switcher', () => {
  it('shows a Style button on the main row', () => {
    setupStores({ id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'hi' });
    render(<AnnotationActionChip chip={chipProps} onClose={() => {}} onNoteRequest={() => {}} />);
    expect(screen.getByTitle('Style')).toBeTruthy();
  });

  it('opens the style mode and restyles a highlight via convertGroup, then closes', () => {
    const ann = { id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'hi' };
    setupStores(ann);
    const onClose = vi.fn();
    render(<AnnotationActionChip chip={chipProps} onClose={onClose} onNoteRequest={() => {}} />);
    fireEvent.click(screen.getByTitle('Style'));
    fireEvent.click(screen.getByTitle('Squiggle underline'));
    expect(window.AnnotationStore.convertGroup).toHaveBeenCalledWith('g1', 'squiggle');
    expect(onClose).toHaveBeenCalled();
  });

  it('marks the current kind active in the style mode', () => {
    setupStores({ id: 'g1', groupId: 'g1', kind: 'underline', color: 'yellow', text: 'hi' });
    render(<AnnotationActionChip chip={chipProps} onClose={() => {}} onNoteRequest={() => {}} />);
    fireEvent.click(screen.getByTitle('Style'));
    expect(screen.getByTitle('Underline').className).toContain('active');
    expect(screen.getByTitle('Highlight').className).not.toContain('active');
    expect(screen.getByTitle('Squiggle underline').className).not.toContain('active');
  });

  it('restyling a NOTE updates the last-used note default (mirrors the sheet)', () => {
    const ann = { id: 'g1', groupId: 'g1', kind: 'highlight', color: 'blue', text: 'hi' };
    setupStores(ann, { isNote: true });
    render(<AnnotationActionChip chip={chipProps} onClose={() => {}} onNoteRequest={() => {}} />);
    fireEvent.click(screen.getByTitle('Style'));
    fireEvent.click(screen.getByTitle('Underline'));
    expect(window.AnnotationStore.convertGroup).toHaveBeenCalledWith('g1', 'underline');
    expect(window.NoteDefaultStore.set).toHaveBeenCalledWith('underline', 'blue');
  });

  it('a regular highlight restyle does NOT touch the note default', () => {
    const ann = { id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'hi' };
    setupStores(ann); // not a note
    render(<AnnotationActionChip chip={chipProps} onClose={() => {}} onNoteRequest={() => {}} />);
    fireEvent.click(screen.getByTitle('Style'));
    fireEvent.click(screen.getByTitle('Underline'));
    expect(window.NoteDefaultStore.set).not.toHaveBeenCalled();
  });

  it('Back returns to the main row without mutating', () => {
    setupStores({ id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'hi' });
    render(<AnnotationActionChip chip={chipProps} onClose={() => {}} onNoteRequest={() => {}} />);
    fireEvent.click(screen.getByTitle('Style'));
    fireEvent.click(screen.getByTitle('Back'));
    expect(screen.getByTitle('Style')).toBeTruthy(); // main row again
    expect(window.AnnotationStore.convertGroup).not.toHaveBeenCalled();
  });

  // Destructive-action placement: Remove is LAST on the main row (after
  // Color/Style/Note) so a tap aimed at the common actions can't land on it.
  it('renders Remove as the LAST main-row button, on a highlight and on a note', () => {
    setupStores({ id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'hi' });
    const { container, unmount } = render(<AnnotationActionChip chip={chipProps} onClose={() => {}} onNoteRequest={() => {}} />);
    let labels = [...container.querySelectorAll('.ann-chip-btn')].map(b => b.textContent);
    expect(labels).toEqual(['Color', 'Style', 'Note', 'Remove']);
    unmount();
    setupStores({ id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'hi' }, { isNote: true });
    const r2 = render(<AnnotationActionChip chip={chipProps} onClose={() => {}} onNoteRequest={() => {}} />);
    labels = [...r2.container.querySelectorAll('.ann-chip-btn')].map(b => b.textContent);
    expect(labels).toEqual(['Color', 'Style', 'Remove']); // no Note button on an existing note
  });

  it('Remove still confirm-gates: tapping it swaps to the ConfirmStrip, not an instant delete', () => {
    setupStores({ id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'hi' });
    render(<AnnotationActionChip chip={chipProps} onClose={() => {}} onNoteRequest={() => {}} />);
    fireEvent.click(screen.getByTitle('Remove'));
    expect(window.AnnotationStore.removeGroup).not.toHaveBeenCalled();
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByText('Yes, remove')).toBeTruthy();
  });
});
