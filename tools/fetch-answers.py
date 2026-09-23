#!/usr/bin/env python3
"""
fetch-answers.py — vendor answersonlygodcangive.com into src/data/answers.js.

The site is a MediaWiki whose pages are compilations of excerpts from the
letters the app already carries. Each page becomes ONE Format B entry
(`paragraphs: [{align, text}]`, the WTLB / Holy Days shape):

  * `==Heading==`            -> a centered **bold** paragraph (generic
                                "Section One" headings are dropped)
  * `----`                   -> a centered ornament paragraph (excerpt divider)
  * <p style="text-align">   -> a paragraph with that align; <br/> -> "\\n"
  * <strong>/<b>, <em>/<i>   -> **bold** / _italic_ (balanced per line)
  * scripture links          -> {{ref:Book C:V}} markers (biblegateway,
                                biblestudytools, bit.ly -> resolved)
  * "From: [letter]" lines   -> `~ [From "Title" ~ Collection]`, the
                                attribution the reader taps through to the
                                in-app letter (matched by the site's URL slug
                                against the app's own titles)
  * ==Related Topics==       -> entry.related = [{id, title}]

It also writes src/utils/answers-url-index.js: ANSWERS_URL_INDEX maps every
site URL (real titles AND the wiki's redirects) to an entry id, and
ANSWERS_TITLES every id to its title, so a letter's `relatedTopics` row can
open in-app before the corpus itself is fetched.

Usage:
  py -3 tools/fetch-answers.py --cache DIR            # convert from cache
  py -3 tools/fetch-answers.py --cache DIR --fetch    # (re)fill the cache first
  options: --out FILE (default src/data/answers.js), --limit N, --repo DIR
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser

SITE = 'https://answersonlygodcangive.com'
API = SITE + '/api.php'
UA = 'VOTReader fetch-answers/0.1 (+https://votreader.github.io/app/)'
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
COLLECTION_LABEL = 'Answers Only God Can Give'

# ─── Scripture reference canonicalisation ──────────────────────────────
BOOKS = [
    'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
    '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
    'Nehemiah', 'Esther', 'Job', 'Psalm', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
    'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
    'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah',
    'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians',
    '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians',
    '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon',
    'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude',
    'Revelation',
]
BOOK_BY_KEY = {re.sub(r'[^a-z0-9]', '', b.lower()): b for b in BOOKS}
BOOK_BY_KEY.update({
    'psalms': 'Psalm', 'songofsongs': 'Song of Solomon', 'canticles': 'Song of Solomon',
    'revelations': 'Revelation', 'ezekial': 'Ezekiel', 'philipians': 'Philippians',
    'isamuel': '1 Samuel', 'iisamuel': '2 Samuel', 'ikings': '1 Kings', 'iikings': '2 Kings',
})
ROMAN = {'i': '1', 'ii': '2', 'iii': '3'}


def canon_refs(s):
    """'2 Kings 19:28' / 'psalms 91' / 'John 3:16-18' / 'John 3:16,18' -> ['2 Kings 19:28', ...]."""
    s = html.unescape(s).replace('\xa0', ' ').replace('–', '-').replace('—', '-').replace('+', ' ')
    s = re.sub(r'[\\\s]+$', '', s).strip()
    s = re.sub(r'^([1-3])-(?=[A-Za-z])', r'\1 ', s)              # 1-corinthians -> 1 corinthians
    s = re.sub(r'(?<=[A-Za-z])-(?=[A-Za-z])', ' ', s)            # song-of-solomon -> song of solomon
    m = re.match(r'^((?:[1-3]|i{1,3})?\s*[A-Za-z][A-Za-z .]*?)\s*(\d+)(?:\s*[:.]\s*(\d[\d\s,;-]*))?\s*$', s, re.I)
    if not m:
        return []
    bk = m.group(1).strip().lower()
    mr = re.match(r'^(i{1,3})\s+(.*)$', bk)
    if mr:
        bk = ROMAN[mr.group(1)] + ' ' + mr.group(2)
    book = BOOK_BY_KEY.get(re.sub(r'[^a-z0-9]', '', bk))
    if not book:
        return []
    ch = m.group(2)
    vv = (m.group(3) or '').replace(' ', '')
    if not vv:
        return [f'{book} {ch}']
    out = []
    for part in re.split(r'[,;]', vv):
        part = part.strip('-')
        if not part:
            continue
        out.append(f'{book} {ch}:{part}')
    return out


def split_query_refs(q):
    """'2 Kings 19:28,Isaiah 37:29' / 'john 1:1; john 1:14' / 'John 3:16,18' -> canonical refs."""
    refs, book, last_ch = [], None, None
    for part in re.split(r'\s*[;,]\s*', q):
        part = part.strip()
        if not part:
            continue
        if re.match(r'^\d', part) and book and not re.match(r'^[1-3]\s*[A-Za-z]', part):
            # "3:16" or "18" after a book — inherit the book (and chapter if no colon)
            if ':' in part:
                part = f'{book} {part}'
            else:
                part = f'{book} {last_ch}:{part}' if last_ch else f'{book} {part}'
        got = canon_refs(part)
        if got:
            refs.extend(got)
            mm = re.match(r'^(.*?)\s+(\d+)(?::|$)', got[-1])
            book, last_ch = (mm.group(1), mm.group(2)) if mm else (None, None)
    return refs


def refs_from_url(url, bitly):
    url = bitly.get(url, url)
    try:
        u = urllib.parse.urlsplit(url)
    except ValueError:
        return []
    host = u.netloc.lower()
    segs = [x for x in u.path.split('/') if x]
    if 'biblegateway.com' in host:
        if len(segs) >= 3 and segs[0] == 'verse':          # /verse/en/Matthew%207:27
            return canon_refs(urllib.parse.unquote(segs[2]))
        q = urllib.parse.parse_qs(u.query).get('search', [''])[0]
        return split_query_refs(q)
    if 'biblestudytools.com' in host:
        if 'passage' in segs:
            q = urllib.parse.parse_qs(u.query).get('q', [''])[0]
            return split_query_refs(q)
        if len(segs) >= 2:
            last, bookslug = segs[-1], segs[-2]
            mm = re.match(r'^(\d+)(?:-(\d+))?(?:-(\d+))?(?:-compare)?\.html?$', last)
            if mm:
                ch, v1, v2 = mm.group(1), mm.group(2), mm.group(3)
                ref = f'{bookslug.replace("-", " ")} {ch}'
                if v1:
                    ref += f':{v1}' + (f'-{v2}' if v2 else '')
                return canon_refs(ref)
            # /nkjv/genesis/2.html style handled above; /genesis/ alone -> whole book, skip
        return []
    return []


def is_scripture_host(url, bitly):
    url = bitly.get(url, url)
    u = urllib.parse.urlsplit(url)
    h = u.netloc.lower()
    if '/search/' in u.path or 'quicksearch' in u.path:
        return False  # a Bible-site keyword search is not a citation
    return 'biblegateway.com' in h or 'biblestudytools.com' in h


# ─── Wiki API / cache ───────────────────────────────────────────────────
def api(params):
    params = dict(params, format='json', formatversion='2')
    url = API + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def fill_cache(cache):
    os.makedirs(os.path.join(cache, 'wikitext'), exist_ok=True)
    jdump(os.path.join(cache, 'allpages-nonredir.json'),
          api({'action': 'query', 'list': 'allpages', 'aplimit': '500', 'apnamespace': '0', 'apfilterredir': 'nonredirects'}))
    redir = api({'action': 'query', 'list': 'allpages', 'aplimit': '500', 'apnamespace': '0', 'apfilterredir': 'redirects'})
    jdump(os.path.join(cache, 'allpages-redir.json'), redir)
    titles = [p['title'] for p in redir['query']['allpages']]
    pairs = {}
    for i in range(0, len(titles), 50):
        d = api({'action': 'query', 'titles': '|'.join(titles[i:i + 50]), 'redirects': '1'})
        for r in d.get('query', {}).get('redirects', []):
            pairs[r['from']] = r['to']
    jdump(os.path.join(cache, 'redirect-map.json'), pairs)
    jdump(os.path.join(cache, 'sidebar.json'), api({'action': 'parse', 'page': 'MediaWiki:Sidebar', 'prop': 'wikitext'}))
    pages = jload(os.path.join(cache, 'allpages-nonredir.json'))['query']['allpages']
    for p in pages:
        fn = os.path.join(cache, 'wikitext', urllib.parse.quote(p['title'], safe='') + '.json')
        if os.path.exists(fn):
            continue
        d = api({'action': 'parse', 'page': p['title'], 'prop': 'wikitext|sections|displaytitle'})
        jdump(fn, d['parse'])
        time.sleep(0.15)
    # bit.ly -> first redirect hop (HEAD is refused; GET the redirect only)
    bfile = os.path.join(cache, 'bitly-map.json')
    bitly = jload(bfile) if os.path.exists(bfile) else {}
    urls = set()
    for p in pages:
        w = jload(os.path.join(cache, 'wikitext', urllib.parse.quote(p['title'], safe='') + '.json'))['wikitext']
        urls.update(re.findall(r'https?://bit\.ly/[A-Za-z0-9]+', w))
    for u in sorted(urls):
        if u in bitly and not bitly[u].startswith('ERR'):
            continue
        r = subprocess.run(['curl', '-sS', '-o', os.devnull, '-w', '%{http_code}|%{redirect_url}', '-A', UA, '--max-time', '20', u],
                           capture_output=True, text=True)
        code, _, loc = r.stdout.strip().partition('|')
        bitly[u] = loc.strip() if code.startswith('30') and loc.strip() else 'ERR ' + code
        time.sleep(0.05)
    jdump(bfile, bitly)


def jload(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def jdump(p, obj):
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=0)


# ─── Wikitext -> HTML-ish ───────────────────────────────────────────────
H2_RE = re.compile(r'^==\s*([^=].*?)\s*==\s*$', re.M)


def split_sections(wikitext):
    """[(heading or None, body), ...] in document order."""
    out, pos, heading = [], 0, None
    for m in H2_RE.finditer(wikitext):
        out.append((heading, wikitext[pos:m.start()]))
        heading, pos = m.group(1).strip(), m.end()
    out.append((heading, wikitext[pos:]))
    return out


def wiki_to_html(body):
    body = re.sub(r'<!--.*?-->', '', body, flags=re.S)
    body = re.sub(r'__(?:FORCE|NO)?TOC__', '', body)
    body = re.sub(r'\[\[\s*(?:category|file|image)\s*:[^\]]*\]\]', '', body, flags=re.I)
    body = re.sub(r"<center><font size=\"2\">\s*Copyright.*?</font></center>", '', body, flags=re.S | re.I)
    body = re.sub(r"'''(.+?)'''", r'<b>\1</b>', body, flags=re.S)
    body = re.sub(r"''(.+?)''", r'<i>\1</i>', body, flags=re.S)
    # A run of 2+ apostrophes left over is an unclosed wiki bold/italic, which
    # MediaWiki closes at the line end and renders as nothing.
    body = re.sub(r"'{2,}", '', body)
    body = re.sub(r'\[\[([^\]|]+)\|([^\]]*)\]\]', lambda m: '<a href="wiki:%s">%s</a>' % (m.group(1).strip(), m.group(2)), body)
    body = re.sub(r'\[\[([^\]]+)\]\]', lambda m: '<a href="wiki:%s">%s</a>' % (m.group(1).strip(), m.group(1).strip()), body)
    body = re.sub(r'\[(https?://[^\s\]]+)\s+([^\]]*)\]', r'<a href="\1">\2</a>', body)
    body = re.sub(r'\[(https?://[^\s\]]+)\]', r'<a href="\1"></a>', body)
    body = re.sub(r'^-{4,}\s*$', '<hr>', body, flags=re.M)
    body = re.sub(r'^\*+\s*(.*)$', r'<li>\1</li>', body, flags=re.M)
    return body


class Block:
    __slots__ = ('kind', 'align', 'runs', 'implicit')

    def __init__(self, kind, align=None, implicit=False):
        self.kind, self.align, self.runs, self.implicit = kind, align, [], implicit

    def text(self):
        return ''.join(r[0] for r in self.runs)


BLOCK_TAGS = {'p', 'div', 'center', 'li', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'table', 'tr', 'td'}


class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks, self.cur = [], None
        self.bold = self.ital = self.center = 0
        self.link, self.link_seen_text = None, True

    # block helpers
    def _close(self):
        if self.cur is not None:
            if any(r[0].strip() for r in self.cur.runs) or any(r[3] for r in self.cur.runs):
                self.blocks.append(self.cur)
            self.cur = None

    def _open(self, kind, align=None, implicit=False):
        self._close()
        self.cur = Block(kind, align or ('center' if self.center else None), implicit)

    def _run(self, text):
        if self.cur is None:
            if not text.strip():
                return
            self._open('p', implicit=True)
        self.cur.runs.append([text, self.bold > 0, self.ital > 0, self.link])
        if self.link:
            self.link_seen_text = True

    @staticmethod
    def _align_of(attrs):
        for k, v in attrs:
            if k == 'style' and v:
                m = re.search(r'text-align\s*:\s*([a-z]+)', v, re.I)
                if m:
                    return m.group(1).lower()
            if k == 'align' and v:
                return v.lower()
        return None

    def handle_starttag(self, tag, attrs):
        if tag in ('p', 'div', 'li', 'h2', 'h3', 'blockquote', 'td'):
            self._open('h2' if tag in ('h2', 'h3') else ('li' if tag == 'li' else 'p'), self._align_of(attrs))
        elif tag == 'center':
            self.center += 1
            if self.cur is not None and not self.cur.text().strip():
                self.cur.align = 'center'
            else:
                self._open('p', 'center')
        elif tag == 'hr':
            self._close()
            self.blocks.append(Block('hr'))
        elif tag == 'br':
            if self.cur is not None:
                self.cur.runs.append(['\n', False, False, None])
        elif tag in ('b', 'strong'):
            self.bold += 1
        elif tag in ('i', 'em'):
            self.ital += 1
        elif tag == 'a':
            self.link = dict(attrs).get('href')
            self.link_seen_text = False

    def handle_startendtag(self, tag, attrs):
        if tag in ('br', 'hr'):
            self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag in ('p', 'div', 'li', 'h2', 'h3', 'blockquote', 'td'):
            self._close()
        elif tag == 'center':
            self.center = max(0, self.center - 1)
            self._close()
        elif tag in ('b', 'strong'):
            self.bold = max(0, self.bold - 1)
        elif tag in ('i', 'em'):
            self.ital = max(0, self.ital - 1)
        elif tag == 'a':
            if self.link and not self.link_seen_text:
                self._run_link_only(self.link)
            self.link = None

    def _run_link_only(self, href):
        if self.cur is None:
            self._open('p', implicit=True)
        self.cur.runs.append(['', False, False, href])

    def handle_data(self, data):
        if self.cur is not None and self.cur.implicit and '\n\n' in data:
            before, _, after = data.partition('\n\n')
            self._run(before)
            self._close()
            if after.strip():
                self._run(after)
            return
        if self.cur is None and not data.strip():
            return
        self._run(data)

    def close(self):
        super().close()
        self._close()


# ─── Blocks -> Format B paragraphs ──────────────────────────────────────
def style_key(bold, ital):
    return ('b' if bold else '') + ('i' if ital else '')


def render_tokens(tokens):
    """tokens: [('t', text, style) | ('ref', ref)] -> Format B text (balanced markers per line)."""
    lines, cur = [], []
    for tok in tokens:
        if tok[0] == 'ref':
            cur.append(tok)
            continue
        parts = tok[1].split('\n')
        for i, part in enumerate(parts):
            if i > 0:
                lines.append(cur)
                cur = []
            if part:
                cur.append(('t', part, tok[2]))
    lines.append(cur)
    out_lines = []
    for ln in lines:
        # merge adjacent same-style text
        merged = []
        for tok in ln:
            if tok[0] == 't' and merged and merged[-1][0] == 't' and merged[-1][2] == tok[2]:
                merged[-1] = ('t', merged[-1][1] + tok[1], tok[2])
            else:
                merged.append(tok)
        s = ''
        for tok in merged:
            if tok[0] == 'ref':
                s = s.rstrip() + '{{ref:%s}}' % tok[1]
                continue
            txt = re.sub(r'[ \t\r\f\v\xa0]+', ' ', tok[1])
            lead = txt[:len(txt) - len(txt.lstrip())]
            trail = txt[len(txt.rstrip()):]
            core = txt.strip()
            if not core:
                s += txt
                continue
            core = core.replace('_', '‗').replace('**', '∗∗')
            st = tok[2]
            if st == 'bi':
                core = '**_' + core + '_**'
            elif st == 'b':
                core = '**' + core + '**'
            elif st == 'i':
                core = '_' + core + '_'
            s += lead + core + trail
        s = re.sub(r' {2,}', ' ', s).strip()
        out_lines.append(s)
    text = '\n'.join(out_lines)
    text = re.sub(r'\n{3,}', '\n\n', text).strip('\n').strip()
    return text


ATTR_RE = re.compile(r'^\s*(excerpts?\s+)?(taken\s+)?from\s*(the\s+letter)?\s*:?\s*$', re.I)


def mw_anchor(frag):
    """A MediaWiki #anchor spells a byte as '.XX' ('.2C' = ',', '.E2.80.99' = '’')."""
    return urllib.parse.unquote(re.sub(r'\.([0-9A-F]{2})', r'%\1', frag or ''))


