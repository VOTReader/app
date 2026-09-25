"""Round 2: iterate each item's chosen round-1 image as an EDIT TARGET.

v1 = refined (same design, targeted fixes, verbatim text)
v2 = light twin (same layout in the Vellum palette), or a second refinement where a light twin makes no sense
v3 = one UX idea on top of the refined design
Base branch per item comes from BASE (the gallery picks override it when they exist).
"""
import json, sys
from dirs import A, B, FIDELITY
from texts import LETTER15, LETTER15_HEAD, JOHN3_1_5, ISA53_5, PET2_24

BASE = {k: 'A' for k in ['home', 'letter', 'bible', 'sheet', 'player', 'web', 'appicon', 'icons', 'implements', 'components',
                         'search+library', 'settings+volumes', 'onboarding+songs']}
BASE.update(json.loads(sys.argv[1]) if len(sys.argv) > 1 else {})
JOB_OF = {'home': 'p1-home'}

KEEP = ("Image 1 is the chosen design (the EDIT TARGET). Keep its layout, palette, typography, spacing and overall look exactly; "
        "change ONLY what the numbered list says. Every text string must be crisp and correctly spelled. No blur, no vignette, no depth-of-field.")
LIGHT = ("Recreate Image 1's exact screen - same layout, same components, same text, same spacing - as its LIGHT-THEME twin in the Vellum palette: "
         "warm paper background #F5F0E6, cream cards #FBF8F2 with barely-visible shadows, ink text #1E1A15, secondary #6B6257, ONE oxblood accent #7B2D26 "
         "(primary action, selection, verse numbers), gilt hairlines #B89A5B only as dividers. Same fonts as Image 1.")
TABS = ("Add a bottom navigation bar with four labelled tabs - Home, Read, Listen, Library - styled in Image 1's own language "
        "(true-black bar, warm-ivory labels, the selected tab marked with the antique-gold accent). ")

