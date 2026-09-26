# Round-1 item specs (real VOTReader content). Screens use portrait phone framing; sheets use landscape.
SHEET = ("Render as a clean landscape design-specification board (like a Figma / Dribbble presentation page), "
         "flat, crisp, neatly aligned on a grid, small neutral annotation labels, correctly spelled text. No people, no emoji, no logos, no crosses.")
LANDSCAPE_PHONE = ("Render as a crisp, flat, full-bleed phone screen UI mockup rotated to LANDSCAPE (19.5:9), front view, no hands, no device photo; "
                   "very thin phone outline at most. Correctly spelled legible labels. Professional data-visualization product quality.")
ITEMS = {
 'letter': dict(kind='screen', refs=['13-letter.png'], spec=
  "Screen: the LETTER READER for one prophetic letter of The Volumes of Truth. Content: small context line 'Volume One · Letter 15 · 12/13/04'; "
  "title 'Know That Which Has Been Poured Out, The Word of God'; a compact 'Listen · 6 min' pill; the dedication in italics "
  "'From YahuShua HaMashiach, Our Lord and Savior' / 'The Word of The Lord Spoken to Timothy'; then body text in a beautiful reading serif, beginning with "
  "bold italic 'Thus says The Lord:' followed by 'How is it you have not recognized that which comes from The Father? For that which is of the devil is made plain "
  "and surrounds you on every side. Therefore the things of God become that much more precious, even as you, My son, are most precious in My sight...'. "
  "Include 2 tiny numbered footnote markers (1, 2) in the text styled as small accent superscript bubbles, and one sentence with the reader's own soft highlight "
  "plus a tiny note glyph at the line end. A hairline reading-progress indicator at the top. Chrome is minimal; a compact bottom bar: previous letter, Aa (text settings), "
  "bookmark, share, next letter."),
 'bible': dict(kind='screen', refs=['17b-bible-chapter-verses.png'], spec=
  "Screen: the BIBLE CHAPTER READER. Content: context line 'John 3 · NKJV'; large chapter title 'John 3'; section heading 'Nicodemus and the New Birth' as a small label; "
  "verses with small accent verse numbers: '1 There was a man of the Pharisees named Nicodemus, a ruler of the Jews. 2 This man came to Jesus by night and said to Him, "
  "“Rabbi, we know that You are a teacher come from God; for no one can do these signs that You do unless God is with him.” 3 Jesus answered and said to him, "
  "“Most assuredly, I say to you, unless one is born again, he cannot see the kingdom of God.”' - verse 3 carries the reader's soft honey highlight. "
  "At the bottom, a compact docked mini audio player: play/pause, 'John 3 · KJV · Biblical Restoration', 1:12 / 4:05, a thin progress line, '1.00×' speed, and a read-along toggle."),
 'sheet': dict(kind='screen', refs=['14-footnote-sheet.png'], spec=
  "Screen: a letter being read, dimmed behind a BOTTOM SHEET showing a scripture cross-reference footnote. Sheet content: grabber handle; label 'Footnote 1 of 3' with small "
  "previous / next arrows; reference 'Matthew 12:25-26' with a small 'NKJV' translation switch; the verse text with small verse numbers: '25 But Jesus knew their thoughts, and said to them: "
  "“Every kingdom divided against itself is brought to desolation, and every city or house divided against itself will not stand. 26 If Satan casts out Satan, he is divided against himself. "
  "How then will his kingdom stand?”'; then actions: primary 'Open Matthew 12', secondary 'Copy'."),
 'web': dict(kind='landscape', refs=['18-scripture-web.png'], spec=
  "Screen: THE SCRIPTURE WEB - an interactive visualization of 63,418 cross-references between Bible passages. An arc diagram: the 66 books run along a baseline at the "
  "bottom (tiny labels GEN EXOD LEV NUM DEUT ... PS PROV ISA JER ... MATT MARK LUKE JOHN ACTS ROM ... REV) with a slim chapter-length bar strip, and thousands of hair-thin translucent arcs "
  "join passages; arc height = distance between the passages; colour encodes distance with a restrained harmonious palette. One selected thread glows, with a small floating card: "
  "'Isaiah 53:5 ↔ 1 Peter 2:24' and a button 'Read both'. A top overlay: title 'Scripture Web', '63,418 connections', a segmented control 'Scripture | My Web | Nearby', "
  "a density chip 'Essential', a 'Reset' button, and a tiny legend 'near ↔ across the canon'. Must feel like a museum-grade data-visualization (Tufte / Chris Harrison cross-reference art)."),
 'player': dict(kind='screen', refs=['24-player.png'], spec=
  "Screen: the NOW PLAYING read-along audio screen for a letter being read aloud. Content: title 'Know That Which Has Been Poured Out, The Word of God', subtitle "
  "'Volume One · Letter 15'; the letter text in a scrolling reading panel where the CURRENTLY SPOKEN sentence is softly washed with the accent colour, earlier sentences slightly dimmed; "
  "transport: back 15 s, large play/pause, forward 15 s, previous/next letter; a scrubber 2:41 / 6:05; secondary row: speed '1.00×', sleep timer (moon), 'Follow text' toggle, "
  "'Saved offline' check. Designed for long, restful listening sessions."),
 'search': dict(kind='screen', refs=['23-search.png'], spec=
  "Screen: SEARCH results. Content: a search field containing 'faith' with a clear button; filter chips 'All', 'Scriptures', 'Volumes', 'Answers' (All selected); a line "
  "'About 400 matches in 18 sections' and a sort toggle 'Best match / Book order'; two top 'passage' cards: 'Faith Chapter · Hebrews 11' and 'Faith Without Works · James 2'; then result rows "
  "each with a type label ('Letter' or 'Scripture'), a title ('A Trying of Your Trust, a Testing of Your Resolve... Your Faith Revealed'), a source line "
  "('Letters to The Lord's Little Flock · Letter 26') and a two-line snippet with the matched word 'faith' highlighted."),
 'library': dict(kind='screen', refs=['21-library.png'], spec=
  "Screen: the personal LIBRARY hub. Content: title 'Library', subtitle 'Your notes, highlights and saved passages - kept on this device'; four summary tiles with counts: "
  "'Highlights 124', 'Notes 38', 'Bookmarks 17', 'Journal 9'; a 'Recent' list mixing a highlight ('John 3:16 - For God so loved the world...' with a honey colour dot), a note "
  "('Volume Two · Letter 4 - my reflection on obedience...'), and a journal entry ('Sept 24 - Morning reading' with a small abstract texture thumbnail); a primary button 'New journal entry'; "
  "a quiet footer 'Back up in Settings › Your data'."),
 'settings': dict(kind='screen', refs=['22-settings.png'], spec=
  "Screen: SETTINGS. Content: title 'Settings'; a live preview card at the top showing a sample of text in the current font and size ('In the beginning was the Word, and the Word "
  "was with God...') with three quick controls under it: Theme segmented 'Dark | Light | System', a Text size slider with small and large 'A', Reading font 'EB Garamond ›'. "
  "Then grouped rows with plain labels, one-line descriptions and chevrons: 'Reading - Translation, headings, reading aids', 'Listening - Voices, speed, read-along', 'Auto-scroll', "
  "'Navigation bar', 'Search, tabs & history', 'Your data - Export and import a backup', 'About VOTReader'. One toggle row 'Words of Christ in colour' (on)."),
 'volumes': dict(kind='screen', refs=['11-volumes.png'], spec=
  "Screen: THE VOLUMES index. Content: title 'The Volumes of Truth', subtitle 'Letters from The Lord, Our God and Savior'; the seven volumes as rows, each with a refined "
  "volume numeral (I-VII), name 'Volume One' ... 'Volume Seven', meta ('29 letters · 2004-2006', '29 letters · 2004-2010', '30 letters · 2006-2010', '29 letters · 2010-2011', "
  "'29 letters · 2011-2014', '31 letters · 2011-2014', '67 letters · 2005-2014') and a small circular reading-progress ring (100%, 64%, 12%, 0%, 0%, 0%, 0%); then a section "
  "'Collections' with 'The Lord's Rebuke · 30 letters' and 'Holy Days'."),
 'songs': dict(kind='screen', refs=[], spec=
  "Screen: SONGS OF THE LETTERS - a song page. Content: small header 'Songs of the Letters'; a large abstract cover (soft light breaking through clouds over water, no people, no text); "
  "song title 'Pour Out Your Spirit', source 'from Volume Two · Letter 12'; synced lyrics with the current line washed in the accent colour and the others calm; controls: previous, "
  "play/pause, next, save (heart); a list 'More from this letter' with three songs and durations (3:42, 4:10, 2:58)."),
 'onboarding': dict(kind='screen', refs=['00-home-dark.png'], spec=
  "Screen: FIRST-RUN WELCOME - ONE calm screen that replaces four stacked pop-ups. Content: a small app mark; heading 'Welcome to VOTReader'; one sentence 'The Volumes of Truth and "
  "the Holy Scriptures - to read, listen and study, entirely on your device.'; three benefit rows with small line icons: 'Read every letter and the whole Bible, offline', "
  "'Listen with words that follow along', 'Highlight, note and journal - private to this phone'; a small honest note 'Made by a disciple for personal study; not the canonical source · "
  "thevolumesoftruth.com'; primary button 'Begin reading'; quiet text button 'Take the 3-minute tour'."),
 'appicon': dict(kind='sheet', refs=[], spec=
  "Asset: APP ICON exploration for VOTReader (a personal reader for The Volumes of Truth letters and the Holy Bible). One adaptive Android app icon shown large in the centre (rounded squircle), "
  "and the same icon at three small sizes on a phone home-screen strip beside two neutral placeholder icons. The mark must be simple, symbolic and timeless - an open book whose pages "
  "form a subtle flame or ray of light (or a small oil lamp) - vector-flat, 1-2 colours, no text, no cross, no dove clip-art, no glossy effects."),
 'icons': dict(kind='sheet', refs=[], spec=
  "Asset: a UI ICON SET specimen sheet - 24 matching line icons on a grid with small labels: Home, Back, Search, Tabs, History, Settings, Theme, Bookmark, Highlight, Underline, Note, "
  "Link, Share, Copy, Listen, Play, Pause, Speed, Sleep timer, Offline, Scripture Web (arcs), Journal, Songs, Surprise me. Consistent 24 px grid, 1.75 px stroke, rounded caps, optical balance, "
  "pixel-perfect, like a professional icon-library specimen."),
 'implements': dict(kind='sheet', refs=[], spec=
  "Asset: the TEXT SELECTION & ANNOTATION TOOLKIT spec sheet with 3 states side by side: (1) a line of scripture with a selected span and a floating selection toolbar above it: "
  "6 calm curated highlight swatches (honey, sage, sky, rose, lavender, clay - no neon) and actions Underline, Note, Link, Copy, Share; (2) the same text after a honey highlight with a small note marker; "
  "(3) a 'Note' bottom sheet with the quoted verse, a text field 'Write a note…' and 'Save'. Small spec annotations (spacing, radius)."),
 'components': dict(kind='sheet', refs=[], spec=
  "Asset: a BUTTONS & INTERACTIONS spec sheet: primary button 'Begin reading', secondary 'Maybe later', text button 'Skip'; icon buttons; each shown in default / pressed / focused / disabled "
  "states; a segmented control 'Scripture | My Web | Nearby'; filter chips 'All', 'Scriptures', 'Volumes' (one selected); a toggle row; a list row with chevron; a 'Text size' slider; "
  "a toast 'Highlight removed · Undo'; a bottom-sheet header with grabber. Neat grid with small state labels, like a Figma design-system page."),
}
