// @ts-nocheck
/* W48 — the bookmark the create sheet saves keeps the words it was made on
   (`text`), so applyDOMBookmarks can follow them after an edit. Real
   AppShellSheets; every sheet but the bookmark one is a stub. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { AppShellSheets } from './AppShellSheets.jsx';
import { ErrorBoundary } from '../../components/ErrorBoundary.jsx';

const G = /** @type {any} */ (globalThis);
G.ErrorBoundary = ErrorBoundary;
G.useModalRegistry = () => {};
G.SelectionToolbar = () => null;
G.AnnotationActionChip = () => null;
G.LinkSidebar = () => null;
G.LinkPicker = () => null;
G.VersePickerScreen = () => null;
G.LetterExcerptPickerScreen = () => null;
G.NotebookPickerSheet = () => null;
G.MultiNotePopover = () => null;
G.JournalInboundSheet = () => null;
G.BookmarkPopover = () => null;
G.NoteSheet = () => null;
/** Saves what the real sheet would send for this pending bookmark. */
G.BookmarkCreateSheet = ({ pending, onConfirm }) => (
  <button onClick={() => onConfirm({
    editId: null, hlKey: pending.hlKey, label: 'L', thought: '',
    ...(pending.text ? { text: pending.text } : {}),
  })}>save</button>
);

afterEach(() => { cleanup(); delete G.BookmarkStore; });

let api;
function Harness() {
  const [bookmarkCreatePending, setBookmarkCreatePending] = React.useState(null);
  api = { setBookmarkCreatePending };
  const noop = () => {};
  return (
    <AppShellSheets
      openLinkPicker={noop} openNoteSheet={noop} closeNoteSheet={noop}
      annChip={null} setAnnChip={noop}
      linkSidebarKey={null} closeLinkSidebar={noop} navigateToLink={noop}
      linkPickerSource={null} closeLinkPicker={noop} linkPickerMode={null} linkPickerOnPickRef={{ current: null }}
      linkRefineRequest={null} setLinkRefineRequest={noop}
      lastLinkCreated={null} setLastLinkCreated={noop}
      noteSheetTarget={null} setNoteSheetTarget={noop}
      notebookPickerTarget={null} setNotebookPickerTarget={noop}
      multiNotePayload={null} setMultiNotePayload={noop}
      bookmarkPopoverPayload={null} setBookmarkPopoverPayload={noop}
      bookmarkCreatePending={bookmarkCreatePending} setBookmarkCreatePending={setBookmarkCreatePending}
      inboundJournalPayload={null} setInboundJournalPayload={noop}
    />
  );
}

describe('AppShellSheets saves a new bookmark with its words (W48)', () => {
  it('stores the words a ranged bookmark was made on', () => {
    G.BookmarkStore = { add: vi.fn() };
    render(<Harness />);
    act(() => { api.setBookmarkCreatePending({ hlKey: 'bible:psalms:23:1:4-15', defaultLabel: 'L', text: 'Lord is my' }); });
    fireEvent.click(screen.getByText('save'));
    expect(G.BookmarkStore.add).toHaveBeenCalledWith(expect.objectContaining({
      hlKey: 'bible:psalms:23:1:4-15', text: 'Lord is my',
    }));
  });

  it('a bookmark with no words (a whole chapter) gets no text field', () => {
    G.BookmarkStore = { add: vi.fn() };
    render(<Harness />);
    act(() => { api.setBookmarkCreatePending({ hlKey: 'bible:psalms:23', defaultLabel: 'Psalms 23' }); });
    fireEvent.click(screen.getByText('save'));
    expect(G.BookmarkStore.add).toHaveBeenCalledTimes(1);
    expect(G.BookmarkStore.add.mock.calls[0][0]).not.toHaveProperty('text');
  });
});