SPECS = {
 'home': [
  ('refined', KEEP + " Changes: (1) the 'CONTINUE READING' label becomes sentence case 'Continue reading' in the small sans, not letter-spaced; "
   "(2) each collection row gets a one-line sans meta under its serif title: 'The Volumes of Truth' / '7 volumes · 244 letters', 'The Scriptures of Truth' / 'Genesis to Revelation · NKJV', "
   "'Answers Only God Can Give' / 'Topics and doctrines', 'Studies' / 'Letter studies · Matthew Study Bible', 'Listening Library' / 'The letters and scriptures, read aloud', "
   "'Songs of the Letters' / 'Sung by the flock'; (3) the title lockup is about 20% smaller and the diamond ornament is removed; (4) 'Surprise me' becomes a quiet text button with a small shuffle icon, centred at the bottom."),
  ('light', LIGHT),
  ('tabs', KEEP + " Changes: " + TABS + "The Home tab is selected. Remove the row of four shortcut tiles (Recent, Notes, Bookmarks and Scripture Web move to the Library tab and the Read tab). "
   "Everything else stays."),
 ],
 'letter': [
  ('refined', KEEP + " Changes: (1) the letter body must read EXACTLY this verbatim text, in this order, with no other sentences: " + LETTER15 +
   " (2) the reader's soft honey highlight sits on the italic sentence beginning 'Like a gemstone shining' with a tiny note glyph at its end; (3) footnote markers are two tiny accent superscript numerals (1, 2) placed after 'The Father?' and after 'in My sight...'; "
   "(4) header context line reads 'Volume One · Letter 15 · 12/13/04'; dedication: " + LETTER15_HEAD + ". Below the last supplied sentence, soft grey placeholder lines only."),
  ('light', LIGHT + " The letter body must read EXACTLY: " + LETTER15 + " Below it only soft placeholder lines."),
  ('focus', KEEP + " Changes: show FOCUS MODE mid-letter - all chrome hidden: no status-bar clutter, no top bar, no bottom bar; only the reading text filling the screen, "
   "a hairline gold progress line at the very top (about 35%), and one small floating translucent pill at bottom-right with two icon buttons: 'Aa' and a play triangle. "
   "The visible text must be EXACTLY this verbatim passage, starting mid-page: " + LETTER15 + " then soft placeholder lines."),
 ],
 'bible': [
  ('refined', KEEP + " Changes: (1) the verses must read EXACTLY (NKJV, verbatim): " + JOHN3_1_5 + " (2) verse 3 keeps the reader's soft honey highlight; "
   "(3) the words of Jesus in verse 3 are set in a very subtle warm tint (a reading option called 'Words of Christ in colour'); (4) the docked mini player stays."),
  ('light', LIGHT + " The verses must read EXACTLY (NKJV): " + JOHN3_1_5),
  ('select', KEEP + " Changes: show the TEXT-SELECTION moment: the words 'unless one is born again, he cannot see the kingdom of God' in verse 3 are selected with two slim gold drag handles, "
   "and a floating selection toolbar sits just above them: a row of six calm highlight swatches (honey, sage, sky, rose, lavender, clay) and below them five labelled actions - Underline, Note, Link, Copy, Share. "
   "The verses must read EXACTLY (NKJV): " + JOHN3_1_5),
 ],
 'sheet': [
  ('refined', KEEP + " Changes: (1) in the dimmed letter behind the sheet, one small footnote numeral '1' glows softly in gold at the end of a placeholder line (the tapped footnote); "
   "(2) under the reference add a tiny sans caption 'Cited in Volume One · Letter 15'; (3) keep 'Open Matthew 12' as the primary action and 'Copy' as secondary."),
  ('light', LIGHT),
  ('stack', KEEP + " Changes: the sheet now pages through all three footnotes of this letter as a horizontal carousel: the current card shows Matthew 12:25-26 (same verbatim text), "
   "the edge of the next card (label 'Footnote 2') peeks in from the right, and three small page dots sit under the cards (first active)."),
 ],
 'player': [
  ('refined', KEEP + " Changes: (1) the reading panel must contain ONLY this verbatim letter text, as flowing prose WITHOUT verse numbers: " + LETTER15 +
   " (2) the CURRENTLY SPOKEN sentence, softly washed in the gold accent, is the italic one beginning 'Like a gemstone shining'; the sentences before it are slightly dimmed; "
   "(3) the title stays 'Know That Which Has Been Poured Out, The Word of God', subtitle 'Volume One · Letter 15'."),
  ('light', LIGHT + " The reading panel holds ONLY this verbatim letter text as prose without verse numbers: " + LETTER15),
  ('sleep', KEEP + " Changes: a small bottom sheet is open over the player titled 'Sleep timer' with choices as large rows: 'Off', '15 minutes', '30 minutes', '45 minutes', "
   "'End of this letter' (selected, with a gold check), and a quiet caption 'Audio fades out gently over 10 seconds.' The reading panel behind it holds only this verbatim text: " + LETTER15),
 ],
 'web': [
  ('refined', KEEP + " Changes: (1) remove every invented slogan and the bottom quote line; (2) the floating card reads 'Isaiah 53:5 ↔ 1 Peter 2:24' with the verbatim NKJV excerpt "
   "'“…by His stripes we are healed.”' and the button 'Read both'; (3) keep the three-way control 'Scripture | My Web | Nearby', the 'Essential' density chip, Reset and the legend."),
  ('lightB', "Image 1 is the chosen design. Recreate it in the Vellum light palette (paper #F5F0E6, oxblood accent #7B2D26 for the selected thread, gilt hairlines), keeping the same arc diagram, "
   "controls and layout; no invented slogans; the floating card reads 'Isaiah 53:5 ↔ 1 Peter 2:24' with '“…by His stripes we are healed.”' and 'Read both'. No blur, all text sharp."),
  ('thread', KEEP + " Changes: a thread has been tapped: the arc diagram dims to 30% except the one glowing gold thread, and a bottom sheet rises over the lower third showing both passages side by side, "
   "each with its reference and verbatim NKJV text - left 'Isaiah 53:5': '" + ISA53_5 + "' - right '1 Peter 2:24': '" + PET2_24 + "' - with two buttons 'Read Isaiah 53' and 'Read 1 Peter 2'."),
 ],
 'appicon': [
  ('final', KEEP + " Changes: turn this into a clean final icon spec sheet: the book-and-flame mark only, perfectly flat and vector-crisp, shown as (1) the adaptive icon on true black, "
   "(2) the Android 13 themed monochrome variant, (3) a 48 px size check, (4) the mark alone on transparent. Remove any blurred or decorative filler text; labels crisp and minimal."),
  ('continuity', "Asset: APP ICON evolution sheet. Start from the CURRENT VOTReader icon (a glowing four-pointed star rising over the dark curve of the earth) and simplify it into a flat, "
   "timeless adaptive Android icon: one antique-gold (#D4AF5A) four-pointed star above a single thin gold horizon arc on true black, no gradients, no globe continents, no glow halos. "
   "Show large, at 3 small sizes, and a monochrome themed variant. Clean spec-board layout, crisp labels, no blur."),
  ('combined', "Asset: APP ICON sheet. A flat adaptive icon on true black combining an open book (warm ivory #EFE8DA pages) with a small antique-gold (#D4AF5A) four-pointed star rising "
   "just above its spine like dawn light. Vector-flat, 2 colours plus black, no text, no cross, no glow. Show large, at 3 small sizes on a home-screen strip, and a monochrome themed variant. Crisp labels, no blur."),
 ],
 'implements': [
  ('refined', KEEP + " Changes: remove the 'ESV' label anywhere (VOTReader offers NKJV, KJV and others, never ESV; use 'NKJV'); keep the six curated swatches; "
   "every label sharp; add a fourth small panel showing the same highlight in the light theme (paper background)."),
 ],
 'icons': [
  ('refined', KEEP + " Changes: redraw the Scripture Web icon as three nested arcs rising from a short baseline (like a bridge of arcs), not a Wi-Fi symbol; remove all blurred or decorative filler text; "
   "every label sharp."),
 ],
 'components': [
  ('refined', KEEP + " Changes: remove all blurred or decorative filler text; every label sharp; make sure pressed, focused and disabled states are visibly different; "
   "add a compact 'Continue reading' card component with a thin progress bar and a Listen button."),
 ],
 'search+library': [
  ('refined', KEEP + " Changes: all text crisp and correctly spelled; in the Library phone, add a small line 'Kept on this device · Back up in Settings' at the bottom."),
  ('light', LIGHT),
 ],
 'settings+volumes': [
  ('refined', KEEP + " Changes: all text crisp and correctly spelled; in Settings, the preview card sample text must read exactly 'In the beginning was the Word, and the Word was with God, and the Word was God.'"),
  ('light', LIGHT),
 ],
 'onboarding+songs': [
  ('refined', KEEP + " Changes: all text crisp and correctly spelled; song lyrics must be soft placeholder lines except the current line, which is a placeholder bar washed in the accent colour (no invented lyric words)."),
  ('light', LIGHT),
 ],
}
ORDER = ['home', 'letter', 'player', 'web', 'bible', 'sheet', 'appicon', 'implements', 'components', 'icons', 'search+library', 'settings+volumes', 'onboarding+songs']
LIMITS = {'max_primary': 95, 'max_weekly': 60}
queue = []
for key in ORDER:
    b = BASE[key]
    r1job = JOB_OF.get(key, 'r1-' + key)
    edit_target = f'out/{r1job}/{key}-{b}.png'
    refs = [edit_target]
    images = []
    for vid, prompt in SPECS[key]:
        images.append({'file': f'{key}-r2-{vid}.png', 'prompt': prompt + '\n' + FIDELITY})
    job = {'name': f'r2-{key}', 'refs': refs, 'images': images, 'base': b,
           'preamble': 'Image 1 (attached) is the chosen mockup from round 1: the design to iterate on. Use it as the edit target or layout reference exactly as each spec says.'}
    job.update(LIMITS)
    json.dump(job, open(f'jobs/r2-{key}.json', 'w'), indent=1)
    queue.append(job['name'])
open('queue_r2.txt', 'w').write('\n'.join(queue) + '\n')
print('\n'.join(f'{q}: {len(SPECS[q[3:]])} images, base {BASE[q[3:]]}' for q in queue))
print('total images', sum(len(SPECS[k]) for k in ORDER))
