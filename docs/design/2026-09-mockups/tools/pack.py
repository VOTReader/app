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
            src = os.path.join(MOCK, 'out', rd['job'], im['file'])
            if os.path.exists(src):
                name = it['key'].replace('+', '-') + '-' + rd['id'] + '-' + im['id']
                cells.append((im['label'], webp(src, name, portrait), im.get('why', '')))
        if cells:
            rounds.append((rd['title'], cells))
    sections.append((it, cur, rounds))

# prompts + tools
for j in glob.glob(os.path.join(MOCK, 'jobs', '*.json')):
    shutil.copy(j, os.path.join(DEST, 'prompts'))
for t in ['cxgen.py', 'runqueue.sh', 'board.py', 'dirs.py', 'items.py', 'texts.py', 'mkjobs_r1b.py', 'mkjobs_r2.py', 'vesper-preview.css', 'pack.py']:
    shutil.copy(os.path.join(MOCK, t), os.path.join(DEST, 'tools'))
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

# ---- HTML kit: committed with repo-relative fonts/data (no duplicated binaries) ----
HSRC = os.path.join(os.path.dirname(MOCK), 'html')
HDST = os.path.join(DEST, 'html')
for sub in ('kit/data', 'screens'):
    os.makedirs(os.path.join(HDST, sub), exist_ok=True)
css = open(os.path.join(HSRC, 'kit', 'kit.css')).read()
ROOT_FROM_KIT = '../../../../../'          # docs/design/2026-09-mockups/html/kit -> repo root
fontmap = {'eb-garamond-latin-wght-normal.woff2': 'fonts/', 'eb-garamond-latin-wght-italic.woff2': 'fonts/'}
import re
def fontpath(m):
    f = m.group(1)
    sub = fontmap.get(f, 'fonts/reading/')
    return f"url('{ROOT_FROM_KIT}app/src/main/assets/{sub}{f}')"
css = re.sub(r"url\('fonts/([^']+)'\)", fontpath, css)
open(os.path.join(HDST, 'kit', 'kit.css'), 'w').write(css)
for f in ('kit.js', 'icons.svg'):
    shutil.copy(os.path.join(HSRC, 'kit', f), os.path.join(HDST, 'kit', f))
wd = open(os.path.join(HSRC, 'kit', 'data', 'web-draw.js')).read().replace(
    "from './decode.js'", "from '../../../../../../app/src/main/assets/src/utils/scripture-web/decode.js'")
open(os.path.join(HDST, 'kit', 'data', 'web-draw.js'), 'w').write(wd)
for f in glob.glob(os.path.join(HSRC, 'screens', '*.html')):
    s = open(f).read().replace('../kit/data/scripture-web-data.js', '../../../../../app/src/main/assets/src/data/scripture-web-data.js')
    open(os.path.join(HDST, 'screens', os.path.basename(f)), 'w').write(s)
r = open(os.path.join(HSRC, 'render.mjs')).read().replace(
    "`http://127.0.0.1:8095/screens/${n}.html?theme=${t}`",
    "`http://127.0.0.1:8095/docs/design/2026-09-mockups/html/screens/${n}.html?theme=${t}`")
open(os.path.join(HDST, 'render.mjs'), 'w').write(r)
shutil.copy(os.path.join(HSRC, 'KIT.md'), os.path.join(HDST, 'KIT.md'))
print('html kit:', len(glob.glob(os.path.join(HDST, 'screens', '*.html'))), 'screens')
