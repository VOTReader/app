#!/usr/bin/env python3
"""Per-area contact sheets for the repo: the dark render of every screen in an area, small, labelled.
Reads the manifest the Atlas build embeds in index.html. Output: sheets/<area>.webp + sheets/index.json."""
import json, os, re
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REND = os.path.join(os.path.dirname(HERE), 'html', 'renders')
OUT = os.path.join(HERE, 'sheets'); os.makedirs(OUT, exist_ok=True)
COL, GAP, PAD, LABEL = 240, 14, 16, 34
BG, INK, MUTED = (18, 17, 16), (236, 231, 221), (150, 143, 132)
F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
FB = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 13)

html = open(os.path.join(HERE, 'index.html')).read()
m = re.search(r'<script id="manifest" type="application/json">(.*?)</script>', html, re.S)
manifest = json.loads(m.group(1).replace('<\\/', '</'))
index = []
for a in manifest['areas']:
    tiles = []
    for s in a['screens']:
        p = os.path.join(REND, s['name'] + '-dark.png')
        if not os.path.exists(p):
            p = os.path.join(REND, s['name'] + '-light.png')
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGB')
        span = 2 if im.width > im.height else 1
        w = COL * span + GAP * (span - 1)
        h = round(im.height * w / im.width)
        if span == 1 and h > 3 * 532:  # very tall pages: keep the top of the page
            im = im.crop((0, 0, im.width, round(im.width * 3 * 532 / COL)))
            h = 3 * 532
        tiles.append((s, im.resize((w, h), Image.LANCZOS), span))
    if not tiles:
        continue
    cols = 4
    # simple row flow: fill rows left to right, a landscape tile takes two columns
    rows, row, used = [], [], 0
    for t in tiles:
        if used + t[2] > cols:
            rows.append(row); row, used = [], 0
        row.append(t); used += t[2]
    if row:
        rows.append(row)
    W = PAD * 2 + cols * COL + (cols - 1) * GAP
    H = PAD + sum(max(t[1].height for t in r) + LABEL + GAP for r in rows) + PAD
    sheet = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(sheet); y = PAD
    for r in rows:
        x = PAD
        for s, im, span in r:
            title = s['title'] if len(s['title']) <= 38 * span else s['title'][:38 * span - 1] + '…'
            d.text((x, y), title, fill=INK, font=FB)
            d.text((x, y + 16), s['name'], fill=MUTED, font=F)
            sheet.paste(im, (x, y + LABEL)); x += im.width + GAP
        y += max(t[1].height for t in r) + LABEL + GAP
    dst = os.path.join(OUT, a['key'] + '.webp')
    sheet.save(dst, 'WEBP', quality=72, method=6)
    index.append({'key': a['key'], 'title': a['title'], 'blurb': a['blurb'], 'count': len(tiles),
                  'screens': [{'name': s['name'], 'title': s['title'], 'note': s.get('note', '')} for s, _i, _sp in tiles],
                  'sheet': 'sheets/' + a['key'] + '.webp', 'bytes': os.path.getsize(dst)})
json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), indent=1, ensure_ascii=False)
print(len(index), 'sheets,', round(sum(i['bytes'] for i in index) / 1e6, 1), 'MB,', sum(i['count'] for i in index), 'screens')