def slug_to_title(slug):
    return urllib.parse.unquote(slug).replace('_', ' ').strip()


def norm(s):
    # The URL-key normalisation: answersUrlKey() in src/utils/answers-links.js
    # mirrors it exactly — change both or neither.
    return re.sub(r'[^a-z0-9]+', ' ', urllib.parse.unquote(s or '').replace('_', ' ').lower()).strip()


def norm_title(s):
    """Letter-title matching only: an apostrophe joins its word ("Father’s" = "Fathers")."""
    return norm(re.sub(r"[’']", '', urllib.parse.unquote(s or '')))


class Matcher:
    """Site letter URL -> {collection label, title} via the app's own corpus."""

    def __init__(self, cols):
        self.cols = cols  # [{volKey,label,registryLabel,kind,entries:[{id,title}]}]
        self.by_norm = {}
        for c in cols:
            if c['volKey'] == 'hm':
                continue  # Hidden Manna is never linked publicly (owner policy)
            for e in c['entries']:
                self.by_norm.setdefault(norm_title(e['title']), []).append((c, e))
        self.stats = {'matched': 0, 'unmatched': [], 'ambiguous': []}

    def match(self, url):
        url = url.split('<')[0]  # the site leaves a stray <br> inside a few hrefs
        u = urllib.parse.urlsplit(url)
        if 'thevolumesoftruth.com' not in u.netloc.lower():
            return None
        path = urllib.parse.unquote(u.path.lstrip('/'))
        frag = mw_anchor(u.fragment)
        want_keys = None
        if path.startswith('Words_To_Live_By:_Part_One'):
            want_keys, title = ('wtlb1',), frag
        elif path.startswith('Words_To_Live_By:_Part_Two'):
            want_keys, title = ('wtlb2',), frag
        elif path.startswith('Words_To_Live_By'):  # the site's older single WTLB page — either part
            want_keys, title = ('wtlb1', 'wtlb2'), frag
        elif path.startswith('The_Blessed'):
            want_keys, title = ('blessed',), frag
            if not frag:  # the bare page is The Blessed's introduction
                for c in self.cols:
                    if c['volKey'] == 'blessed':
                        for e in c['entries']:
                            if e['id'] == 'introduction':
                                self.stats['matched'] += 1
                                return {'collection': c['label'], 'registryLabel': c['registryLabel'], 'title': e['title'], 'volKey': c['volKey']}
        else:
            title = path.split('/')[0]
        if not title:
            self.stats['unmatched'].append(url)
            return None
        cands = self.by_norm.get(norm_title(title), [])
        if want_keys:
            cands = [x for x in cands if x[0]['volKey'] in want_keys]
        if not cands:
            self.stats['unmatched'].append(url)
            return None
        if len(cands) > 1 and len({x[0]['volKey'] for x in cands}) > 1:
            self.stats['ambiguous'].append((url, [x[0]['volKey'] for x in cands]))
        c, e = cands[0]
        self.stats['matched'] += 1
        return {'collection': c['label'], 'registryLabel': c['registryLabel'], 'title': e['title'], 'volKey': c['volKey']}


