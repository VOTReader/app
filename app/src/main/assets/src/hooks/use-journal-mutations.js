/* ═══════════════════════════════════════════════════════════════════════
   useJournalMutations — journal-create-and-edit entry point (P7e)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   The smallest Phase 1 concern — a single function App() used to define
   inline. createAndEditJournal is the entry-point that the journal-hub
   "New entry" button calls: it adds a journal entry via JournalStore,
   records the create event in JournalStatsStore (with milestone toast
   side-effect), and navigates to the editor for the new entry.

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
    if (typeof JournalStatsStore !== 'undefined') {
      const newMilestones = JournalStatsStore.recordNewEntry(e.created);
      if (newMilestones && newMilestones.length) {
        newMilestones.forEach((m) => jrnShowMilestoneToast(m));
      }
    }
    setJournalEntryId(e.id);
    setScreen('journal-editor');
  };

  return { createAndEditJournal };
}
