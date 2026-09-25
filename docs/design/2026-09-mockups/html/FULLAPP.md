# Full-app pass: brief shared by every area agent

You are redrawing EVERY surface in your assigned area of VOTReader, a personal scripture-reading app
(The Volumes of Truth prophetic letters, the Bible, studies, audio), in the approved Vesper (dark) /
Vellum (light) system. Working directory:
docs/design/2026-09-mockups/html

Before drawing anything:
1. Read KIT.md fully (including "Boards and tall pages"), kit/kit.css, and screens/bible-select.html.
2. Look at these renders to match the established look exactly: renders/index-dark.png,
   renders/studies-dark.png, renders/highlights-dark.png, renders/sheet-light.png,
   renders/player-sleep-dark.png, renders/components-dark.png, renders/answers-dark.png.
3. Read the SOURCE of every surface you draw (paths are relative to app/src/main/assets/):
   the JSX, including the render branches for empty, loading and error states, and any CSS it depends on.
   Take the real labels, headings, empty-state copy, section names, sort and filter options and counts
   from there. You are redesigning the look and hierarchy, not the features. Do not invent features.
   You may tighten a clumsy UI label, but list every label change in your report.

Rules:
- Work only inside screens/. Never edit kit/, render.mjs, KIT.md or other agents' files. Prefix
  every file you create with your area prefix (given below).
- Render with `node render.mjs <names>` (loopback server already running on 127.0.0.1:8095). Look at
  BOTH theme renders of every screen once with Read, fix what is visibly wrong, render again, stop.
- Text fidelity: scripture, letter, Answers, Words to Live By, study and song text must be VERBATIM
  from the corpus files in app/src/main/assets/src/data/ (volume-*.js, books.js for
  NKJV, answers.js, the-blessed.js, holy-days.js, letters-*.js, lords-rebuke.js, matthew*.js,
  bible-studies.js, hidden-manna.js). Quote short real excerpts, or use .ph placeholder bars. Never
  write readable invented sentences attributed to God, the Bible, the letters or the songs. The
  reader's own notes, journal text and link notes are ALWAYS .ph bars.
- Verse ranges use an ASCII hyphen (John 3:1-8), never an en dash.
- Hidden Manna must never appear in a public index, search result or Home tile. It is reachable only
  from the Matthew study chain.
- Populated states are more useful than empty ones: draw the populated screen first, then add its
  empty, loading and error states (in the app's own words) as a board or extra files.
- Small surfaces (toasts, popovers, menus, chips, banners, hints, tour stops) go on boards
  (`data-size`, `.board`, `.phone-s` / `.phone-m`). Long screens go on tall pages.

When done, report: every file you rendered, one line per file saying what it shows, and anything you
could not get right or had to guess.
