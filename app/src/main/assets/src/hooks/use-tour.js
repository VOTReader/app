/* ═══════════════════════════════════════════════════════════════════════
   useTour — hands the tour its six navigation verbs
   ═══════════════════════════════════════════════════════════════════════
   ES module, bundle-b. App() calls this once with its own nav helpers and
   state setters; the hook builds the small vocabulary the stops in
   utils/tour-steps.js use (`enter` / `act` keys) and attaches it to
   TourController on every render, so the tour always navigates with the
   app's current closures. Nothing here decides anything — the stops do.

     goHome            App's goHome
     openLetter        Volume One › "Chosen by God" (short, has a recording)
     openBible         John 3, in whatever translation the reader chose
     goJournalHub      App's goJournalHub (Library › Journal)
     openSettingsData  App's goSettings; SettingsScreen opens whichever group
                       the stop's `settingsGroup` asks for (Your Data for the
                       backup stop, Reading for the settings stop)
     ensureListening   openBible, then the Bible screen's own Listen pill
                       unless John is already up — the listening stops' enter
                       (player, back-to-words, done), so the bar is there to
                       teach on, Back from beyond them included

   App is at its 800-line canary: this hook exists so the tour costs App()
   two lines (this call, and `screen` on AppShellOverlays).
   ═══════════════════════════════════════════════════════════════════════ */

import { TourController } from '../utils/tour-controller.js';

export const TOUR_LETTER = Object.freeze({ id: 'chosen-by-god', screen: 'vot-one-letter' });
export const TOUR_BIBLE = Object.freeze({ bookId: 'john', chapterNum: 3, screen: 'bible-ch' });

export function useTour({ goHome, goJournalHub, goSettings, setScreen, setLetterId, setBookId, setChapterNum }) {
  React.useEffect(() => {
    const openBible = () => { setBookId(TOUR_BIBLE.bookId); setChapterNum(TOUR_BIBLE.chapterNum); setScreen(TOUR_BIBLE.screen); };
    TourController.attachNav({
      goHome,
      openLetter: () => { setLetterId(TOUR_LETTER.id); setScreen(TOUR_LETTER.screen); },
      openBible,
      goJournalHub,
      openSettingsData: goSettings,
      ensureListening: () => { openBible(); TourController.pressListenIfIdle(TOUR_BIBLE.bookId); },
    });
  });
}
