# VOTReader design branches (2026-09 mockup exploration)

Exploration only: nothing here is implemented, and no app code changed. These are
Codex-generated mockups of every major VOTReader screen and element, drawn in three
design branches from the app's real content, then iterated on the strongest branch.

- **Review gallery (private, tap to pick):** https://claude.ai/artifact/73k41cjffCEAKUS81uP6Ss
- **Generated with:** Codex CLI 0.157 `codex exec -m gpt-6-luna` and its built-in `image_gen`
  tool, on the owner's ChatGPT plan. The hub rule was Luna only, one or two runs at a time.
- **Current-state references:** Playwright screenshots of `main` @ `0bbc38c` at 412×915
  (default settings: "classic" system-serif font, True Black).

## Why the current UI reads amateur

1. **Gold everywhere, so no hierarchy.** `--gold-border` appears 271 times in `app.css`.
   Every card, chip, input and button is outlined in gold, and titles, chevrons and icons
   are gold as well.
2. **Three type voices per card, nine cards deep on Home:** a letter-spaced caps eyebrow,
   a gold serif title, and an italic subtitle. There are 266 `letter-spacing` declarations
   across 8+ values.
3. **Serif chrome.** The default "classic" setting disables custom fonts, so every label,
   chip and button renders in the phone's system serif. That is the biggest single reason
   the app looks dated.
4. **Crowded chrome.** Up to eight equal-weight gold icons sit in the reading top bar.
5. **Four interruptions on first run:** the About card, "What you can do", the tour offer,
   and a hint toast.
6. **Neon highlight palette:** `#76ff03`, `#ff4081` and `#ffd700` on true black.
7. **Home is a directory.** Where you left off is a small button, not the first thing you see.

"Healthy" here means calm (one accent, no glows), legible (sans for chrome, a book serif for
reading), honest (one welcome, no streaks, "kept on this device"), ergonomic (thumb-reach
controls, 48dp targets), and one reusable component system.

## The branches

| | Branch | Idea |
|---|---|---|
| A | **Vesper** | Refined true black. Gold demoted to one accent (`#D4AF5A`); fills instead of outlines; warm ivory text (`#EFE8DA`); serif titles in Title Case; humanist sans for chrome. |
| B | **Vellum** | Warm paper (`#F5F0E6`), ink (`#1E1A15`), one oxblood accent (`#7B2D26`), gilt hairlines only as rules; book typography. |
| C | **Stillwater** | Slate dark (`#0F1519`), sage-teal accent (`#7FB8A4`), grotesk UI, and a bottom tab bar: Home / Read / Listen / Library. |

Round 2 iterates on **A** by default, with its light-theme twin drawn in B's palette and C's
tab bar tested as an idea on top of A. Picks in the gallery override the default.

## Text fidelity

