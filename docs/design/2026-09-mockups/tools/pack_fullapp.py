#!/usr/bin/env python3
"""The full-app pass, committed: every screen source, the kit, per-area contact sheets, FULL-APP.md,
FINDINGS.md and INVENTORY.md under docs/design/2026-09-mockups/. Run after the Atlas and its sheets are built."""
import glob, json, os, shutil, subprocess

MOCK = os.path.dirname(os.path.abspath(__file__))
SCR = os.path.dirname(MOCK)
ATLAS = os.path.join(SCR, 'atlas')
DEST = '/home/user/app/docs/design/2026-09-mockups'
ATLAS_URL = 'https://claude.ai/artifact/DnJDEpcqD2hExSDcfy3X6p'

subprocess.run(['python3', os.path.join(MOCK, 'sync_html.py'), '--all'], check=True)

# contact sheets
os.makedirs(os.path.join(DEST, 'atlas'), exist_ok=True)
for f in glob.glob(os.path.join(DEST, 'atlas', '*.webp')):
    os.remove(f)
index = json.load(open(os.path.join(ATLAS, 'sheets', 'index.json')))
for a in index:
    shutil.copy(os.path.join(ATLAS, a['sheet']), os.path.join(DEST, 'atlas', a['key'] + '.webp'))

# FINDINGS.md and INVENTORY.md (repo-relative paths)
shutil.copy(os.path.join(SCR, 'notes', 'findings.md'), os.path.join(DEST, 'FINDINGS.md'))
inv = open(os.path.join(SCR, 'notes', 'inventory.md')).read().replace('/home/user/app/', '')
open(os.path.join(DEST, 'INVENTORY.md'), 'w').write(inv)

total = sum(a['count'] for a in index)
md = [f"""# The full app, every surface (HTML, 2026-09)

Every screen, sheet, popover, toast and state of VOTReader, redrawn in the Vesper (dark) and Vellum (light)
system: **{total} renders across {len(index)} areas**, each in both themes unless it is dark by design. The pass
worked from [INVENTORY.md](INVENTORY.md), a sweep of the source that lists 318 surfaces with their real copy and
source paths. Each area was drawn from its source files, and the text is verbatim from the corpus. While reading the
source, the pass also found fifty problems in the running app; they are listed in [FINDINGS.md](FINDINGS.md).

- **Browse it large, dark and light side by side, with comments:** [VOTReader Atlas]({ATLAS_URL}) (private artifact).
- **Sources:** `html/screens/<name>.html` on the kit in `html/kit/`. `html/KIT.md` and `html/FULLAPP.md` are the briefs
  every screen was drawn to.
- **Render one:** serve the repo root on loopback (`python3 -m http.server 8095 --bind 127.0.0.1`), then run
  `node render.mjs <name>` from `html/`. It writes `html/renders/<name>-dark.png` and `-light.png`. You need Playwright
  and Chromium; `render.mjs` imports a global Playwright, so adjust that path to your install. The fonts and the
  Scripture Web data come from the app's own files, so nothing is duplicated.

## The system in one screen of rules

- **Vesper:** true black, filled charcoal surfaces, warm ivory text, and one antique-gold accent. **Vellum:** warm
  paper, ink and one oxblood accent. Both themes render from the same HTML through tokens.
- **Type:** EB Garamond for titles and reading, Atkinson Hyperlegible for every control. Digits come from the bundled
  Lexend, because Atkinson's slashed zero reads as a typo in times and counts.
- **Ten mark colours**, as in the app. The kit's calm six gain red, teal, brown and gray, chosen so that every pair of
  washes stays at least ΔE 6.5 apart in both themes and text on any wash stays at 9.5:1 or better.
- **Warn and danger:** `--warn` (amber) marks a recoverable clear; `--danger` (a muted rose) marks anything that
  deletes or overwrites the reader's own data. Both are tinted, never solid, and their labels lead with the verb.
- **Immersive views stay dark in both themes**, as the app does. The Scripture Web's canvas is black by construction,
  and the Garden's photographs read truest on black.
- **Listen lives in the hero** as the Listen pill. Once the hero scrolls away, it may collapse into the top bar as a
  headphones button.
- **One primary control per top bar:** Bookmark on reading pages, the Reading Position Marker on browse pages.
- **Healthy by default:** no streak pressure (the proposal drops the two streak cells and categories), no invented
  features, and a calm, consistent confirm language (see `annotation` › Confirms).

## Concepts

Two boards go beyond what the app does today and are labelled as concepts: a home-screen widget, and a
Scripture Web layer for the 51 messianic prophecy pairs that already ship in `scripture-web-data.js` but are
never drawn.

## Every area
"""]
for a in index:
    md.append(f"\n### {a['title']} · {a['count']}\n\n{a['blurb']}\n\n<img src=\"atlas/{a['key']}.webp\" alt=\"{a['title']}: every screen, dark theme\">\n\n")
    md.append('<details><summary>What each render shows</summary>\n\n' + '\n'.join(
        f"- **{s['title']}** (`{s['name']}`)" + (f": {s['note']}" if s['note'] else '') for s in a['screens']) + '\n\n</details>\n')
open(os.path.join(DEST, 'FULL-APP.md'), 'w').write(''.join(md))
size = sum(os.path.getsize(f) for f in glob.glob(os.path.join(DEST, 'atlas', '*.webp')))
print(f'full-app pack: {len(index)} sheets ({size / 1e6:.1f} MB), {total} renders, '
      f"{len(glob.glob(os.path.join(DEST, 'html', 'screens', '*.html')))} screen sources")
