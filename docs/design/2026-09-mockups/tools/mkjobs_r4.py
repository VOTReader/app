"""Round 4: Codex polish of the dense screens, driven by the accurate HTML renders.

Image 1 = approved Vesper Home (style anchor). Image 2 = the HTML render of the screen (exact content).
Codex redraws Image 2 as a polished product mockup without changing a word. One image per screen.
usage: python3 mkjobs_r4.py name1 name2 ...   (names = html/renders/<name>-dark.png)
"""
import json, os, sys
from dirs import FIDELITY

HTML = '../html/renders'
ANCHOR = 'out/r2-home/home-r2-refined.png'
PRE = ("Image 1 is the approved VOTReader design system ('Vesper', dark): its palette, typography (book serif for titles and reading, "
       "humanist sans for UI), filled surfaces, radii and single antique-gold accent. Image 2 is an ACCURATE HTML mockup of one screen, "
       "with the exact real content, labels, counts and structure.")
SPEC = ("Redraw Image 2 as a polished, high-fidelity Android phone screen mockup in Image 1's visual language. Keep EVERY element of Image 2: "
        "every label, title, count, date, chip, button and list row, with exactly the same wording and order, and the same layout skeleton. "
        "You may refine spacing, depth, typographic finesse, icon quality and small details of polish. Do not add any new text, rows, "
        "features or decorations; grey placeholder bars in Image 2 must stay placeholder bars. Portrait, flat front view, thin phone outline "
        "at most, no hands, no perspective. All text crisp and correctly spelled.")
names = sys.argv[1:]
queue = []
for n in names:
    src = os.path.join(HTML, f'{n}-dark.png')
    if not os.path.exists(src):
        print('skip (no render):', n); continue
    job = {'name': f'r4-{n}', 'refs': [ANCHOR, src], 'preamble': PRE,
           'images': [{'file': f'{n}-r4.png', 'prompt': SPEC + '\n' + FIDELITY}], 'max_primary': 95, 'max_weekly': 60}
    json.dump(job, open(f'jobs/r4-{n}.json', 'w'), indent=1); queue.append(job['name'])
open('queue_r4.txt', 'w').write('\n'.join(queue) + '\n')
print(len(queue), 'jobs')