Round-1 letter and player mockups contain sentences the image model **invented**. They are
flagged in the gallery and must never be read as corpus text. From the footnote-sheet job
onward, every prompt carries a strict rule: use only verbatim text supplied from the corpus
(`src/data/volume-one.js` Letter 15 and the app's NKJV), and draw placeholder lines anywhere
more text is needed.

## Files

- `img/` holds the mockups as web JPEGs (`<item>-<branch>.jpg`, `<item>-r2-<variant>.jpg`)
  and the current-state screenshots (`current-*.jpg`).
- `prompts/` holds the exact job specs sent to Codex (JSON), so any image can be regenerated.
- `tools/` holds the runner (`cxgen.py`: quota-guarded, collects images by Codex thread ID),
  the 1–2 lane queue (`runqueue.sh`) and the prompt builders.

## Every item

### Vesper on the real app

No Codex here: the running app with one injected stylesheet of about 80 lines. Token changes alone remove all 271 gold outlines, move chrome to the bundled Atkinson Hyperlegible sans, and drop the gradient heroes. The top bar and the tiles need component work.

**Today:** <img src="img/current-live-10-home.webp" width="180" alt="Current Vesper on the real app"> <img src="img/current-live-13-letter.webp" width="180" alt="Current Vesper on the real app">

**CSS-only preview · real screens**

<table><tr><td valign="top"><img src="img/live-css-home.webp" width="180" alt="Home"><br><sub>Home</sub></td><td valign="top"><img src="img/live-css-letter.webp" width="180" alt="Letter"><br><sub>Letter</sub></td><td valign="top"><img src="img/live-css-bible.webp" width="180" alt="Bible"><br><sub>Bible</sub></td><td valign="top"><img src="img/live-css-settings.webp" width="180" alt="Settings"><br><sub>Settings</sub></td></tr></table>

### Home

Where you land. It should open on where you left off, not on a directory of nine gold boxes.

**Today:** <img src="img/current-home-10-home.webp" width="180" alt="Current Home">

**Round 1 · three branches**

<table><tr><td valign="top"><img src="img/home-r1-A.webp" width="180" alt="A · Vesper"><br><sub>A · Vesper</sub></td><td valign="top"><img src="img/home-r1-B.webp" width="180" alt="B · Vellum"><br><sub>B · Vellum</sub></td><td valign="top"><img src="img/home-r1-C.webp" width="180" alt="C · Stillwater"><br><sub>C · Stillwater</sub></td></tr></table>

**Round 2 · iterating branch A**

<table><tr><td valign="top"><img src="img/home-r2-refined.webp" width="180" alt="A2 · refined"><br><sub>A2 · refined</sub></td><td valign="top"><img src="img/home-r2-light.webp" width="180" alt="A2 · light twin"><br><sub>A2 · light twin</sub></td><td valign="top"><img src="img/home-r2-tabs.webp" width="180" alt="A2 · bottom tabs"><br><sub>A2 · bottom tabs</sub></td></tr></table>

### Letter reader

The heart of the app: one letter, read for twenty minutes at a time. Chrome should get out of the way.

**Today:** <img src="img/current-letter-13-letter.webp" width="180" alt="Current Letter reader">

**Round 1 · three branches**

<table><tr><td valign="top"><img src="img/letter-r1-A.webp" width="180" alt="A · Vesper"><br><sub>A · Vesper<br><i>Text after "most precious in My sight..." was invented by the image model. Judge the design; round 2 uses the real letter.</i></sub></td><td valign="top"><img src="img/letter-r1-B.webp" width="180" alt="B · Vellum"><br><sub>B · Vellum<br><i>Text after "most precious in My sight..." was invented by the image model. Judge the design; round 2 uses the real letter.</i></sub></td><td valign="top"><img src="img/letter-r1-C.webp" width="180" alt="C · Stillwater"><br><sub>C · Stillwater<br><i>Text after "most precious in My sight..." was invented by the image model. Judge the design; round 2 uses the real letter.</i></sub></td></tr></table>

**Round 2 · iterating branch A**

<table><tr><td valign="top"><img src="img/letter-r2-refined.webp" width="180" alt="A2 · refined, real text"><br><sub>A2 · refined, real text</sub></td><td valign="top"><img src="img/letter-r2-light.webp" width="180" alt="A2 · light twin"><br><sub>A2 · light twin</sub></td><td valign="top"><img src="img/letter-r2-focus.webp" width="180" alt="A2 · focus mode"><br><sub>A2 · focus mode</sub></td></tr></table>

### Bible chapter

Verse numbers, the reader's highlights, and the docked player.

**Today:** <img src="img/current-bible-17b-bible-chapter-verses.webp" width="180" alt="Current Bible chapter">

**Round 1 · three branches**

<table><tr><td valign="top"><img src="img/bible-r1-A.webp" width="180" alt="A · Vesper"><br><sub>A · Vesper</sub></td><td valign="top"><img src="img/bible-r1-B.webp" width="180" alt="B · Vellum"><br><sub>B · Vellum</sub></td><td valign="top"><img src="img/bible-r1-C.webp" width="180" alt="C · Stillwater"><br><sub>C · Stillwater</sub></td></tr></table>

**Round 2 · iterating branch A**

<table><tr><td valign="top"><img src="img/bible-r2-refined.webp" width="180" alt="A2 · refined"><br><sub>A2 · refined</sub></td><td valign="top"><img src="img/bible-r2-light.webp" width="180" alt="A2 · light twin"><br><sub>A2 · light twin</sub></td><td valign="top"><img src="img/bible-r2-select.webp" width="180" alt="A2 · selecting text"><br><sub>A2 · selecting text</sub></td></tr></table>

**HTML render · Vesper system**

<table><tr><td valign="top"><img src="img/bible-html-bible-select-dark.webp" width="180" alt="Selecting text · Vesper · dark"><br><sub>Selecting text · Vesper · dark</sub></td><td valign="top"><img src="img/bible-html-bible-select-light.webp" width="180" alt="Selecting text · Vellum · light"><br><sub>Selecting text · Vellum · light</sub></td></tr></table>

### Footnote sheet

The scripture behind a footnote, without leaving the letter.

**Today:** <img src="img/current-sheet-14-footnote-sheet.webp" width="180" alt="Current Footnote sheet">

**Round 1 · three branches**

<table><tr><td valign="top"><img src="img/sheet-r1-A.webp" width="180" alt="A · Vesper"><br><sub>A · Vesper</sub></td><td valign="top"><img src="img/sheet-r1-B.webp" width="180" alt="B · Vellum"><br><sub>B · Vellum</sub></td><td valign="top"><img src="img/sheet-r1-C.webp" width="180" alt="C · Stillwater"><br><sub>C · Stillwater</sub></td></tr></table>

### Read-along player

Listening while the words follow along. Built for long, restful sessions.

**Today:** <img src="img/current-player-24-player.webp" width="180" alt="Current Read-along player">

**Round 1 · three branches**

<table><tr><td valign="top"><img src="img/player-r1-A.webp" width="180" alt="A · Vesper"><br><sub>A · Vesper<br><i>The read-along text was invented by the image model (not Letter 15). Judge the controls; round 2 uses the real letter.</i></sub></td><td valign="top"><img src="img/player-r1-B.webp" width="180" alt="B · Vellum"><br><sub>B · Vellum<br><i>The read-along text was invented by the image model (not Letter 15). Judge the controls; round 2 uses the real letter.</i></sub></td><td valign="top"><img src="img/player-r1-C.webp" width="180" alt="C · Stillwater"><br><sub>C · Stillwater<br><i>The read-along text was invented by the image model (not Letter 15). Judge the controls; round 2 uses the real letter.</i></sub></td></tr></table>

**Round 2 · iterating branch A**

<table><tr><td valign="top"><img src="img/player-r2-refined.webp" width="180" alt="A2 · refined, real text"><br><sub>A2 · refined, real text</sub></td><td valign="top"><img src="img/player-r2-light.webp" width="180" alt="A2 · light twin"><br><sub>A2 · light twin</sub></td></tr></table>

### Scripture Web

63,418 cross-references drawn as one picture. The art is already museum-grade; the chrome around it is not.

**Today:** <img src="img/current-web-18-scripture-web.webp" width="420" alt="Current Scripture Web">

**Round 1 · three branches**

<table><tr><td valign="top"><img src="img/web-r1-A.webp" width="420" alt="A · Vesper"><br><sub>A · Vesper<br><i>The 2 Timothy 3:16 line is NIV wording ("God-breathed"), not NKJV, and the slogans are invented. Round 2 removes both.</i></sub></td><td valign="top"><img src="img/web-r1-B.webp" width="420" alt="B · Vellum"><br><sub>B · Vellum<br><i>The 2 Timothy 3:16 line is NIV wording ("God-breathed"), not NKJV, and the slogans are invented. Round 2 removes both.</i></sub></td><td valign="top"><img src="img/web-r1-C.webp" width="420" alt="C · Stillwater"><br><sub>C · Stillwater<br><i>The 2 Timothy 3:16 line is NIV wording ("God-breathed"), not NKJV, and the slogans are invented. Round 2 removes both.</i></sub></td></tr></table>

**Round 2 · iterating branch A**

<table><tr><td valign="top"><img src="img/web-r2-refined.webp" width="420" alt="A2 · refined"><br><sub>A2 · refined</sub></td><td valign="top"><img src="img/web-r2-lightB.webp" width="420" alt="A2 · light"><br><sub>A2 · light</sub></td><td valign="top"><img src="img/web-r2-thread.webp" width="420" alt="A2 · thread detail"><br><sub>A2 · thread detail</sub></td></tr></table>

**HTML render · Vesper system**

<table><tr><td valign="top"><img src="img/web-html-web-dark.webp" width="420" alt="Real data · 63,418 threads · Vesper · dark"><br><sub>Real data · 63,418 threads · Vesper · dark</sub></td><td valign="top"><img src="img/web-html-web-light.webp" width="420" alt="Real data · 63,418 threads · Vellum · light"><br><sub>Real data · 63,418 threads · Vellum · light</sub></td><td valign="top"><img src="img/web-html-web-thread-dark.webp" width="420" alt="Thread detail · Vesper · dark"><br><sub>Thread detail · Vesper · dark</sub></td><td valign="top"><img src="img/web-html-web-thread-light.webp" width="420" alt="Thread detail · Vellum · light"><br><sub>Thread detail · Vellum · light</sub></td><td valign="top"><img src="img/web-html-web-prophecy-dark.webp" width="420" alt="Prophecy layer · 51 threads · Vesper · dark"><br><sub>Prophecy layer · 51 threads · Vesper · dark</sub></td><td valign="top"><img src="img/web-html-web-prophecy-light.webp" width="420" alt="Prophecy layer · 51 threads · Vellum · light"><br><sub>Prophecy layer · 51 threads · Vellum · light</sub></td></tr></table>

### Search and Library

Finding a passage, and everything you have kept.

**Today:** <img src="img/current-search-library-23-search.webp" width="420" alt="Current Search and Library"> <img src="img/current-search-library-21-library.webp" width="420" alt="Current Search and Library">

**Round 1 · three branches**

<table><tr><td valign="top"><img src="img/search-library-r1-A.webp" width="420" alt="A · Vesper"><br><sub>A · Vesper</sub></td><td valign="top"><img src="img/search-library-r1-B.webp" width="420" alt="B · Vellum"><br><sub>B · Vellum</sub></td><td valign="top"><img src="img/search-library-r1-C.webp" width="420" alt="C · Stillwater"><br><sub>C · Stillwater</sub></td></tr></table>

### Settings and the Volumes index

How the app is shaped, and the seven volumes at a glance.

**Today:** <img src="img/current-settings-volumes-22-settings.webp" width="420" alt="Current Settings and the Volumes index"> <img src="img/current-settings-volumes-11-volumes.webp" width="420" alt="Current Settings and the Volumes index">

**Round 1 · three branches**

<table><tr><td valign="top"><img src="img/settings-volumes-r1-A.webp" width="420" alt="A · Vesper"><br><sub>A · Vesper</sub></td><td valign="top"><img src="img/settings-volumes-r1-B.webp" width="420" alt="B · Vellum"><br><sub>B · Vellum</sub></td><td valign="top"><img src="img/settings-volumes-r1-C.webp" width="420" alt="C · Stillwater"><br><sub>C · Stillwater</sub></td></tr></table>

### Welcome and Songs

One calm first-run screen instead of four stacked pop-ups, and the song page.

**Today:** <img src="img/current-onboarding-songs-00-home-dark.webp" width="420" alt="Current Welcome and Songs"> <img src="img/current-onboarding-songs-20-songs.webp" width="420" alt="Current Welcome and Songs">

**Round 1 · three branches**

<table><tr><td valign="top"><img src="img/onboarding-songs-r1-A.webp" width="420" alt="A · Vesper"><br><sub>A · Vesper<br><i>The song title and source are placeholders from my prompt, not a real song in the catalog.</i></sub></td><td valign="top"><img src="img/onboarding-songs-r1-B.webp" width="420" alt="B · Vellum"><br><sub>B · Vellum<br><i>The song title and source are placeholders from my prompt, not a real song in the catalog.</i></sub></td><td valign="top"><img src="img/onboarding-songs-r1-C.webp" width="420" alt="C · Stillwater"><br><sub>C · Stillwater<br><i>The song title and source are placeholders from my prompt, not a real song in the catalog.</i></sub></td></tr></table>

### App icon

The mark on the phone's home screen.

**Today:** <img src="img/current-appicon-icon-512.webp" width="420" alt="Current App icon">

**Round 1 · three branches**

<table><tr><td valign="top"><img src="img/appicon-r1-A.webp" width="420" alt="A · Vesper"><br><sub>A · Vesper<br><i>Some decorative text on these sheets renders blurred; round 2 asks for crisp labels only.</i></sub></td><td valign="top"><img src="img/appicon-r1-B.webp" width="420" alt="B · Vellum"><br><sub>B · Vellum<br><i>Some decorative text on these sheets renders blurred; round 2 asks for crisp labels only.</i></sub></td><td valign="top"><img src="img/appicon-r1-C.webp" width="420" alt="C · Stillwater"><br><sub>C · Stillwater<br><i>Some decorative text on these sheets renders blurred; round 2 asks for crisp labels only.</i></sub></td></tr></table>

### Icon set

The line icons in the bars, sheets and toolbars.

**Today:** <img src="img/current-icons-cur-iconbar.webp" width="420" alt="Current Icon set">

**Round 1 · three branches**

<table><tr><td valign="top"><img src="img/icons-r1-A.webp" width="420" alt="A · Vesper"><br><sub>A · Vesper<br><i>B and C draw Scripture Web as a Wi-Fi symbol; round 2 redraws it as arcs.</i></sub></td><td valign="top"><img src="img/icons-r1-B.webp" width="420" alt="B · Vellum"><br><sub>B · Vellum<br><i>B and C draw Scripture Web as a Wi-Fi symbol; round 2 redraws it as arcs.</i></sub></td><td valign="top"><img src="img/icons-r1-C.webp" width="420" alt="C · Stillwater"><br><sub>C · Stillwater<br><i>B and C draw Scripture Web as a Wi-Fi symbol; round 2 redraws it as arcs.</i></sub></td></tr></table>

### Annotation tools

Selecting, highlighting, underlining and noting. The current palette is ten Material-2014 neons.

**Round 1 · three branches**

<table><tr><td valign="top"><img src="img/implements-r1-A.webp" width="420" alt="A · Vesper"><br><sub>A · Vesper</sub></td><td valign="top"><img src="img/implements-r1-B.webp" width="420" alt="B · Vellum"><br><sub>B · Vellum<br><i>Labels its sample "ESV"; VOTReader offers no ESV.</i></sub></td><td valign="top"><img src="img/implements-r1-C.webp" width="420" alt="C · Stillwater"><br><sub>C · Stillwater</sub></td></tr></table>

### Buttons and interactions

The button system and its states, chips, toggles, sliders, toasts and sheets.

**Today:** <img src="img/current-components-cur-buttons.webp" width="420" alt="Current Buttons and interactions">

**Round 1 · three branches**

<table><tr><td valign="top"><img src="img/components-r1-A.webp" width="420" alt="A · Vesper"><br><sub>A · Vesper</sub></td><td valign="top"><img src="img/components-r1-B.webp" width="420" alt="B · Vellum"><br><sub>B · Vellum</sub></td><td valign="top"><img src="img/components-r1-C.webp" width="420" alt="C · Stillwater"><br><sub>C · Stillwater</sub></td></tr></table>

### Studies

The Bible and letter studies and the Matthew Study Bible.

**Today:** <img src="img/current-studies-30-studies.webp" width="180" alt="Current Studies">

### Answers Only God Can Give

The Ten Commandments and 102 topics, browsable.

**Today:** <img src="img/current-answers-31-answers.webp" width="180" alt="Current Answers Only God Can Give">

### Letter index

Volume One, letter by letter, with what you have read.

**Today:** <img src="img/current-index-35-chapter-index.webp" width="180" alt="Current Letter index">

### History

A calm trail of what you read, instead of an empty scroll.

**Today:** <img src="img/current-history-32-history.webp" width="180" alt="Current History">

### Tabs switcher

Several readings open at once.

### Journal entry

Writing, a photo, a voice memo and a linked passage, kept on the phone.

**Today:** <img src="img/current-journal-39-journal.webp" width="180" alt="Current Journal entry">

### Highlights

Everything highlighted, filtered by the six calm colours.

### Appearance settings

Theme, text size and the reading font, previewed live.

**Today:** <img src="img/current-appearance-36-settings-appearance.webp" width="180" alt="Current Appearance settings">

### Your data

Backup made plain: export a file, import a file, nothing leaves the phone otherwise.

### Lock-screen player

The media notification while a letter plays.

### Home-screen widgets

An idea: continue reading from the phone's home screen.

### Scripture Web · My Web

Only the links you made yourself, drawn the same way.

### Search

Finding a passage across every collection.

**Today:** <img src="img/current-search-html-23-search.webp" width="180" alt="Current Search">

### Welcome

One calm first-run screen instead of four stacked pop-ups.

**Today:** <img src="img/current-onboarding-html-00-home-dark.webp" width="180" alt="Current Welcome">
