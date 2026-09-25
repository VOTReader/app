#!/usr/bin/env python3
"""Assemble the committed design pack: docs/design/2026-09-mockups/ in the repo.

WebP images at review size (full-resolution copies live in the gallery artifact),
the exact Codex job specs, the runner/tooling, and a README with every item inline.
"""
import json, os, shutil, glob
from PIL import Image

MOCK = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(os.path.dirname(MOCK), 'shots')
DEST = '/home/user/app/docs/design/2026-09-mockups'
IMG = os.path.join(DEST, 'img')
for d in (IMG, os.path.join(DEST, 'prompts'), os.path.join(DEST, 'tools')):
    os.makedirs(d, exist_ok=True)


def webp(src, name, portrait):
    im = Image.open(src).convert('RGB')
    max_w = 520 if portrait else 1100
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    out = os.path.join(IMG, name + '.webp')
    im.save(out, 'WEBP', quality=78, method=6)
    return 'img/' + name + '.webp'


made = set()
_webp = webp


def webp(src, name, portrait):  # remember every image this run writes, so stale ones can be pruned
    out = _webp(src, name, portrait); made.add(os.path.basename(out)); return out


cfg = json.load(open(os.path.join(MOCK, 'gallery', 'rounds.json')))
sections = []
for it in cfg['items']:
    portrait = it['shape'] == 'portrait'
    cur = []
    for c in it.get('current', []):
        src = c if os.path.isabs(c) else os.path.join(SHOTS, c)
        if os.path.exists(src):
            cur.append(webp(src, 'current-' + it['key'].replace('+', '-') + '-' + os.path.splitext(os.path.basename(c))[0], portrait))
    rounds = []
    for rd in it['rounds']:
        cells = []
        for im in rd['images']:
            src = os.path.join(MOCK, 'out', im.get('job', rd['job']), im['file'])
            if os.path.exists(src):
                name = it['key'].replace('+', '-') + '-' + rd['id'] + '-' + im['id']
                cells.append((im['label'], webp(src, name, portrait), im.get('why', '')))
        if cells:
            rounds.append((rd['title'], cells))
    sections.append((it, cur, rounds))

for f in glob.glob(os.path.join(IMG, '*.webp')):  # prune images no round produces any more
    if os.path.basename(f) not in made:
        os.remove(f); print('pruned', os.path.basename(f))

# prompts + tools
for j in glob.glob(os.path.join(MOCK, 'jobs', '*.json')):
    shutil.copy(j, os.path.join(DEST, 'prompts'))
for t in ['cxgen.py', 'runqueue.sh', 'board.py', 'dirs.py', 'items.py', 'texts.py', 'mkjobs_r1b.py', 'mkjobs_r2.py', 'mkjobs_r4.py',
          'vesper-preview.css', 'pack.py', 'sync_html.py', 'pack_fullapp.py']:
    shutil.copy(os.path.join(MOCK, t), os.path.join(DEST, 'tools'))
os.makedirs(os.path.join(DEST, 'tools', 'atlas'), exist_ok=True)
for t in ['build_atlas.py', 'areas.py', 'build_sheets.py', 'template.html', 'titles.json']:
    shutil.copy(os.path.join(os.path.dirname(MOCK), 'atlas', t), os.path.join(DEST, 'tools', 'atlas'))
shutil.copy(os.path.join(MOCK, 'usage.log'), os.path.join(DEST, 'tools', 'codex-usage.log'))

# README: the hand-written intro + every item inline
intro = open(os.path.join(MOCK, 'README.md')).read().rstrip() + '\n'
md = [intro, '\n## Every item\n']
for it, cur, rounds in sections:
    md.append(f"\n### {it['title']}\n\n{it['blurb']}\n")
    width = 180 if it['shape'] == 'portrait' else 420
    if cur:
        md.append('\n**Today:** ' + ' '.join(f'<img src="{p}" width="{width}" alt="Current {it["title"]}">' for p in cur) + '\n')
    for title, cells in rounds:
        md.append(f'\n**{title}**\n\n<table><tr>' + ''.join(
            f'<td valign="top"><img src="{p}" width="{width}" alt="{lbl}"><br><sub>{lbl}' + (f'<br><i>{why}</i>' if why else '') + '</sub></td>'
            for lbl, p, why in cells) + '</tr></table>\n')
open(os.path.join(DEST, 'README.md'), 'w').write(''.join(md))
total = sum(os.path.getsize(f) for f in glob.glob(os.path.join(IMG, '*.webp')))
print(f'pack: {len(glob.glob(os.path.join(IMG, "*.webp")))} images, {total/1e6:.1f} MB, README {os.path.getsize(os.path.join(DEST, "README.md"))} bytes')

# The HTML kit and every screen are synced by sync_html.py (run from pack_fullapp.py).
