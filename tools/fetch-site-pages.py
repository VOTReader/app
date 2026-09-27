#!/usr/bin/env python3
"""
fetch-site-pages.py — snapshot thevolumesoftruth.com's page names for the copy link.

A passage copied from a letter ends with a link to that letter on the site
(src/utils/site-link.js, cp2). The site is a MediaWiki whose pages are named
by the letters' own titles, so the app ships no list of links: it builds the
address from the title. This snapshot is what proves those addresses are
real: src/utils/site-link.test.js resolves every letter, preface, Words To
Live By / Blessed entry, Letter Study and Answers source line against it, so
a title the site does not have fails the build instead of shipping a dead
link. It is a test fixture only: nothing here ships in the app.

It records:
  * pages      every article title (namespace 0, redirects excluded)
  * redirects  {from: to} for the wiki's redirects
  * sections   the section anchors of the one-page compilations (Words To
               Live By Part One / Part Two, The Blessed), the ids the app's
               "#Anchor" parts must name

Run it when the site gains letters, then commit tools/site-pages.json:
  py -3 tools/fetch-site-pages.py            # writes tools/site-pages.json
  options: --out FILE
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request

API = 'https://www.thevolumesoftruth.com/api.php'
UA = 'VOTReader fetch-site-pages/0.1 (+https://votreader.github.io/app/)'
COMPILATIONS = [
    'Words To Live By: Part One',
    'Words To Live By: Part Two',
    'The Blessed: More Declarations of Blessedness From The Lord, Our God and Savior',
]


def api(params, tries=5):
    params = dict(params, format='json', formatversion='2')
    url = API + '?' + urllib.parse.urlencode(params)
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.load(r)
            time.sleep(0.2)
            return data
        except OSError:
            if attempt == tries - 1:
                raise
            time.sleep(2 ** (attempt + 1))
    raise RuntimeError('unreachable')


def all_titles(filt):
    titles, cont = [], {}
    while True:
        d = api({'action': 'query', 'list': 'allpages', 'aplimit': '500', 'apnamespace': '0',
                 'apfilterredir': filt, **cont})
        titles += [p['title'] for p in d['query']['allpages']]
        if 'continue' not in d:
            return titles
        cont = {'apcontinue': d['continue']['apcontinue'], 'continue': d['continue']['continue']}


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--out', default=os.path.join(here, 'site-pages.json'))
    args = ap.parse_args()

    pages = sorted(all_titles('nonredirects'))
    redirect_titles = all_titles('redirects')
    redirects = {}
    for i in range(0, len(redirect_titles), 50):
        d = api({'action': 'query', 'titles': '|'.join(redirect_titles[i:i + 50]), 'redirects': '1'})
        for r in d.get('query', {}).get('redirects', []):
            redirects[r['from']] = r['to']
    sections = {}
    for page in COMPILATIONS:
        if page not in pages:
            sys.exit('fetch-site-pages: the site no longer has "%s"; update COMPILATIONS and site-link.js' % page)
        d = api({'action': 'parse', 'page': page, 'prop': 'sections'})
        sections[page] = [s['anchor'] for s in d['parse']['sections']]

    out = {
        'source': API,
        'note': 'Test fixture for src/utils/site-link.test.js; refresh with tools/fetch-site-pages.py.',
        'pages': pages,
        'redirects': dict(sorted(redirects.items())),
        'sections': sections,
    }
    with open(args.out, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('fetch-site-pages: %d pages, %d redirects, %s -> %s' % (
        len(pages), len(redirects), ', '.join('%d anchors' % len(v) for v in sections.values()), args.out))


if __name__ == '__main__':
    main()