def attr_label(m):
    """Short collection label for the attribution tail; 'Volume 7' for the volumes."""
    mm = re.match(r'^Volume (One|Two|Three|Four|Five|Six|Seven)$', m['registryLabel'])
    if mm:
        return 'Volume ' + str(['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'].index(mm.group(1)) + 1)
    return m['collection']


def blocks_to_paragraphs(blocks, bitly, matcher, stats):
    paras = []
    for b in blocks:
        if b.kind == 'hr':
            if paras and paras[-1]['text'] != '✦':
                paras.append({'align': 'center', 'text': '✦'})
            continue
        if b.kind == 'h2':
            t = b.text().strip()
            if not t or re.match(r'^section\s+(\w+)$', t, re.I):
                continue
            paras.append({'align': 'center', 'text': '**' + t.replace('_', '‗') + '**'})
            continue
        # attribution block?
        plain = re.sub(r'\s+', ' ', ''.join(r[0] for r in b.runs if not r[3])).strip()
        tvot = [r for r in b.runs if r[3] and 'thevolumesoftruth.com' in (r[3] or '')]
        if tvot and ATTR_RE.match(plain):
            href = tvot[0][3].split('<')[0]
            m = matcher.match(href)
            sp = urllib.parse.urlsplit(href)
            if sp.fragment and ('Words_To_Live_By' in sp.path or 'The_Blessed' in sp.path):
                site_title = mw_anchor(sp.fragment).replace('_', ' ').strip()
            else:
                site_title = slug_to_title(sp.path.lstrip('/').split('/')[0])
            if m:
                paras.append({'align': 'right', 'text': '~ [From “%s” ~ %s]' % (m['title'].replace('_', '‗'), attr_label(m))})
            else:
                paras.append({'align': 'right', 'text': '_From: %s_' % site_title.replace('_', '‗')})
            continue
        # ordinary block -> tokens
        tokens = []
        for text, bold, ital, link in b.runs:
            if link and is_scripture_host(link, bitly):
                refs = refs_from_url(link, bitly)
                if refs:
                    # A reference the sentence NAMES ("regarding Luke 15:11-32:",
                    # "the Book of Ezekiel Chapter One") keeps its words, the
                    # footnote after them. A parenthetical cite — "(Isaiah 1:1)",
                    # or a link sitting just inside "(" — and a bare footnote
                    # number are the marker alone, as before.
                    lt = (text or '').strip()
                    prev = tokens[-1][1] if tokens and tokens[-1][0] == 't' else ''
                    cite = (not lt or lt.startswith('(') or re.fullmatch(r'[\d\s,;.:-]+', lt)
                            or prev.rstrip().endswith('('))
                    if not cite:
                        tokens.append(('t', text, style_key(bold, ital)))
                        stats['ref_words_kept'] += 1
                    for r in refs:
                        tokens.append(('ref', r))
                        stats['refs'] += 1
                else:
                    stats['refs_unparsed'].append(bitly.get(link, link))
                continue
            if link and link.startswith('wiki:'):
                stats['topic_links'] += 1
            tokens.append(('t', text, style_key(bold, ital)))
        text = render_tokens(tokens)
        if not text:
            continue
        align = b.align or ('left' if b.kind == 'li' else 'justify')
        if align not in ('center', 'justify', 'left', 'right'):
            align = 'justify'
        if b.kind == 'li':
            text = '• ' + text
        paras.append({'align': align, 'text': text})
    # trailing / leading ornaments are noise
    while paras and paras[-1]['text'] == '✦':
        paras.pop()
    while paras and paras[0]['text'] == '✦':
        paras.pop(0)
    return paras


