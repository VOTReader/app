/* One crashed sheet no longer takes every sheet down until the app restarts
   (v15-01, improvement sweep 2026-09-22 REPORT #3).

   AppShellSheets wraps the selection toolbar and all eleven sheets in ONE
   ErrorBoundary with fallback={null}, and that boundary never reset: after any
   sheet threw, the toolbar and every other sheet stayed gone until a restart,
   behind a toast that said only "That panel ... closed". A crash now closes
   the open sheets and resets the boundary, so the toolbar comes back and the
   next sheet opens; three crashes inside ten seconds leave it down (a sheet
   that throws on every render would otherwise loop). Real ErrorBoundary; every
   sheet a stub (they are free globals, as in AppShellOverlays.test.jsx). */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { AppShellSheets } from './AppShellSheets.jsx';
import { ErrorBoundary } from '../../components/ErrorBoundary.jsx';

const G = /** @type {any} */ (globalThis);
G.ErrorBoundary = ErrorBoundary;
G.useModalRegistry = () => {};
G.SelectionToolbar = () => <div data-testid="toolbar" />;
G.AnnotationActionChip = () => null;
G.LinkSidebar = () => null;
G.LinkPicker = () => null;
G.VersePickerScreen = () => null;
G.LetterExcerptPickerScreen = () => null;
G.NotebookPickerSheet = () => null;
G.MultiNotePopover = () => null;
G.JournalInboundSheet = () => null;
G.BookmarkCreateSheet = () => null;
G.BookmarkPopover = () => <div data-testid="bookmark-popover" />;
let noteThrows = true;
G.NoteSheet = () => { if (noteThrows) throw new Error('note sheet broke'); return <div data-testid="note-sheet" />; };

afterEach(() => { cleanup(); noteThrows = true; delete G.showToast; });

/** App's state slots, as app.jsx holds them, driving the real AppShellSheets. */
let api;
function Harness() {
  const [noteSheetTarget, setNoteSheetTarget] = React.useState(null);
  const [bookmarkPopoverPayload, setBookmarkPopoverPayload] = React.useState(null);
  const [annChip, setAnnChip] = React.useState(null);
  const [linkRefineRequest, setLinkRefineRequest] = React.useState(null);
  const [notebookPickerTarget, setNotebookPickerTarget] = React.useState(null);
  const [multiNotePayload, setMultiNotePayload] = React.useState(null);
  const [bookmarkCreatePending, setBookmarkCreatePending] = React.useState(null);
  const [inboundJournalPayload, setInboundJournalPayload] = React.useState(null);
  const [lastLinkCreated, setLastLinkCreated] = React.useState(null);
  api = { setNoteSheetTarget, setBookmarkPopoverPayload, noteSheetTarget };
  return (
    <AppShellSheets
      openLinkPicker={() => {}} openNoteSheet={setNoteSheetTarget} closeNoteSheet={() => setNoteSheetTarget(null)}
      annChip={annChip} setAnnChip={setAnnChip}
      linkSidebarKey={null} closeLinkSidebar={() => {}} navigateToLink={() => {}}
      linkPickerSource={null} closeLinkPicker={() => {}} linkPickerMode={null} linkPickerOnPickRef={{ current: null }}
      linkRefineRequest={linkRefineRequest} setLinkRefineRequest={setLinkRefineRequest}
      lastLinkCreated={lastLinkCreated} setLastLinkCreated={setLastLinkCreated}
      noteSheetTarget={noteSheetTarget} setNoteSheetTarget={setNoteSheetTarget}
      notebookPickerTarget={notebookPickerTarget} setNotebookPickerTarget={setNotebookPickerTarget}
      multiNotePayload={multiNotePayload} setMultiNotePayload={setMultiNotePayload}
      bookmarkPopoverPayload={bookmarkPopoverPayload} setBookmarkPopoverPayload={setBookmarkPopoverPayload}
      bookmarkCreatePending={bookmarkCreatePending} setBookmarkCreatePending={setBookmarkCreatePending}
      inboundJournalPayload={inboundJournalPayload} setInboundJournalPayload={setInboundJournalPayload}
    />
  );
}

/** React logs every caught render error; keep the run quiet. */
function quietly(fn) {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try { return fn(); } finally { spy.mockRestore(); }
}

describe('AppShellSheets: a crashed sheet does not take the others down (v15-01)', () => {
  it('after the note sheet crashes, the toolbar is back and the bookmark popover still opens', () => {
    G.showToast = vi.fn();
    render(<Harness />);
    expect(screen.getByTestId('toolbar')).toBeTruthy();
    quietly(() => act(() => { api.setNoteSheetTarget({ groupId: 'g1' }); }));
    expect(G.showToast).toHaveBeenCalledTimes(1);          // the reader is still told the panel closed
    expect(screen.getByTestId('toolbar')).toBeTruthy();     // RED before: gone until restart
    act(() => { api.setBookmarkPopoverPayload({ id: 'bk1' }); });
    expect(screen.getByTestId('bookmark-popover')).toBeTruthy();
  });

  it('the crashed sheet is closed, and opens again once it can render', () => {
    render(<Harness />);
    quietly(() => act(() => { api.setNoteSheetTarget({ groupId: 'g1' }); }));
    expect(api.noteSheetTarget).toBe(null);
    noteThrows = false;
    act(() => { api.setNoteSheetTarget({ groupId: 'g1' }); });
    expect(screen.getByTestId('note-sheet')).toBeTruthy();
  });

  it('a sheet that throws every time stops being retried after three crashes in ten seconds', () => {
    render(<Harness />);
    for (let i = 0; i < 3; i++) quietly(() => act(() => { api.setNoteSheetTarget({ groupId: 'g' + i }); }));
    expect(screen.queryByTestId('toolbar')).toBe(null);     // down, as before: no crash loop
  });
});
