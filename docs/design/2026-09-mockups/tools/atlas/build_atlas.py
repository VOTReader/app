#!/usr/bin/env python3
"""Build the VOTReader Atlas: every rendered surface, filed by area, dark and light together.

Areas and their name patterns: areas.py. Titles and notes: titles.json {name: {title, note, source}}.
Renders: ../html/renders/<name>-dark.png / -light.png (either may be missing).
Portrait screens sit side by side; boards and landscape pages stack dark over light.
Output: index.html + img/<name>.webp + files.json. Prints anything unsorted or untitled.
"""
import fnmatch, glob, json, os, sys, time
from PIL import Image
from areas import AREAS

HERE = os.path.dirname(os.path.abspath(__file__))
REND = os.path.join(os.path.dirname(HERE), 'html', 'renders')
IMG = os.path.join(HERE, 'img'); os.makedirs(IMG, exist_ok=True)
GAP, BG = 16, (18, 17, 16)
SKIP = set(sys.argv[1:])  # names to leave out, if any


def composite(name):
    paths = [os.path.join(REND, f'{name}-{t}.png') for t in ('dark', 'light')]
    ims = [Image.open(p).convert('RGB') for p in paths if os.path.exists(p)]
    if not ims:
        return None
    dst = os.path.join(IMG, name + '.webp')
    src_m = max(os.path.getmtime(p) for p in paths if os.path.exists(p))
    landscape = ims[0].width > ims[0].height
    if landscape:  # stack vertically at a common width
        w = max(i.width for i in ims)
        ims = [i.resize((w, round(i.height * w / i.width)), Image.LANCZOS) if i.width != w else i for i in ims]
        out = Image.new('RGB', (w, sum(i.height for i in ims) + GAP * (len(ims) - 1)), BG); y = 0
        for i in ims:
            out.paste(i, (0, y)); y += i.height + GAP
        cap = 1600
    else:  # side by side at a common height
        h = max(i.height for i in ims)
        ims = [i.resize((round(i.width * h / i.height), h), Image.LANCZOS) if i.height != h else i for i in ims]
        out = Image.new('RGB', (sum(i.width for i in ims) + GAP * (len(ims) - 1), h), BG); x = 0
        for i in ims:
            out.paste(i, (x, 0)); x += i.width + GAP
        cap = 1100
    if out.width > cap:
        out = out.resize((cap, round(out.height * cap / out.width)), Image.LANCZOS)
    if not (os.path.exists(dst) and os.path.getmtime(dst) > src_m):
        out.save(dst, 'WEBP', quality=80, method=5)
    return {'src': 'img/' + name + '.webp', 'w': out.width, 'h': out.height, 'pair': len(ims) == 2, 'wide': landscape}


def humanize(name):
    base = name.split('-', 1)[1] if name[:3].endswith('-') and len(name.split('-')[0]) == 2 else name
    return base.replace('-', ' ').capitalize()


names = sorted({os.path.basename(p).rsplit('-', 1)[0] for p in glob.glob(os.path.join(REND, '*-dark.png')) + glob.glob(os.path.join(REND, '*-light.png'))} - SKIP)
titles = json.load(open(os.path.join(HERE, 'titles.json'))) if os.path.exists(os.path.join(HERE, 'titles.json')) else {}
placed, buckets = set(), {a[0]: [] for a in AREAS}
for key, _t, _b, pats in AREAS:
    for n in names:
        if n in placed:
            continue
        for i, p in enumerate(pats):
            if fnmatch.fnmatchcase(n, p):
                buckets[key].append((i, n)); placed.add(n); break
unsorted = [n for n in names if n not in placed]
areas, total, untitled = [], 0, []
for key, title, blurb, _p in AREAS + ([('unsorted', 'Unsorted', 'Renders not yet filed.', [])] if unsorted else []):
    rows = sorted(buckets.get(key, [])) if key != 'unsorted' else [(0, n) for n in unsorted]
    screens = []
    for _i, n in rows:
        c = composite(n)
        if not c:
            continue
        meta = titles.get(n) or {}
        if not meta.get('title'):
            untitled.append(n)
        screens.append({'name': n, 'title': meta.get('title') or humanize(n), 'note': meta.get('note', ''), 'source': meta.get('source', ''), **c})
    total += len(screens)
    areas.append({'key': key, 'title': title, 'blurb': blurb, 'screens': screens})
manifest = {'areas': areas, 'n': total, 'built': time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}
tpl = open(os.path.join(HERE, 'template.html')).read()
open(os.path.join(HERE, 'index.html'), 'w').write(tpl.replace('/*MANIFEST*/', json.dumps(manifest, ensure_ascii=False).replace('</', '<\\/')))
files = [s['src'] for a in areas for s in a['screens']]
json.dump(files, open(os.path.join(HERE, 'files.json'), 'w'))
size = sum(os.path.getsize(os.path.join(HERE, f)) for f in files) + os.path.getsize(os.path.join(HERE, 'index.html'))
print(f'atlas: {len([a for a in areas if a["screens"]])} areas, {total} screens, {len(files) + 1} files, {size / 1e6:.1f} MB')
for a in areas:
    print(f'  {a["key"]:12s} {len(a["screens"]):3d}  ' + ' '.join(s['name'] for s in a['screens']))
if unsorted:
    print('UNSORTED:', ' '.join(unsorted))
if untitled:
    print('UNTITLED:', len(untitled), ' '.join(untitled))
