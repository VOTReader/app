#!/usr/bin/env python3
"""Copy the HTML kit and screens into the repo pack with repo-relative paths (no duplicated fonts or data).

usage: python3 sync_html.py [--all | name ...]
  no args  -> kit + the unprefixed screens (the finished first passes)
  --all    -> kit + every screen and its side files (css/js)
  names    -> kit + just those screens (e.g. sx-slash lk-verse-picker)
Reports any reference that would not resolve inside the repo.
"""
import glob, os, re, shutil, sys

MOCK = os.path.dirname(os.path.abspath(__file__))
HSRC = os.path.join(os.path.dirname(MOCK), 'html')
DEST = '/home/user/app/docs/design/2026-09-mockups/html'
ROOT = '../../../../../'  # html/kit and html/screens -> repo root
FONT_TOP = {'eb-garamond-latin-wght-normal.woff2', 'eb-garamond-latin-wght-italic.woff2'}


def font_url(f):
    return f"{ROOT}app/src/main/assets/fonts/{'' if f in FONT_TOP else 'reading/'}{f}"


APP_FONTS = {}  # md5 of each app font file -> repo-relative url, so embedded copies become references
import base64, hashlib
for sub in ('', 'reading/'):
    d = '/home/user/app/app/src/main/assets/fonts/' + sub
    for f in os.listdir(d):
        if f.endswith('.woff2'):
            APP_FONTS[hashlib.md5(open(d + f, 'rb').read()).hexdigest()] = f"{ROOT}app/src/main/assets/fonts/{sub}{f}"


def unembed(m):
    h = hashlib.md5(base64.b64decode(m.group(1))).hexdigest()
    return f"url('{APP_FONTS[h]}') format('woff2')" if h in APP_FONTS else m.group(0)


def rewrite(text):
    text = re.sub(r"url\((['\"]?)(?:\.\./kit/)?fonts/([^'\")]+)\1\)", lambda m: f"url('{font_url(m.group(2))}')", text)
    text = re.sub(r"url\(data:font/woff2;base64,([A-Za-z0-9+/=]+)\)", unembed, text)
    text = text.replace('../kit/data/scripture-web-data.js', ROOT + 'app/src/main/assets/src/data/scripture-web-data.js')
    text = text.replace('base64-packed for the Reading Font picker board', 'referenced from the app\'s own files for the Reading Font picker board')
    text = text.replace('../kit/data/decode.js', ROOT + 'app/src/main/assets/src/utils/scripture-web/decode.js')
    return text


os.makedirs(os.path.join(DEST, 'kit', 'data'), exist_ok=True)
os.makedirs(os.path.join(DEST, 'screens'), exist_ok=True)
open(os.path.join(DEST, 'kit', 'kit.css'), 'w').write(rewrite(open(os.path.join(HSRC, 'kit', 'kit.css')).read()))
for f in ('kit.js', 'icons.svg'):
    shutil.copy(os.path.join(HSRC, 'kit', f), os.path.join(DEST, 'kit', f))
wd = open(os.path.join(HSRC, 'kit', 'data', 'web-draw.js')).read().replace(
    "from './decode.js'", "from '../../../../../../app/src/main/assets/src/utils/scripture-web/decode.js'")
open(os.path.join(DEST, 'kit', 'data', 'web-draw.js'), 'w').write(wd)
r = open(os.path.join(HSRC, 'render.mjs')).read().replace(
    "`http://127.0.0.1:8095/screens/${n}.html?theme=${t}`",
    "`http://127.0.0.1:8095/docs/design/2026-09-mockups/html/screens/${n}.html?theme=${t}`")
open(os.path.join(DEST, 'render.mjs'), 'w').write(r)
for f in ('KIT.md', 'FULLAPP.md'):  # the agents' briefs, with machine paths made repo-relative
    if os.path.exists(os.path.join(HSRC, f)):
        t = open(os.path.join(HSRC, f)).read().replace(HSRC, 'docs/design/2026-09-mockups/html').replace('/home/user/app/', '')
        open(os.path.join(DEST, f), 'w').write(t)

args = sys.argv[1:]
files = sorted(glob.glob(os.path.join(HSRC, 'screens', '*')))
if not args:
    files = [f for f in files if not re.match(r'^[a-z]{2}-', os.path.basename(f)) and not os.path.basename(f).startswith('_')]
elif args != ['--all']:
    files = [f for f in files if os.path.splitext(os.path.basename(f))[0] in args or any(os.path.basename(f).startswith(a + '-') and not f.endswith('.html') for a in args)]
files = [f for f in files if os.path.isfile(f) and not os.path.basename(f).startswith('_')]
bad = []
for f in files:
    name = os.path.basename(f)
    if f.endswith(('.html', '.css', '.js', '.mjs', '.json', '.svg')):
        t = rewrite(open(f).read())
        open(os.path.join(DEST, 'screens', name), 'w').write(t)
        for ref in re.findall(r"""(?:src|href)=["']([^"'#]+)["']|url\(['"]?([^'")]+)['"]?\)|from\s+['"]([^'"]+)['"]|import\(['"]([^'"]+)['"]\)""", t):
            ref = next(x for x in ref if x)
            if ref.startswith(('data:', 'http://www.w3.org', 'https://fonts.')) or ref.startswith('#'):
                continue
            if ref.startswith(('http://', 'https://', '/')):
                bad.append((name, ref)); continue
            if not os.path.exists(os.path.normpath(os.path.join(DEST, 'screens', ref))):
                bad.append((name, ref))
    else:
        shutil.copy(f, os.path.join(DEST, 'screens', name))
print(f'synced kit + {len(files)} screen files')
for n, ref in bad:
    print('UNRESOLVED', n, ref)