def slugify(title):
    s = title.replace('’', '').replace("'", '').replace('�', '')
    s = re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-').lower()
    return s or 'entry'


def parse_sidebar(wikitext):
    """[(group label, [titles])] in site order; utility groups skipped."""
    groups, cur = [], None
    for line in wikitext.splitlines():
        m2 = re.match(r'^\*\*\s*(.+?)\s*\|\s*(.*?)\s*$', line)
        m1 = re.match(r'^\*\s*(.+?)\s*$', line)
        if m2:
            if cur is not None:
                cur[1].append(m2.group(1).strip())
        elif m1:
            label = m1.group(1).strip()
            if label.lower() in ('menu', 'search', 'toolbox', 'languages') or not label:
                cur = None
                continue
            cur = (label.rstrip(':').strip(), [])
            groups.append(cur)
    return [g for g in groups if g[1]]


def group_display(label):
    """Short enough for the index row's eyebrow (VolumeLetterIndex's `date` slot)."""
    if re.match(r'^\d+\.\s+Thus Says The Lord', label):
        return 'Thus Says The Lord…'
    m = re.match(r'^(\d+)\.\s+', label)
    if m:
        return 'Commandment %s' % m.group(1)
    if label.lower().startswith('index of false doctrines'):
        return 'False Doctrines'
    return label


