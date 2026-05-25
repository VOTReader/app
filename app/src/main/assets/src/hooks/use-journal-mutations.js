/* ═══════════════════════════════════════════════════════════════════════
   useJournalMutations — journal-create-and-edit entry point (P7e)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   The smallest Phase 1 concern — a single function App() used to define
   inline. createAndEditJournal is the entry-point that the journal-hub
   "New entry" button calls: it adds a journal entry via JournalStore,
   records the create event in JournalStatsStore (with milestone toast
   side-effect), bumps the hlTick so annotation memos refresh, and
   navigates to the editor for the new entry.

   OWNS:
     - createAndEditJournal()    creates a JournalStore entry, fires any
                                 milestone toasts the new entry crosses,
                                 sets journalEntryId, navigates to
                                 journal-editor screen.

   DOES NOT OWN:
     - JournalStore itself — stays in bundle-b's stores layer (this hook
       just calls JournalStore.add()).
     - JournalStatsStore — same; the hook delegates milestone recording
       to it.
     - The journal editor screen — render tree, stays in ui/screens/.

   PARAMS:
     setHlTick           App() useState setter. Bumps a cache-bust
                         counter so highlight/note/bookmark memos
                         re-read after the new entry exists (the
                         entry's media slots become reachable).
     setJournalEntryId   App() useState setter. Tells the editor which
                         entry to render.
     setScreen           Nav setter. Routes to 'journal-editor'.

   RETURNS: { createAndEditJournal }

   STORAGE: none directly. Writes flow through JournalStore +
            JournalStatsStore.

   WINDOW: none.

   READS FROM GLOBAL SCOPE (cross-bundle):
     JournalStore           bundle-b stores layer.
     JournalStatsStore      bundle-b stores layer.
     jrnShowMilestoneToast  bundle-b stores layer (journal-stats-store).
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Journal-mutation entry point. Currently owns just createAndEditJournal;
 * future journal-mutation entry points (duplicate-entry, import, etc.)
 * would land here too.
 *
 * @param {{
 *   setHlTick: (updater: (prev: number) => number) => void,
 *   setJournalEntryId: (v: any) => void,
 *   setScreen: (v: any) => void
 * }} args
 * @returns {{ createAndEditJournal: () => void }}
 */
export function useJournalMutations({ setHlTick, setJournalEntryId, setScreen }) {
  const createAndEditJournal = () => {
    if (typeof JournalStore === 'undefined') return;
    const e = JournalStore.add();
    if (typeof JournalStatsStore !== 'undefined') {
      const newMilestones = JournalStatsStore.recordNewEntry(e.created);
      if (newMilestones && newMilestones.length) {
        newMilestones.forEach((m) => jrnShowMilestoneToast(m));
      }
    }
    setHlTick((t) => t + 1);
    setJournalEntryId(e.id);
    setScreen('journal-editor');
  };

  return { createAndEditJournal };
}
