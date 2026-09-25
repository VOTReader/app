## What the full-app pass found in the app itself

Drawing every surface meant reading every surface's source first. Along the way the inventory, the area agents
and an audit found these defects in the running app. Each one is worth fixing whatever design is chosen. File
references are under `app/src/main/assets/`. Items marked *(traced)* were read in the code but not reproduced on
a device.

**Dead ends and things that can't be reached**
- Loading and "Couldn’t load this section." screens have no top bar, so system Back is the only way out. The Scripture Web's loading layer also covers its Back button.
- The journal chip (`JournalChip`, the gold count that opens "journal entries about this passage") is defined and tested, but no screen renders it, and nothing calls `__openJournalInbound`.
- The bookmark sheet's "Open Source" is unreachable: every caller hides it.
- Settings › Help promises "Show me around & About" but holds only "Show me around". After first run, About is reachable only from Home's info button.
- The search command `/help` ("Show search help") has no handler. `/clear history` and `/rebuild index` leave the command in the box under "No results", and the rebuild shows no progress.
- History opens pages silently, with no back pill, unlike every other tap-through. Shared `?p=` links do the same.
- Three toasts can't be dismissed or tapped: the restore guard, "Backup saved — … may be missing" and the 16 MiB export abort. The restore guard sits over every screen for the whole session.
- "Could not start the recorder. Please try again." offers only Close. The two "nothing captured" errors say "Try again and speak after the timer starts", but their Try again re-reads the same file rather than recording again.
- Studies home's loading, empty and error states can never show (the list always holds the Matthew entry), so nothing says the letter studies are still downloading.
- Letter 4's "Bible Study" row opens the website, although the Lamb of God study ships in the app.
- "Search the whole library" from Answers opens Search still offering "Search in Answers Only God Can Give".
- Safari on an iPad identifies itself as a Mac, so iPads get the Mac instruction ("File > Add to Dock") in the 7-day storage warning.
- The Songs "Read with music" frame exists in `songs-route.js`, but nothing renders it.

**Wrong or stale copy**
- Verify reports "1 journal entry" for any journal: `utils/backup.js` counts a store's top-level keys, and the journal store saves `{ list: [...] }`.
- One Verify ending reads "…still imported-readable" (`utils/backup-verify.js`).
- The storage write toast says "Open Settings → Storage"; there is no Storage group (it is Your Data).
- The import sheet counts every media file a backup lists, even ones cut short; Verify counts only the readable ones.
- "Close all N tabs?", "N other tabs will be closed" and "Close N tabs after this one?" count pinned tabs, which those actions keep.
- Home hard-codes "1,082 songs…", while the Songs hub counts the live catalog. Song style counts count song families but say "songs".
- Songs show "Not on this phone", though songs can't be downloaded. The empty-queue sentence also shows under "Resuming…".
- The Chapter & Letter Arrows setting defaults to Hidden, but Split's description still says "Default."
- "Eleven stops" counts the tour's closing card but not its welcome card.
- The Garden notice says "approximately ~180 MB"; the tier size already carries its "~".
- The Holy Days end card reads "Next · A Return to the Garden", repeating its own title.
- The selection toolbar's remove question always says "highlight", even over an underline or squiggle.
- A recovered voice recording's entry shows "[Voice recording]" as both its title and its preview.
- History reads "1 visit match".
- Stale comments: `app.jsx` mentions a removed welcome modal; `ConfirmStrip.jsx` still lists journal entries among the type-DELETE cases.

**Search**
- The direct-hit card writes chapter ranges with an en dash ("Matthew 5–7", `SearchScreen.jsx:279`); CLAUDE.md's Permanent Rule 1 asks for the ASCII hyphen.
- Snippets for Answers, Words To Live By, The Blessed and Bible Studies show raw formatting marks (`**`, `_`, `=…=`, `{{ref:…}}`), and some carry stray footnote numbers ("…know them. 2 And was I…").
- A Letters from Timothy result reads "Letter ?". A group header says "400 matches" while the summary says "400+".
- Suggestions capitalise every word ("Mark Of The Beast", "Lord'S Prayer"). Badges and group labels still say "WTLB".
- The Beatitudes quick pick also returns Job 13:12 with "platitudes" marked (a typo correction). "tithe" doesn't match the topic "Tithing" by name. A search started from a selection keeps punctuation inside words ("again,").
- On a phone the suggestion list can't be dismissed: picking a suggestion brings it straight back. *(traced)*

**Links**
- The link picker's Browse › The Holy Bible lists books in `books.js` declaration order: Ephesians first, the Gospels after the General Epistles, Genesis 27th. `buildNavTree()` (`utils/nav-index.js`) trusts a comment saying `_allBooks()` "iterates in canonical book order", but `ALL_BOOKS` is `{matthew, ...BOOKS}` and nothing sorts it.
- Browse shows "?" as Holy Days' badge and "1 chapters".
- The excerpt picker runs letter segments together ("Lord:It is written,that…"), which can misplace the link icon, and shows raw `{{ref:…}}` tokens in study chapters.

**Scripture Web**
- The guide says "Pinch or press + to zoom in", but the on-screen +/− buttons were removed; + works only on a keyboard.
- The height ruler's fourth mark, "31,102 · the canon", can never show: at the highest camera position the canon's crown sits under the top bar.
- The chapter row prints "to 40 chapters" for anything larger, because only 40 groups are counted (Isaiah 53 reaches 119).
- "Your nearby links" lists the first 36 links in the order they were made, not the ones nearest the view.
- A Timothy's-thread card prints the raw collection key ("four" for Volume Four).

**Inconsistent patterns**
- Three delete confirms (type DELETE, three steps for a journal entry, a ConfirmStrip elsewhere), and two wordings for the same link delete ("Delete this link?" in My Links, "Remove this link?" in the reader).
- Two "the web can’t be drawn" designs; the dead-end panel can't actually appear, because the no-WebGL flag is set only after the graph loads.
- Verse inside Words To Live By, Blessed and Holy Days entries has a blank line between every line, which breaks stanzas apart.
- A cold start in the light theme goes black (Android's launch splash), then paper, while the PWA's theme colour paints the browser bar gold (#b8860b). All three should follow the theme.
- Storage banners cover the top bar, and toasts can cover the import sheet's buttons for the 5 seconds the integrity warning shows.

**Dead code**
- Five search kind badges (Chapter, Heading, Study Note, Cross-Ref, Footnote) can no longer occur; the index stopped creating them.
- The selection toolbar's "Link hidden" state can't occur: a selection with no markable text closes the toolbar.
- The Scripture Web's "N of M connections not drawn here" can't occur, since nothing is hidden any more.