# ─── App corpus (titles per collection) via node ────────────────────────
NODE_SNIPPET = r"""
const fs = require('fs'), vm = require('vm'), path = require('path');
const repo = process.env.VOT_REPO;
const sr = fs.readFileSync(path.join(repo, 'app/src/main/assets/src/data/scripture-resolution.js'), 'utf8');
const rows = [];
const rowRe = /\{\s*volKey:\s*'([^']+)'[^\n]*?globalName:\s*'([^']+)'[^\n]*?prefaceGlobal:\s*(null|'[^']+')[^\n]*?label:\s*(['"])(.*?)\4[^\n]*?registryLabel:\s*(['"])(.*?)\6[^\n]*?kind:\s*'([^']+)'/g;
let m; while ((m = rowRe.exec(sr))) rows.push({ volKey: m[1], globalName: m[2], prefaceGlobal: m[3] === 'null' ? null : m[3].slice(1, -1), label: m[5], registryLabel: m[7], kind: m[8] });
const build = fs.readFileSync(path.join(repo, 'tools/build.py'), 'utf8');
const avot = build.slice(build.indexOf('A_VOT = ['), build.indexOf(']', build.indexOf('A_VOT = [')));
const files = [...avot.matchAll(/'(src\/data\/[^']+\.js)'/g)].map(x => x[1]);
const ctx = {}; vm.createContext(ctx);
for (const f of files) { try { vm.runInContext(fs.readFileSync(path.join(repo, 'app/src/main/assets', f), 'utf8'), ctx, { filename: f }); } catch (e) { } }
const out = rows.map(r => {
  const arr = Array.isArray(ctx[r.globalName]) ? ctx[r.globalName] : [];
  const entries = arr.filter(e => e && e.id && e.title).map(e => ({ id: e.id, title: e.title }));
  const pref = r.prefaceGlobal && ctx[r.prefaceGlobal]; if (pref && pref.id && pref.title) entries.unshift({ id: pref.id, title: pref.title });
  return Object.assign({}, r, { entries });
});
process.stdout.write(JSON.stringify(out));
"""


