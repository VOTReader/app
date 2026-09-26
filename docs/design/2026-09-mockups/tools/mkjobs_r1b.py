import json
from dirs import COMMON, DIRS
from items import ITEMS, SHEET, LANDSCAPE_PHONE
PAIR = ("Render TWO phone screens side by side on one landscape canvas (1536x1024 style), both flat front views with very thin phone outlines, "
        "equal size, on a quiet neutral backdrop; each screen full-bleed and legible; correctly spelled text. Professional product-design presentation quality.")
LIMITS = {'max_primary': 60, 'max_weekly': 15}
def job(name, refs, images):
    j = {'name': name, 'refs': ['../shots/' + r for r in refs], 'images': images}; j.update(LIMITS)
    json.dump(j, open(f'jobs/{name}.json', 'w'), indent=1); return name
order = []
for key in ['letter', 'bible', 'player', 'web', 'sheet', 'appicon', 'icons', 'implements', 'components']:
    it = ITEMS[key]
    frame = {'screen': COMMON, 'landscape': LANDSCAPE_PHONE, 'sheet': SHEET}[it['kind']]
    order.append(job(f'r1-{key}', it['refs'], [{'file': f'{key}-{d}.png', 'prompt': f"{it['spec']}\n{txt}\n{frame}"} for d, txt in DIRS.items()]))
for a, b in [('search', 'library'), ('settings', 'volumes'), ('onboarding', 'songs')]:
    A, B = ITEMS[a], ITEMS[b]
    images = [{'file': f'{a}+{b}-{d}.png', 'prompt': f"LEFT PHONE - {A['spec']}\n\nRIGHT PHONE - {B['spec']}\n\nBoth screens share one design language: {txt}\n{PAIR}\n{COMMON}"} for d, txt in DIRS.items()]
    order.append(job(f'r1-{a}+{b}', A['refs'] + B['refs'], images))
open('queue_r1.txt', 'w').write('\n'.join(order) + '\n')
print('\n'.join(order))
