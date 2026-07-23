/* ═══════════════════════════════════════════════════════════════════════
   useJournalMutations — journal-create-and-edit entry point (P7e)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   The smallest Phase 1 concern — a single function App() used to define
   inline. createAndEditJournal is the entry-point that the journal-hub
   "New entry" button calls: it adds a journal entry via JournalStore and
   navigates to the editor for the new entry.

   P1-5/P1-7 (2026 Wave 0): it no longer records stats / fires milestone
   toasts here. The toast popped on the New-Entry TAP, before a word was
   written, and a backed-out blank entry still advanced the streak. Instead
   it leaves a localStorage marker naming the new entry's id; the editor
   (JournalEditorScreen) records stats + toasts on the FIRST NON-EMPTY SAVE,
   and its prune-on-exit path clears the marker if the entry dies blank.

   OWNS:
     - createAndEditJournal()    creates a JournalStore entry, leaves the
                                 first-save stats marker for the editor,
                                 sets journalEntryId, navigates to
                                 journal-editor screen.

   DOES NOT OWN:
     - JournalStore itself — stays in bundle-b's stores layer (this hook
       just calls JournalStore.add()).
     - JournalStatsStore — the milestone/stats recording moved into the
       editor's first non-empty save (see above).
     - The journal editor screen — render tree, stays in ui/screens/.

   PARAMS:
     setJournalEntryId   App() useState setter. Tells the editor which
                         entry to render.
     setScreen           Nav setter. Routes to 'journal-editor'.

   RETURNS: { createAndEditJournal }

   STORAGE: writes the 'vot-journal-new-entry-stats' localStorage marker
            (consumed/cleared by JournalEditorScreen). Entry writes flow
            through JournalStore.

   WINDOW: none.

   READS FROM GLOBAL SCOPE (cross-bundle):
     JournalStore           bundle-b stores layer.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Journal-mutation entry point. Currently owns just createAndEditJournal;
 * future journal-mutation entry points (duplicate-entry, import, etc.)
 * would land here too.
 *
 * @param {{
 *   setJournalEntryId: (v: any) => void,
 *   setScreen: (v: any) => void
 * }} args
 * @returns {{ createAndEditJournal: () => void }}
 */
export function useJournalMutations({ setJournalEntryId, setScreen }) {
  const createAndEditJournal = () => {
    if (typeof JournalStore === 'undefined') return;
    if (typeof StorageHealth !== 'undefined' && StorageHealth.checkFirstDataCreation().shouldBlock) return;
    const e = JournalStore.add();
    // Hand the new entry's id to the editor for first-save stats recording
    // (see header). The same key literal lives in JournalEditorScreen.jsx.
    try { localStorage.setItem('vot-journal-new-entry-stats', e.id); } catch (_e) { /* best-effort */ }
    setJournalEntryId(e.id);
    setScreen('journal-editor');
  };

  return { createAndEditJournal };
}