def load_app_collections(repo):
    r = subprocess.run(['node', '-e', NODE_SNIPPET], capture_output=True, text=True, encoding='utf-8',
                       env=dict(os.environ, VOT_REPO=repo))
    if r.returncode != 0:
        sys.exit('node failed: ' + r.stderr[:500])
    return json.loads(r.stdout)


# ─── Main ───────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', required=True)
    ap.add_argument('--fetch', action='store_true')
    ap.add_argument('--repo', default=REPO)
    ap.add_argument('--out', default=None)
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()
    if a.fetch:
        fill_cache(a.cache)
    out_path = a.out or os.path.join(a.repo, 'app/src/main/assets/src/data/answers.js')

    pages = jload(os.path.join(a.cache, 'allpages-nonredir.json'))['query']['allpages']
    redirects = jload(os.path.join(a.cache, 'redirect-map.json'))
    bitly = {k: v for k, v in jload(os.path.join(a.cache, 'bitly-map.json')).items() if not v.startswith('ERR')}
    sidebar = parse_sidebar(jload(os.path.join(a.cache, 'sidebar.json'))['parse']['wikitext'])
    cols = load_app_collections(a.repo)
    matcher = Matcher(cols)
    taken_ids = {e['id'] for c in cols for e in c['entries'] if c['kind'] in ('wtlb', 'blessed', 'holy-days')}

    # order: sidebar groups first, then anything else alphabetically
    order, group_of = [], {}
    for label, titles in sidebar:
        for t in titles:
            if t not in group_of:
                order.append(t)
                group_of[t] = group_display(label)
    real_titles = {p['title'] for p in pages}
    rest = sorted(t for t in real_titles if t not in group_of)
    for t in rest:
        order.append(t)
        group_of[t] = 'More Topics'

    stats = {'refs': 0, 'refs_unparsed': [], 'ref_words_kept': 0, 'topic_links': 0, 'paras': 0, 'skipped': []}
    entries, by_title = [], {}
    for title in order:
        if title not in real_titles:
            stats['skipped'].append(('not a page', title))
            continue
        if title == 'Main Page' or title.startswith("''"):
            stats['skipped'].append(('utility', title))
            continue
        fn = os.path.join(a.cache, 'wikitext', urllib.parse.quote(title, safe='') + '.json')
        wikitext = jload(fn)['wikitext']
        if len(wikitext) < 200:
            stats['skipped'].append(('stub', title))
            continue
        related, blocks = [], []
        for heading, body in split_sections(wikitext):
            h = (heading or '').strip().lower()
            if h == 'related topics':
                related.extend(re.findall(r'\[\[([^\]|]+)', body))
                continue
            if h in ('navigation', 'see also', 'external links'):
                continue
            p = Parser()
            if heading:
                p.blocks.append(_heading_block(heading))
            p.feed(wiki_to_html(body))
            p.close()
            blocks.extend(p.blocks)
        paras = blocks_to_paragraphs(blocks, bitly, matcher, stats)
        if not paras:
            stats['skipped'].append(('empty', title))
            continue
        disp = title.replace('�', '’')
        eid = slugify(disp)
        if eid in taken_ids:
            eid = 'answers-' + eid
        taken_ids.add(eid)
        e = {
            'id': eid, 'num': 0, 'title': disp, 'type': 'wtlb',
            'sourceLabel': 'answersonlygodcangive.com',
            'group': group_of[title],
            'groupShort': group_of[title].replace('Thus Says The Lord…', 'Thus Says…'),  # index-row eyebrow
            'siteUrl': SITE + '/' + urllib.parse.quote(title.replace(' ', '_'), safe="/:,()'._-"),
            'related': related,  # resolved to ids below
            'paragraphs': paras,
        }
        entries.append(e)
        by_title[title] = e
        stats['paras'] += len(paras)
        if a.limit and len(entries) >= a.limit:
            break

    def resolve_title(t):
        t = t.strip()
        t = redirects.get(t, t)
        return by_title.get(t)

    for i, e in enumerate(entries):
        e['num'] = i + 1
        rel = []
        for t in e['related']:
            tgt = resolve_title(t)
            if tgt and tgt is not e and tgt['id'] not in [r['id'] for r in rel]:
                rel.append({'id': tgt['id'], 'title': tgt['title']})
        e['related'] = rel

    url_index = {}
    for t, e in by_title.items():
        url_index[norm(t)] = e['id']
    for frm, to in redirects.items():
        tgt = by_title.get(to)
        if tgt:
            url_index.setdefault(norm(frm), tgt['id'])


    with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// GENERATED by tools/fetch-answers.py from answersonlygodcangive.com — do not hand-edit.\n')
        f.write('// %d topic pages, %d paragraphs, %d scripture refs. Format B (see CLAUDE.md).\n' % (len(entries), stats['paras'], stats['refs']))
        f.write('// Loaded on demand (src/utils/sync-loaders.js). Highlights key on paragraph\n')
        f.write('// index (wtlb:<id>:<n>), so a regeneration that moves paragraphs moves them.\n')
        f.write('var ANSWERS = [\n')
        for i, e in enumerate(entries):
            f.write(json.dumps(e, ensure_ascii=False, separators=(',', ':')) + (',\n' if i < len(entries) - 1 else '\n'))
        f.write('];\n')

    # The link index ships in bundle-d, always loaded, so a letter's Related
    # Topics row knows it opens in-app before the 2.5 MB corpus is fetched.
    index_path = os.path.join(a.repo, 'app/src/main/assets/src/utils/answers-url-index.js')
    titles = {e['id']: e['title'] for e in entries}
    with open(index_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* GENERATED by tools/fetch-answers.py — do not hand-edit.\n')
        f.write('   Every answersonlygodcangive.com URL key (real titles and the wiki\'s\n')
        f.write('   redirects) -> topic id, and every topic id -> its title. */\n')
        f.write('export const ANSWERS_URL_INDEX = ' + json.dumps(url_index, ensure_ascii=False, indent=2, sort_keys=True) + ';\n')
        f.write('export const ANSWERS_TITLES = ' + json.dumps(titles, ensure_ascii=False, indent=2) + ';\n')

    size = os.path.getsize(out_path)
    print('wrote %s (%d bytes): %d entries, %d paragraphs, %d refs (%d unparsed scripture links), %d topic links kept as text'
          % (out_path, size, len(entries), stats['paras'], stats['refs'], len(stats['refs_unparsed']), stats['topic_links']))
    ms = matcher.stats
    import collections
    um = collections.Counter(ms['unmatched'])
    amb = collections.OrderedDict((u, k) for u, k in ms['ambiguous'])
    print('attributions: %d matched to in-app letters, %d unmatched (%d distinct), %d ambiguous (%d distinct; first collection in registry order wins)'
          % (ms['matched'], len(ms['unmatched']), len(um), len(ms['ambiguous']), len(amb)))
    for u, n in um.most_common(12):
        print('   unmatched x%d: %s' % (n, u))
    for u, keys in list(amb.items())[:6]:
        print('   ambiguous:', u, keys)
    if stats['refs_unparsed']:
        print('unparsed scripture links (first 8):')
        for u in stats['refs_unparsed'][:8]:
            print('   ', u)
    if stats['skipped']:
        print('skipped:', stats['skipped'])
    print('url index keys:', len(url_index), '| groups:', sorted(collections.Counter(e['group'] for e in entries).items()))


def _heading_block(heading):
    b = Block('h2')
    b.runs.append([heading, False, False, None])
    return b


if __name__ == '__main__':
    main()
