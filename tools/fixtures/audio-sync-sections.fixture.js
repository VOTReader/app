/* FIXTURE for the WTLB compilation timelines (AUDIO_SYNC_SECTIONS) -- the shape
   src/data/audio-sync-sections.js ships (tools/batch-align-sections.py; agreed with
   the readalong lane 2026-09-20, D:/Swarm/lanes/align/wtlb-shape.md). Two REAL
   AUDIO_SECTIONS ids, real AUDIO_MANIFEST keys, rows cut from the letters' own
   AUDIO_SYNC rows and shifted onto the section clock. Drives every renderer branch:
     asset 1 (Part 1): three letters in playback order; first row at 4.2 s (intro
       silence: nothing paints and nothing navigates before it); the intro's first
       row is the Format-B whole-paragraph sentinel (cs = ce = -1).
     asset 2 (Section 1): wtlb2:i-am-the-lord-s (corpus num 2) is ABSENT between two
       present letters -- the page-follow skips it; the last letter has ONE row and
       runs to the end of the file; the middle letter's first row is the sentinel.
   Not shipped, not loaded by the app; tools/check-audio-sync.js accepts it via
   AUDIO_SYNC_SECTIONS_FILE (test_batch_align_sections.py). */
var AUDIO_SYNC_SECTIONS = {
"1U0xmOIDAo6Q99aZMeKh-3CYVDninq62g":{
"wtlb1:introduction":[[4.2, 0, -1, -1, 0], [5.31, 0, 30, 50, 0], [6.97, 0, 58, 91, 0], [12.66, 0, 99, 131, 0]],
"wtlb1:come-love-awaits-you":[[61.0, 0, 0, 54, 0], [66.16, 1, 0, 40, 0], [69.32, 1, 42, 82, 0], [72.5, 2, 0, 33, 0]],
"wtlb1:crowning-glory":[[118.5, 0, 0, 40, 0], [121.7, 1, 0, 50, 0], [125.34, 1, 52, 90, 0]]
},
"1xFRVnuKEBAjhk3ccHkl6nWkJFv7zo7rL":{
"wtlb2:introduction":[[3.0, 0, 2, 18, 0], [4.51, 0, 24, 32, 0], [5.66, 1, 1, 21, 0]],
"wtlb2:the-bridegroom-approaches":[[90.0, 0, -1, -1, 0], [94.34, 0, 35, 197, 0], [106.0, 0, 198, 222, 0]],
"wtlb2:the-only-way":[[150.25, 0, 0, 40, 0]]
}
};
