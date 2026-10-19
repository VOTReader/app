#!/usr/bin/env python3
"""
fetch-answers.py — vendor answersonlygodcangive.com into src/data/answers.js.

The site is a MediaWiki whose pages are compilations of excerpts from the
letters the app already carries. Each page becomes ONE Format B entry
(`paragraphs: [{align, text}]`, the WTLB / Holy Days shape):

  * `==Heading==` / `=Heading=` -> a centered **bold** paragraph (generic
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

Everything else the site shows rides in SIDECARS, so the paragraph text never
gains markup and no existing paragraph index moves (highlights key on
wtlb:<id>:<n> plus character offsets). They are written beside answers.js to
src/data/answers-meta.js as `var ANSWERS_META = {<id>: {field: ...}}`, loaded
on demand, so answers.js grows only by the Main Page and the site metadata.
Offsets (`at`) are JavaScript (UTF-16)
indices into the paragraph's raw `text` string, the domain
src/utils/format-b-dom-text.js projects into the DOM; `text` + `occ` (the
occurrence of that slice, counted from 0) re-anchor them if they ever drift.

  siteGroup    {n, label[, text]}  the site's sidebar group, word for word (n 0 = Main Page,
                                1-10 the commandments, 11 Other Topics, 12-23 the numbered
                                "Thus Says The Lord..." groups, 24 the False Doctrines
                                index; {n: null, label: 'Unlisted'} for a page not in it)
  siteNav      {prev, next, end, proceed, ret}  the page's own Navigation block (ids)
  sections     [{title, level, at, anchor[, synthetic]}]  every content heading;
                                synthetic = a dropped "Section One" (no paragraph; `at` is the
                                paragraph it starts at). Anchors are MediaWiki's own.
  media        [{kind, title, url, youtubeId, listId, index, src, file, w, h, at, replaces, inline}]
                                at: paragraph it sits under, -1 = the hero, 'end' = the Watch block
  links        {"n": [{text, occ, at, kind, id, anchor, textFragment, collection, title, query, scope, url}]}
  bareLinks    {"n": [{after, at, kind, ...}]}  the site's unlabelled [N] links
  relatedMore  [{id, title, anchor, url, pos[, letter]}]  full-URL Related Topics links
  relatedGroups [{label, items: [{id, title[, anchor]}]}]  (Regarding The Ten Commandments)
  refMeta      {"n": [{i, version, siteUrl}]}  the translation the site cites (non-NKJV only)
  marks        {"n": {u: [[at, len]], big: [[at, len, px]], small: [[at, len]], indent: k}}
  notes        {"n": [{marker, at, after, note}]}  <sup> markers and the paragraph they point at
  attr         {"n": {wording, title, url, inApp}}  every source line (wording only when not "From")
  words        reading length
and after the array `var ANSWERS_SITE_META = {...}` (tagline, about, copyright, sister
sites, promotion, Trumpet Call block, the sidebar's 24 group labels, capturedAt, endCard).

The Main Page is appended LAST as `answers-main-page`.

It also writes src/utils/answers-url-index.js: ANSWERS_URL_INDEX maps every
site URL (real titles AND the wiki's redirects, followed transitively) to an
entry id, and ANSWERS_TITLES every id to its title, so a letter's
`relatedTopics` row can open in-app before the corpus itself is fetched.

Guards: the run refuses to write when any paragraph already shipped would change
other than by a {{ref:}} insertion, when a topic's paragraph count changes, or when a
kept paragraph moves (paragraph_shifts); --accept-text-change / --accept-shift
override them only for a deliberate, announced re-vendor.

Usage:
  py -3 tools/fetch-answers.py --cache DIR            # convert from cache
  py -3 tools/fetch-answers.py --cache DIR --fetch    # (re)fill the cache first
  options: --out FILE (default src/data/answers.js), --limit N, --repo DIR
"""
import argparse
import collections
import datetime
import html
import json
import os
import difflib
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
MAIN_PAGE = 'Main Page'
MAIN_ID = 'answers-main-page'
MAIN_TITLE = 'Answers Only God Can Give'

# The site's images, vendored beside the app's other bundled images (assets root).
IMAGE_ASSETS = {
    'Answers Banner 2022 NEW.jpg': 'answers-banner.jpg',
    'CHART - The TRUE Chronology of The Messiahs Crucifixion and Resurrection.jpg': 'answers-chart-chronology.jpg',
    "Man's Holidays vs God's Holy Days.jpg": 'answers-holidays-vs-holy-days.jpg',
}
# The site's own broken topic links, pointed at the page they mean.
TOPIC_FIXUPS = {
    'regarding the holidays of me': 'Regarding the Holidays of Men',
}
# The fields answers.js has always carried; everything else an entry gains goes to answers-meta.js.
CORE_KEYS = ('id', 'num', 'title', 'type', 'sourceLabel', 'group', 'groupShort', 'siteUrl', 'related', 'paragraphs')
# The site-promotion PDF is linked from many pages; it is not a topic's own media.
PROMO_PDF = 'trumpetcallofgod.com/pdfs/be_part.pdf'

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
    # Bible Gateway / Study Tools abbreviations the site's links use ("1Co 5:7-8")
    '1co': '1 Corinthians', '2co': '2 Corinthians', '1th': '1 Thessalonians', '2th': '2 Thessalonians',
    '1ti': '1 Timothy', '2ti': '2 Timothy', '1pe': '1 Peter', '2pe': '2 Peter',
    '1jn': '1 John', '2jn': '2 John', '3jn': '3 John',
    'gen': 'Genesis', 'ex': 'Exodus', 'lev': 'Leviticus', 'num': 'Numbers', 'deut': 'Deuteronomy',
    'ps': 'Psalm', 'prov': 'Proverbs', 'isa': 'Isaiah', 'jer': 'Jeremiah', 'ezek': 'Ezekiel',
    'dan': 'Daniel', 'mt': 'Matthew', 'mk': 'Mark', 'lk': 'Luke', 'jn': 'John', 'rom': 'Romans',
    'gal': 'Galatians', 'eph': 'Ephesians', 'heb': 'Hebrews', 'jas': 'James', 'rev': 'Revelation',
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
        # "3:16" or "18" after a book inherits the book; "2 Peter" / "2-peter" / "1Co" starts a new one.
        if re.match(r'^\d', part) and book and not re.match(r'^[1-3]-?\s*[A-Za-z]', part):
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
        if 'passage' in segs or 'passage.aspx' in segs:    # /passage/?q= and /gnt/john/passage.aspx?q=
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


def ref_version(url):
    """The translation a scripture link cites ('CJB', 'NKJV', ...), or None when the link names none."""
    try:
        u = urllib.parse.urlsplit(url)
    except ValueError:
        return None
    host = u.netloc.lower()
    if 'biblegateway.com' in host:
        v = urllib.parse.parse_qs(u.query).get('version', [''])[0].strip()
        return v.upper() or None
    if 'biblestudytools.com' in host:
        segs = [x for x in u.path.split('/') if x]
        if len(segs) >= 2 and segs[0].lower() != 'passage' and not BOOK_BY_KEY.get(re.sub(r'[^a-z0-9]', '', segs[0].lower())):
            return segs[0].upper()
    return None


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


def cache_file(cache, kind, title):
    return os.path.join(cache, kind, urllib.parse.quote(title, safe='') + '.json')


def follow_redirects(title, redirects):
    """A redirect's final page, followed hop by hop; a loop stops at the first title seen twice."""
    seen = set()
    while title in redirects and title not in seen:
        seen.add(title)
        title = redirects[title]
    return title


# ─── Wikitext -> HTML-ish ───────────────────────────────────────────────
# Section headings: `==Heading==`, and on six pages the single-`=` form, which plays the same role there
# (their "=Related Topics=" and "=Navigation=" too). Before 2026-09-24 only `==` matched, so those pages
# shipped 37 raw "=Heading=" lines as body text, their related-topic links as prose and their
# navigation boilerplate. The site uses no other level (surveyed: 642 at level 2, 37 at level 1).
HEADING_RE = re.compile(r'^(={1,2})\s*([^=](?:.*[^=])?)\s*\1\s*$', re.M)
COPYRIGHT_RE = re.compile(r'<center><font size="2">\s*(Copyright.*?)</font></center>', re.S | re.I)
EXT_LINK_RE = re.compile(r'\[(https?://[^\s\]]+)\s+([^\]]*)\]')
WIKI_LINK_RE = re.compile(r'\[\[([^\]|]+)(?:\|([^\]]*))?\]\]')
TAG_RE = re.compile(r'<[^>]+>')
REF_MARK_RE = re.compile(r'\{\{ref:[^}]*\}\}')
URL_WORD_RE = re.compile(r'https?://\S+')
# A run of {{ref:}} markers with the emphasis it may close before it and reopen after it (without_refs).
REF_SPLIT_RE = re.compile(r'(_\*\*|\*\*|_)?((?:\{\{ref:[^}]*\}\})+)(\*\*_|\*\*|_)?')


def escape_words(core):
    """A run's words with Format B's marker characters made literal: the renderer reads every "_"
    and "**" as emphasis (format-b-inline.js), so a "_" in the words prints as "‗" and "**" as "∗∗".
    A "_" inside a web address is percent-encoded instead ("%5F" is the same URL, RFC 3986 2.3), so
    an address shown as text (an embed's URL, Main Page :4) still opens when it is copied or shared;
    "‗" there gave a playlist id YouTube does not know."""
    core = URL_WORD_RE.sub(lambda m: m.group(0).replace('_', '%5F'), core)
    return core.replace('_', '‗').replace('**', '∗∗')


def split_sections(wikitext):
    """[(heading or None, body), ...] in document order."""
    out, pos, heading = [], 0, None
    for m in HEADING_RE.finditer(wikitext):
        out.append((heading, wikitext[pos:m.start()]))
        heading, pos = m.group(2).strip(), m.end()
    out.append((heading, wikitext[pos:]))
    return out


def wiki_to_html(body):
    body = re.sub(r'<!--.*?-->', '', body, flags=re.S)
    body = re.sub(r'__(?:FORCE|NO)?TOC__', '', body)
    body = re.sub(r'\[\[\s*category\s*:[^\]]*\]\]', '', body, flags=re.I)
    # An image keeps its place as an empty <img> the parser turns into a media item (no text).
    body = re.sub(r'\[\[\s*(?:file|image)\s*:([^\]|]*)[^\]]*\]\]',
                  lambda m: '<img data-file="%s">' % html.escape(m.group(1).strip(), quote=True), body, flags=re.I)
    body = re.sub(r"<center><font size=\"2\">\s*Copyright.*?</font></center>", '', body, flags=re.S | re.I)
    body = re.sub(r"'''(.+?)'''", r'<b>\1</b>', body, flags=re.S)
    body = re.sub(r"''(.+?)''", r'<i>\1</i>', body, flags=re.S)
    # A run of 2+ apostrophes left over is an unclosed wiki bold/italic, which
    # MediaWiki closes at the line end and renders as nothing.
    body = re.sub(r"'{2,}", '', body)
    # The href is escaped (the label is not): [[Regarding "Another Messiah"]] used to end its href at the quote.
    body = re.sub(r'\[\[([^\]|]+)\|([^\]]*)\]\]', lambda m: '<a href="wiki:%s">%s</a>' % (html.escape(m.group(1).strip(), quote=True), m.group(2)), body)
    body = re.sub(r'\[\[([^\]]+)\]\]', lambda m: '<a href="wiki:%s">%s</a>' % (html.escape(m.group(1).strip(), quote=True), m.group(1).strip()), body)
    body = re.sub(r'\[(https?://[^\s\]]+)\s+([^\]]*)\]', r'<a href="\1">\2</a>', body)
    body = re.sub(r'\[(https?://[^\s\]]+)\]', r'<a href="\1"></a>', body)
    body = re.sub(r'^-{4,}\s*$', '<hr>', body, flags=re.M)
    body = re.sub(r'^\*+\s*(.*)$', r'<li>\1</li>', body, flags=re.M)
    return body


class Block:
    __slots__ = ('kind', 'align', 'runs', 'implicit', 'pad', 'sec')

    def __init__(self, kind, align=None, implicit=False):
        self.kind, self.align, self.runs, self.implicit = kind, align, [], implicit
        self.pad, self.sec = None, None

    def text(self):
        return ''.join(r[0] for r in self.runs)


BLOCK_TAGS = {'p', 'div', 'center', 'li', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'table', 'tr', 'td'}
FONT_SIZES = {'1': 'small', '2': 'small', '3': 'normal', '4': 18, '5': 24, '6': 32, '7': 48}
CSS_SIZES = {'large': 18, 'larger': 18, 'x-large': 24, 'xx-large': 32, 'small': 'small', 'smaller': 'small',
             'x-small': 'small', 'medium': 'normal'}


def font_size(v):
    """<font size="N"> -> px for a callout, 'small', 'normal' (3, the site's body) or None."""
    return FONT_SIZES.get(str(v or '').strip().strip('"'))


def css_size(style):
    m = re.search(r'font-size\s*:\s*([^;"]+)', style or '', re.I)
    if not m:
        return None
    v = m.group(1).strip().lower()
    mm = re.match(r'^(\d+(?:\.\d+)?)px$', v)
    if mm:
        px = float(mm.group(1))
        return int(px) if px >= 18 else ('small' if px < 14 else 'normal')
    return CSS_SIZES.get(v)


class Parser(HTMLParser):
    """Wiki HTML -> Blocks of runs [text, bold, ital, link, deco].

    deco (None when plain) carries what the text itself never shows: u (underline), size (px of a
    callout, or 'small'), sup (a footnote marker), embed (an <embedvideo> URL), lid (which <a>)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks, self.cur = [], None
        self.bold = self.ital = self.center = 0
        self.u = self.sup = self.embed = 0
        self.useq, self.uid = 0, 0  # which <u> element the text is in (the outermost open one)
        self.sizes = []  # [(tag, size)] for <font> / <span>, innermost last
        self.lid = 0
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

    def _size(self):
        for _tag, sz in reversed(self.sizes):
            if sz is not None:
                return sz
        return None

    def _deco(self):
        d = {}
        if self.u:
            d['u'] = self.uid
        if self.sup:
            d['sup'] = 1
        if self.embed:
            d['embed'] = 1
        sz = self._size()
        if sz is not None and sz != 'normal':
            d['size'] = sz
        if self.link is not None:
            d['lid'] = self.lid
        return d or None

    def _run(self, text):
        if self.cur is None:
            if not text.strip():
                return
            self._open('p', implicit=True)
        self.cur.runs.append([text, self.bold > 0, self.ital > 0, self.link, self._deco()])
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

    @staticmethod
    def _pad_of(attrs):
        for k, v in attrs:
            if k == 'style' and v:
                m = re.search(r'padding-left\s*:\s*(\d+)px', v, re.I)
                if m:
                    return int(m.group(1))
        return None

    def handle_starttag(self, tag, attrs):
        if tag in ('p', 'div', 'li', 'h2', 'h3', 'blockquote', 'td'):
            self._open('h2' if tag in ('h2', 'h3') else ('li' if tag == 'li' else 'p'), self._align_of(attrs))
            self.cur.pad = self._pad_of(attrs)
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
                self.cur.runs.append(['\n', False, False, None, None])
        elif tag in ('b', 'strong'):
            self.bold += 1
        elif tag in ('i', 'em'):
            self.ital += 1
        elif tag == 'u':
            if not self.u:
                self.useq += 1
                self.uid = self.useq
            self.u += 1
        elif tag == 'sup':
            self.sup += 1
        elif tag == 'font':
            self.sizes.append(('font', font_size(dict(attrs).get('size'))))
        elif tag == 'span':
            self.sizes.append(('span', css_size(dict(attrs).get('style'))))
        elif tag == 'embedvideo':
            self.embed += 1
        elif tag == 'img':
            f = dict(attrs).get('data-file')
            if f:
                if self.cur is None:
                    self._open('p', implicit=True)
                self.cur.runs.append(['', False, False, 'img:' + f, None])
        elif tag == 'a':
            self.lid += 1
            self.link = dict(attrs).get('href')
            self.link_seen_text = False

    def handle_startendtag(self, tag, attrs):
        if tag in ('br', 'hr', 'img'):
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
        elif tag == 'u':
            self.u = max(0, self.u - 1)
        elif tag == 'sup':
            self.sup = max(0, self.sup - 1)
        elif tag in ('font', 'span'):
            for i in range(len(self.sizes) - 1, -1, -1):
                if self.sizes[i][0] == tag:
                    del self.sizes[i]
                    break
        elif tag == 'embedvideo':
            self.embed = max(0, self.embed - 1)
        elif tag == 'a':
            if self.link and not self.link_seen_text:
                self._run_link_only(self.link)
            self.link = None

    def _run_link_only(self, href):
        if self.cur is None:
            self._open('p', implicit=True)
        self.cur.runs.append(['', False, False, href, {'lid': self.lid}])

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
            core = escape_words(core)
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


def _piece_core(part):
    """A run's words as render_tokens prints them (whitespace collapsed, marker look-alikes swapped)."""
    return escape_words(re.sub(r'[ \t\r\f\v\xa0]+', ' ', part).strip())


def _match_from(out, core, pos):
    """Where `core` starts in `out` at or after `pos`, stepping only over markup render_tokens adds
    (spaces, ** and _ markers, line breaks, {{ref:}} markers, the list bullet); else the next find."""
    i, n = pos, len(out)
    while i <= n:
        if out.startswith(core, i):
            return i
        if i < n and out[i] in ' *_\n•':
            i += 1
            continue
        if out.startswith('{{ref:', i):
            k = out.find('}}', i)
            if k >= 0:
                i = k + 2
                continue
        break
    return out.find(core, pos)


def locate_tokens(out, tokens, start=0):
    """Each token's place in render_tokens' output: [(cursor before it, [(start, end), ...])] in
    code points. A text token gets one span per line it covers; an empty token (a bare link) none."""
    pos, res, misses = start, [], 0
    for tok in tokens:
        before = pos
        if tok[0] == 'ref':
            mk = '{{ref:%s}}' % tok[1]
            j = out.find(mk, pos)
            if j >= 0:
                pos = j + len(mk)
            res.append((before, [(j, j + len(mk))] if j >= 0 else []))
            continue
        spans = []
        for part in tok[1].split('\n'):
            core = _piece_core(part)
            if not core:
                continue
            j = _match_from(out, core, pos)
            if j < 0:
                misses += 1
                continue
            spans.append((j, j + len(core)))
            pos = j + len(core)
        res.append((before, spans))
    return res, misses


class U16:
    """Code-point offsets -> JavaScript (UTF-16) offsets for one string."""

    def __init__(self, s):
        self.acc = None
        if any(ord(c) > 0xFFFF for c in s):
            acc = [0]
            for c in s:
                acc.append(acc[-1] + (2 if ord(c) > 0xFFFF else 1))
            self.acc = acc

    def __call__(self, i):
        return i if self.acc is None else self.acc[i]


def occ_of(out, text, at):
    """How many times `text` starts in `out` before `at` (overlapping): the slice's occurrence index."""
    c, i = 0, out.find(text)
    while 0 <= i < at:
        c += 1
        i = out.find(text, i + 1)
    return c


ATTR_RE = re.compile(r'^\s*(excerpts?\s+)?(taken\s+)?from\s*(the\s+letter)?\s*:?\s*$', re.I)
# A source line the converter does not turn into `~ [From “X” ~ Collection]` (its link is not a letter
# on thevolumesoftruth.com, it has no link, or its label is spelt another way): "**Excerpt from:** Title".
NONSTD_ATTR_RE = re.compile(r'^\*\*((?:Excerpts?|Except)(?: taken)? [Ff]rom(?: the Letter)?|From(?: the Letter)?|Excerpts?):\*\*\s*(.+)$', re.S)


def attr_wording(plain):
    """The site's label on a source line, in its canonical spelling: 'Excerpt from', 'From the Letter', ..."""
    m = ATTR_RE.match(plain or '')
    if not m:
        return 'From'
    w = ''
    if m.group(1):
        w = m.group(1).strip().capitalize() + ' '
    if m.group(2):
        w += 'taken '
    w += 'from' if w else 'From'
    if m.group(3):
        w += ' the Letter'
    return w


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


def anchor_key(s):
    """An anchor or heading reduced for comparison: '.27'/'%27' decoded, markup out, words only."""
    t = html.unescape(TAG_RE.sub('', mw_anchor(s or '')))
    return norm_title(t.replace("'''", '').replace("''", ''))


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

    def blessed_by_lines(self, passage):
        """The Blessed entry holding the most of `passage`'s lines (12+ letters each), or None.

        A bare The_Blessed link used to resolve to the Introduction every time; six passages quote
        other entries ("Blessed Are Those Who Walk in My Ways" held 100 of one passage's 103 lines)
        and their source taps opened the wrong page (improvement sweep n5-04, 2026-09-25)."""
        lines = [line_key(x) for t in (passage or []) for x in str(t).split('\n')]
        lines = [x for x in lines if len(x) >= 12]
        if not lines:
            return None
        best, best_n = None, 0
        for c in self.cols:
            if c['volKey'] != 'blessed':
                continue
            for e in c['entries']:
                body = line_key(e.get('text', ''))
                n = sum(1 for x in lines if x in body)
                if n > best_n:
                    best, best_n = (c, e), n
        return best

    def match(self, url, passage=None):
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
            if not frag:  # the bare page: the entry that holds the passage, else the introduction
                hit = self.blessed_by_lines(passage)
                if hit:
                    c, e = hit
                    self.stats['matched'] += 1
                    return {'collection': c['label'], 'registryLabel': c['registryLabel'], 'title': e['title'], 'volKey': c['volKey']}
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

    def quiet_match(self, url, passage=None):
        """match() without touching the attribution statistics (links and source lines reuse it)."""
        saved = (self.stats['matched'], len(self.stats['unmatched']), len(self.stats['ambiguous']))
        try:
            return self.match(url, passage)
        finally:
            self.stats['matched'] = saved[0]
            del self.stats['unmatched'][saved[1]:]
            del self.stats['ambiguous'][saved[2]:]

    def by_text(self, vol_keys, snippet):
        """The entry of `vol_keys` whose text holds `snippet` (a #:~:text= start), or None."""
        key = line_key(snippet)
        if len(key) < 8:
            return None
        for c in self.cols:
            if c['volKey'] not in vol_keys:
                continue
            for e in c['entries']:
                if key in line_key(e.get('text', '')):
                    return {'collection': c['label'], 'registryLabel': c['registryLabel'], 'title': e['title'], 'volKey': c['volKey']}
        return None

    def by_title(self, title):
        """An in-app letter by its title alone (a source line with no letter link), or None."""
        cands = self.by_norm.get(norm_title(title), [])
        if not cands:
            return None
        c, e = cands[0]
        return {'collection': c['label'], 'registryLabel': c['registryLabel'], 'title': e['title'], 'volKey': c['volKey']}


def line_key(text):
    """A line reduced for containment matching: markers and marks out, lower case, words only."""
    t = re.sub(r'\{\{[^}]*\}\}', ' ', str(text or ''))
    return re.sub(r'[^a-z0-9]+', ' ', t.lower()).strip()


def attr_label(m):
    """Short collection label for the attribution tail; 'Volume 7' for the volumes."""
    mm = re.match(r'^Volume (One|Two|Three|Four|Five|Six|Seven)$', m['registryLabel'])
    if mm:
        return 'Volume ' + str(['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'].index(mm.group(1)) + 1)
    return m['collection']


def plain_text(t):
    """Paragraph text with Format B markers and refs out (for words, note lookups, labels)."""
    return REF_MARK_RE.sub('', t or '').replace('**', '').replace('_', '').replace('‗', '_').strip()


def media_kind(url):
    """'video' | 'playlist' | 'channel' | 'audio' | 'pdf' | 'download' for a media link, else None."""
    try:
        u = urllib.parse.urlsplit(url)
    except ValueError:
        return None
    h, q = u.netloc.lower(), urllib.parse.parse_qs(u.query)
    if 'youtube.com' in h or 'youtu.be' in h:
        if 'v' in q or 'youtu.be' in h:
            return 'video'
        if 'list' in q:
            return 'playlist'
        return 'channel'
    if 'bandcamp.com' in h:
        return 'audio'
    if u.path.lower().endswith('.pdf') and PROMO_PDF not in url.lower():
        return 'pdf'
    if 'dropbox.com' in h:
        return 'download'
    return None


def media_item(kind, title, url, at):
    it = {'kind': kind, 'title': (title or '').strip(), 'url': url}
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    if kind in ('video', 'playlist'):
        if q.get('v'):
            it['youtubeId'] = q['v'][0]
        if q.get('list'):
            it['listId'] = q['list'][0]
        if q.get('index') and q['index'][0].isdigit():
            it['index'] = int(q['index'][0])
    it['at'] = at
    return it


def jpeg_size(path):
    """(width, height) of a baseline or progressive JPEG, read from its SOF marker; None if unreadable."""
    try:
        with open(path, 'rb') as f:
            data = f.read()
    except OSError:
        return None
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            return (data[i + 7] << 8 | data[i + 8], data[i + 5] << 8 | data[i + 6])
        i += 2 + (data[i + 2] << 8 | data[i + 3])
    return None


def blocks_to_paragraphs(blocks, bitly, matcher, stats, side=None):
    """Blocks -> Format B paragraphs. `side` (a dict, optional) collects the sidecars by paragraph index:
    links / bare / marks / notes / attr / refmeta (dicts of lists), media and sections (lists)."""
    side = side if side is not None else {}
    for k in ('links', 'bare', 'marks', 'notes', 'attr', 'refmeta'):
        side.setdefault(k, {})
    side.setdefault('media', [])
    side.setdefault('sections', [])
    paras = []
    passage_from = 0  # index in paras where the passage now being read began
    sec_title = ''
    for b in blocks:
        if b.kind == 'hr':
            if paras and paras[-1]['text'] != '✦':
                paras.append({'align': 'center', 'text': '✦'})
            passage_from = len(paras)
            continue
        if b.kind == 'h2':
            t = b.text().strip()
            sec = b.sec or {}
            if t:
                sec_title = t
            if not t or re.match(r'^section\s+(\w+)$', t, re.I):
                if t:
                    item = {'title': t, 'level': sec.get('level', 1), 'at': len(paras)}
                    if sec.get('anchor'):
                        item['anchor'] = sec['anchor']
                    item['synthetic'] = True
                    side['sections'].append(item)
                continue
            paras.append({'align': 'center', 'text': '**' + t.replace('_', '‗') + '**'})
            item = {'title': t, 'level': sec.get('level', 2 if not b.sec else 1), 'at': len(paras) - 1}
            if sec.get('anchor'):
                item['anchor'] = sec['anchor']
            if not b.sec:
                stats['html_headings'] += 1
            side['sections'].append(item)
            passage_from = len(paras)
            continue
        # attribution block?
        plain = re.sub(r'\s+', ' ', ''.join(r[0] for r in b.runs if not r[3])).strip()
        tvot = [r for r in b.runs if r[3] and 'thevolumesoftruth.com' in (r[3] or '')]
        if tvot and ATTR_RE.match(plain):
            href = tvot[0][3].split('<')[0]
            m = matcher.match(href, [p['text'] for p in paras[passage_from:]])
            sp = urllib.parse.urlsplit(href)
            if sp.fragment and ('Words_To_Live_By' in sp.path or 'The_Blessed' in sp.path):
                site_title = mw_anchor(sp.fragment).replace('_', ' ').strip()
            else:
                site_title = slug_to_title(sp.path.lstrip('/').split('/')[0])
            if m:
                paras.append({'align': 'right', 'text': '~ [From “%s” ~ %s]' % (m['title'].replace('_', '‗'), attr_label(m))})
            else:
                paras.append({'align': 'right', 'text': '_From: %s_' % site_title.replace('_', '‗')})
            wording = attr_wording(plain)
            side['attr'][len(paras) - 1] = {} if wording == 'From' else {'wording': wording}
            if b.pad:
                side['marks'][len(paras) - 1] = {'indent': max(1, round(b.pad / 30))}
            stats['attr_wording'][wording] += 1
            passage_from = len(paras)
            continue
        # ordinary block -> tokens (meta: what each token came from)
        tokens, meta = [], []
        for run in b.runs:
            text, bold, ital, link = run[0], run[1], run[2], run[3]
            deco = run[4] if len(run) > 4 else None
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
                        meta.append({'deco': deco})
                        stats['ref_words_kept'] += 1
                    site_url = bitly.get(link, link)
                    for r in refs:
                        tokens.append(('ref', r))
                        meta.append({'ref': r, 'url': site_url, 'deco': None if not cite else deco})
                        stats['refs'] += 1
                else:
                    stats['refs_unparsed'].append(bitly.get(link, link))
                continue
            if link and link.startswith('wiki:'):
                stats['topic_links'] += 1
            tokens.append(('t', text, style_key(bold, ital)))
            meta.append({'deco': deco, 'link': link})
        text = render_tokens(tokens)
        imgs = [r[3][4:] for r in b.runs if r[3] and r[3].startswith('img:')]
        if not text:
            for f in imgs:
                side['media'].append(image_item(f, sec_title, len(paras) - 1))
            bare = [m.get('link') for m in meta if m.get('link') and not m.get('link', '').startswith(('img:', 'wiki:'))]
            if bare:
                stats['bare_orphans'] += len(bare)
                if paras:
                    n0 = len(paras) - 1
                    for href in bare:
                        side['bare'].setdefault(n0, []).append({'_href': href, '_at': len(paras[n0]['text'])})
            continue
        align = b.align or ('left' if b.kind == 'li' else 'justify')
        if align not in ('center', 'justify', 'left', 'right'):
            align = 'justify'
        if b.kind == 'li':
            text = '• ' + text
        n = len(paras)
        paras.append({'align': align, 'text': text})
        for f in imgs:
            side['media'].append(image_item(f, sec_title, n))
        decorate(n, text, tokens, meta, b, side, stats, sec_title, 2 if b.kind == 'li' else 0)
        # A source line the site writes another way ("**Excerpt from:** Poured Out").
        mm = NONSTD_ATTR_RE.match(text)
        if mm and align == 'center':
            title = re.sub(r'\s+', ' ', plain_text(mm.group(2)).replace('\n', ' ')).strip()
            href = next((m.get('link') for m in meta if m.get('link') and m['link'].startswith('http')), None)
            hit = matcher.quiet_match(href) if href and 'thevolumesoftruth.com' in href else None
            hit = hit or matcher.by_title(title)
            a = {'wording': mm.group(1), 'title': title}
            if href:
                a['url'] = href.split('<')[0]
            a['inApp'] = {'collection': attr_label(hit), 'title': hit['title']} if hit else None
            side['attr'][n] = a
            stats['attr_nonstd'].append((title, a['wording'], a['inApp']))
    # trailing / leading ornaments are noise
    while paras and paras[-1]['text'] == '✦':
        paras.pop()
    lead = 0
    while paras and paras[0]['text'] == '✦':
        paras.pop(0)
        lead += 1
    if lead:
        for k in ('links', 'bare', 'marks', 'notes', 'attr', 'refmeta'):
            side[k] = {n - lead: v for n, v in side[k].items() if n - lead >= 0}
        for it in side['media'] + side['sections']:
            for key in ('at', 'replaces'):
                if isinstance(it.get(key), int) and it[key] >= 0:
                    it[key] = max(0, it[key] - lead)
    return paras


def image_item(f, title, at):
    it = {'kind': 'image', 'title': title, 'file': f}
    src = IMAGE_ASSETS.get(f)
    if src:
        it['src'] = src
    it['at'] = at
    return it


def decorate(n, out, tokens, meta, block, side, stats, sec_title, start):
    """Record paragraph n's sidecars (links, bare links, underline, sizes, notes, refs, embeds) by where
    each token's words landed in `out`, the paragraph's final text. The text itself is not touched."""
    loc, misses = locate_tokens(out, tokens, start)
    stats['locate_miss'] += misses
    u16 = U16(out)
    u_els = collections.OrderedDict()  # <u> element -> [start, end]: one range per element, as the site marks it
    big, small = [], []
    groups = collections.OrderedDict()  # lid -> {'href', 'spans', 'before'}
    ref_i = 0
    for (before, spans), tok, m in zip(loc, tokens, meta):
        if tok[0] == 'ref':
            v = ref_version(m['url'])
            if v != 'NKJV':
                side['refmeta'].setdefault(n, []).append(dict({'i': ref_i}, **({'version': v} if v else {}), siteUrl=m['url']))
                stats['refmeta_versions'][v or '(none)'] += 1
            ref_i += 1
            # An underlined cite ("<u>[url (Matthew 24:36,42)]</u>") underlines the cite the marker renders.
            ud = (m.get('deco') or {}).get('u')
            if ud and spans:
                r = u_els.setdefault(ud, [spans[0][0], spans[0][1]])
                r[0], r[1] = min(r[0], spans[0][0]), max(r[1], spans[0][1])
            continue
        deco = m.get('deco') or {}
        for s, e in spans:
            if deco.get('u'):
                r = u_els.setdefault(deco['u'], [s, e])
                r[0], r[1] = min(r[0], s), max(r[1], e)
            sz = deco.get('size')
            if re.search(r'[A-Za-z0-9]', out[s:e]):
                if isinstance(sz, int):
                    big.append([s, e, sz])
                elif sz == 'small':
                    if small and out[small[-1][1]:s].strip(' *_\n') == '':
                        small[-1][1] = e
                    else:
                        small.append([s, e])
            if deco.get('sup'):
                side['notes'].setdefault(n, []).append({'marker': out[s:e], '_at': s})
        if deco.get('u') and spans:
            stats['u_runs'] += 1
        link = m.get('link')
        if link and not link.startswith('img:'):
            g = groups.setdefault(deco.get('lid', id(m)), {'href': link, 'spans': [], 'before': before})
            g['spans'].extend(spans)
        if deco.get('embed') and spans:
            url = re.sub(r'\s+', '', tok[1])  # the run's own text: the paragraph's spells '_' as '‗'
            if media_kind(url) == 'video':
                it = media_item('video', sec_title, url, n)
                it['replaces'] = n
                side['media'].append(it)
    for g in groups.values():
        href = g['href']
        if g['spans']:
            s, e = g['spans'][0][0], g['spans'][-1][1]
            t = out[s:e]
            side['links'].setdefault(n, []).append({'text': t, 'occ': occ_of(out, t, s), 'at': u16(s), '_href': href})
            k = media_kind(href.split('<')[0])
            if k:
                it = media_item(k, plain_text(t), href.split('<')[0], n)
                it['inline'] = True
                side['media'].append(it)
        else:
            side['bare'].setdefault(n, []).append({'_href': href, '_at': g['before']})
    for it in side['bare'].get(n, []):
        if '_at' in it and 'at' not in it:
            a = min(it.pop('_at'), len(out))
            it['after'] = out[max(0, a - 24):a]
            it['at'] = u16(a)
    for it in side['notes'].get(n, []):
        if '_at' in it:
            a = it.pop('_at')
            it['at'] = u16(a)
            it['after'] = out[max(0, a - 24):a]
    mk = {}
    if u_els:
        mk['u'] = [[u16(s), u16(e) - u16(s)] for s, e in u_els.values()]
    if big:
        mk['big'] = [[u16(s), u16(e) - u16(s), px] for s, e, px in big]
    if small:
        mk['small'] = [[u16(s), u16(e) - u16(s)] for s, e in small]
    if block.pad:
        mk['indent'] = max(1, round(block.pad / 30))
    if mk:
        side['marks'][n] = mk


# ─── Sections, sidebar, navigation ──────────────────────────────────────
def section_meta(wikitext, html_secs, stats):
    """[{level, anchor}] for each HEADING_RE heading, from the parse API's sections[] (toclevel and
    MediaWiki's own anchor). Matched in order; a heading the API lists differently falls back to the
    page's '=' depth and MediaWiki's anchor rule."""
    heads = [(len(m.group(1)), m.group(2).strip()) for m in HEADING_RE.finditer(wikitext)]
    hs = [h for h in (html_secs or []) if h.get('line') is not None]
    both = len({d for d, _ in heads}) > 1
    out, j = [], 0
    for depth, text in heads:
        key = anchor_key(text)
        hit = None
        for k in range(j, len(hs)):
            if anchor_key(hs[k]['line']) == key:
                hit = k
                break
        if hit is not None:
            out.append({'level': int(hs[hit].get('toclevel') or 1), 'anchor': hs[hit].get('anchor')})
            j = hit + 1
        else:
            stats['section_unmatched'].append(text)
            out.append({'level': (depth if both else 1), 'anchor': re.sub(r'\s+', '_', TAG_RE.sub('', text))})
    return out


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


def parse_sidebar_raw(wikitext):
    """[(label verbatim, [(target, text)])] for every group with items, in site order."""
    groups, cur = [], None
    for line in wikitext.splitlines():
        if line.lstrip().startswith('<!--'):
            continue
        m2 = re.match(r'^\*\*\s*(.+?)\s*\|\s*(.*?)\s*$', line)
        m1 = re.match(r'^\*\s*(.*?)\s*$', line)
        if m2:
            if cur is not None:
                cur[1].append((m2.group(1).strip(), m2.group(2).strip()))
        elif m1 and not line.startswith('**'):
            label = m1.group(1).strip()
            if label.lower() in ('menu', 'search', 'toolbox', 'languages') or not label:
                cur = None
                continue
            cur = (label, [])
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


def parse_nav(body):
    """A page's ==Navigation== block -> {prev, next, end, proceed, ret} (titles / hrefs, unresolved)."""
    nav = {}
    for line in body.splitlines():
        s = line.strip().lstrip('*').strip()
        low = s.lower()
        wl = WIKI_LINK_RE.findall(s)
        ext = EXT_LINK_RE.findall(s)
        if low.startswith('previous topic'):
            nav['prev'] = wl[0][0].strip() if wl else None
        elif low.startswith('next topic'):
            if wl:
                nav['next'] = wl[0][0].strip()
            else:
                nav['end'] = html.unescape(TAG_RE.sub('', s.split(':', 1)[-1])).strip()
        elif low.startswith('proceed to'):
            if ext:
                nav['proceed'] = {'href': ext[0][0], 'title': ext[0][1].strip()}
            elif wl:
                nav['proceed'] = {'href': 'wiki:' + wl[0][0].strip(), 'title': (wl[0][1] or wl[0][0]).strip()}
        elif low.startswith('return to'):
            nav['ret'] = wl[0][0].strip() if wl else None
    return nav


def parse_related(body):
    """A ==Related Topics== body -> (items in site order, groups). An item is (href, label);
    groups are [(label or None, [item index])], present only when the list is sub-headed."""
    items, groups, cur = [], [], None
    for line in body.splitlines():
        s = line.strip()
        lab = re.match(r"^(?:<b>|''')(.+?)(?:</b>|''')\s*$", s)
        if lab and not s.startswith('*'):
            cur = (html.unescape(TAG_RE.sub('', lab.group(1))).strip(), [])
            groups.append(cur)
            continue
        if re.match(r'^_{5,}\s*$', s):
            cur = (None, [])
            groups.append(cur)
            continue
        for m in re.finditer(r'\[\[([^\]|]+)(?:\|([^\]]*))?\]\]|\[(https?://[^\s\]]+)\s+([^\]]*)\]', s):
            if m.group(1):
                items.append(('wiki:' + m.group(1).strip(), (m.group(2) or m.group(1)).strip()))
            else:
                items.append((m.group(3), html.unescape(TAG_RE.sub('', m.group(4))).strip()))
            if cur is not None:
                cur[1].append(len(items) - 1)
    return items, (groups if any(g[0] for g in groups) else [])


def parse_about(wikitext):
    """My wiki:About -> {title, see: [titles], alsoSee: [titles]}."""
    out, key = {}, None
    for line in wikitext.splitlines():
        s = line.strip()
        h = HEADING_RE.match(s)
        if h:
            out['title'] = h.group(2).strip()
            continue
        low = TAG_RE.sub('', s).strip().lower()
        if low.startswith('see:'):
            key = 'see'
        elif low.startswith('also see:'):
            key = 'alsoSee'
        for m in WIKI_LINK_RE.finditer(s):
            if key:
                out.setdefault(key, []).append(m.group(1).strip())
    return out


def parse_trumpet_call(body):
    """The Main Page's ==Be a Part of The Trumpet Call== block -> {text, links: [{label, url, note}]}."""
    lines = [x for x in body.splitlines() if x.strip()]
    text_lines, links = [], []
    for line in lines:
        s = line.strip()
        if COPYRIGHT_RE.search(s):
            continue
        if s.startswith('*'):
            for url, label in EXT_LINK_RE.findall(s):
                links.append({'label': label.strip(), 'url': url})
            continue
        t = html.unescape(TAG_RE.sub('', s.replace('<br />', '\n').replace('<br>', '\n')))
        t = '\n'.join(x.strip() for x in t.split('\n')).strip()
        if links and t.startswith('*'):
            links[-1]['note'] = t
        elif t:
            for url, label in EXT_LINK_RE.findall(t):
                links.append({'label': label.strip(), 'url': url})
            text_lines.append(EXT_LINK_RE.sub(lambda m: m.group(2), t))
    return {'text': '\n'.join(text_lines), 'links': links}


def slugify(title):
    s = title.replace('’', '').replace("'", '').replace('�', '')
    s = re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-').lower()
    return s or 'entry'


def word_count(paras):
    return sum(len(re.findall(r"[^\W_]+(?:[’'][^\W_]+)*", plain_text(p['text']))) for p in paras)


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
  // The Blessed's text rides along: a bare The_Blessed link is resolved by the passage's lines; the
  // Words To Live By text resolves a link that names only a #:~:text= fragment.
  const entries = arr.filter(e => e && e.id && e.title).map(e => (['blessed', 'wtlb1', 'wtlb2'].includes(r.volKey)
    ? { id: e.id, title: e.title, text: (e.paragraphs || []).map(p => (p && p.text) || '').join('\n') }
    : { id: e.id, title: e.title }));
  const pref = r.prefaceGlobal && ctx[r.prefaceGlobal]; if (pref && pref.id && pref.title) entries.unshift({ id: pref.id, title: pref.title });
  return Object.assign({}, r, { entries });
});
process.stdout.write(JSON.stringify(out));
"""

STUDIES_SNIPPET = r"""
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(process.env.VOT_REPO, 'app/src/main/assets/src/data/bible-studies.js'), 'utf8'), ctx);
process.stdout.write(JSON.stringify((ctx.BIBLE_STUDIES || []).map(s => ({ id: s.id, title: s.title }))));
"""


def load_app_collections(repo):
    r = subprocess.run(['node', '-e', NODE_SNIPPET], capture_output=True, text=True, encoding='utf-8',
                       env=dict(os.environ, VOT_REPO=repo))
    if r.returncode != 0:
        sys.exit('node failed: ' + r.stderr[:500])
    return json.loads(r.stdout)


def load_studies(repo):
    """{norm_title(site page title): study id} for the Bible/Letter Studies the app carries, with the
    site's own spelling of a study's page (SITE_ALIASES in src/utils/site-link.js)."""
    r = subprocess.run(['node', '-e', STUDIES_SNIPPET], capture_output=True, text=True, encoding='utf-8',
                       env=dict(os.environ, VOT_REPO=repo))
    if r.returncode != 0:
        sys.exit('node failed: ' + r.stderr[:500])
    studies = json.loads(r.stdout)
    aliases = {}
    try:
        with open(os.path.join(repo, 'app/src/main/assets/src/utils/site-link.js'), encoding='utf-8') as f:
            src = f.read()
        blk = src[src.index('export const SITE_ALIASES'):]
        blk = blk[:blk.index('};')]
        for a, b in re.findall(r"^\s*'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)',?\s*$", blk, re.M):
            aliases[a] = b
    except (OSError, ValueError):
        pass
    out = {}
    for s in studies:
        out[norm_title(s['title'])] = s['id']
        if s['title'] in aliases:
            out[norm_title(aliases[s['title']])] = s['id']
    return out


# ─── Link resolution (after every entry exists) ─────────────────────────
class Resolver:
    """Topic titles, site URLs and letter URLs -> the sidecar fields of an in-app destination."""

    def __init__(self, by_title, redirects, anchors, matcher, studies, stats, bitly=None):
        self.redirects, self.anchors, self.matcher, self.studies, self.stats = redirects, anchors, matcher, studies, stats
        self.bitly = bitly or {}
        self.by_key = {}
        for t, e in by_title.items():
            self.by_key[norm(t)] = e
        for frm in redirects:
            tgt = by_title.get(follow_redirects(frm, redirects))
            if tgt:
                self.by_key.setdefault(norm(frm), tgt)

    def topic(self, title):
        key = norm(title)
        e = self.by_key.get(key)
        if not e and key in TOPIC_FIXUPS:
            e = self.by_key.get(norm(TOPIC_FIXUPS[key]))
            if e:
                self.stats['topic_fixups'].append((title, e['id']))
        return e

    def _anchor(self, e, frag, out):
        """Put frag on `out` as an anchor (the target's own spelling) or a text fragment."""
        if not frag:
            return
        if ':~:text=' in frag:
            head, _, tf = frag.partition(':~:text=')
            out['textFragment'] = urllib.parse.unquote(tf)
            frag = head.rstrip('#')
            if not frag:
                return
        key = anchor_key(frag)
        for k, a in (self.anchors.get(e['id'], []) if e else []):
            if k == key:
                out['anchor'] = a
                return
        # A dead anchor that names a page goes to that page ("#Come_Out_and_Fight_Against_Me").
        t2 = self.topic(mw_anchor(frag).replace('_', ' '))
        if t2 and t2 is not e:
            out['id'] = t2['id']
            self.stats['anchor_retargeted'].append((frag, t2['id']))
            return
        out['anchor'] = mw_anchor(frag)
        self.stats['anchor_dead'].append(((e or {}).get('id'), frag))

    def href(self, href):
        href = (href or '').split('<')[0]
        if href.startswith('wiki:'):
            title, _, frag = href[5:].partition('#')
            return self._topic_fields(title, frag, None)
        href = self.bitly.get(href, href)  # a bit.ly link is followed to where it goes
        try:
            u = urllib.parse.urlsplit(href)
        except ValueError:
            return {'kind': 'external', 'url': href}
        host = u.netloc.lower()
        qs = urllib.parse.parse_qs(u.query)
        # A Bible-site keyword search ("full of the knowledge"): the site's own search, not a citation.
        if 'biblegateway.com' in host and 'quicksearch' in u.path:
            out = {'kind': 'search', 'query': qs.get('quicksearch', [''])[0].strip().strip('"'), 'scope': 'biblegateway.com'}
            if qs.get('version'):
                out['version'] = qs['version'][0].upper()
            out['url'] = href
            return out
        if 'biblestudytools.com' in host and '/search/' in u.path:
            out = {'kind': 'search', 'query': qs.get('q', [''])[0].strip().strip('"'), 'scope': 'biblestudytools.com'}
            if qs.get('t'):
                out['version'] = qs['t'][0].upper()
            out['url'] = href
            return out
        if 'answersonlygodcangive.com' in host:
            path = urllib.parse.unquote(u.path).lstrip('/')
            if path.lower().startswith('index.php'):
                if qs.get('search'):
                    return {'kind': 'search', 'query': qs['search'][0], 'scope': 'answers', 'url': href}
                path = qs.get('title', [''])[0]
            return self._topic_fields(path.replace('_', ' '), u.fragment, href)
        if 'google.' in host and u.path.startswith('/search'):
            q = urllib.parse.parse_qs(u.query).get('q', [''])[0]
            scope = ''
            mm = re.search(r'site:(\S+)', q)
            if mm:
                scope = mm.group(1)
            query = re.sub(r'site:\S+', '', q).strip().strip('"').strip()
            out = {'kind': 'search', 'query': query}
            if scope:
                out['scope'] = scope
            out['url'] = 'https://www.google.com/search?q=' + urllib.parse.quote_plus(q)
            return out
        if 'trumpetcallofgodonline.com' in host and qs.get('title'):
            # The Volumes of Truth's old address (index.php5?title=Poured_Out): the same letter titles.
            alias = 'https://www.thevolumesoftruth.com/' + qs['title'][0].replace(' ', '_')
            au = urllib.parse.urlsplit(alias)
            if self.matcher.quiet_match(alias) or self.studies.get(norm_title(slug_to_title(au.path.lstrip('/')))):
                out = self.href(alias)
                out['url'] = href
                return out
        if 'thevolumesoftruth.com' in host:
            frag, tf = u.fragment, None
            if ':~:text=' in frag:
                frag, _, tf = frag.partition(':~:text=')
                frag = frag.rstrip('#')
            m = self.matcher.quiet_match(urllib.parse.urlunsplit(u._replace(fragment=frag)))
            if not m and tf and not frag and 'Words_To_Live_By' in u.path:
                # "Words_To_Live_By:_Part_One#:~:text=Demand nothing of,The Lord YahuShua." names no entry;
                # the words it highlights do. (A text directive is [prefix-,]start[,end][,-suffix].)
                parts = [x for x in urllib.parse.unquote(tf).split(',') if not x.endswith('-')]
                part = 'wtlb1' if 'Part_One' in u.path else ('wtlb2' if 'Part_Two' in u.path else None)
                if parts:
                    m = self.matcher.by_text((part,) if part else ('wtlb1', 'wtlb2'), parts[0])
            if m:
                out = {'kind': 'letter', 'collection': attr_label(m), 'title': m['title']}
                compilation = 'Words_To_Live_By' in u.path or 'The_Blessed' in u.path
                if frag and not compilation:
                    out['anchor'] = mw_anchor(frag)
                if tf:
                    out['textFragment'] = urllib.parse.unquote(tf)
                out['url'] = href
                return out
            # A study's page title holds a '/' ("Grace AND The Law (Bible/Letter Study)").
            sid = self.studies.get(norm_title(slug_to_title(u.path.lstrip('/'))))
            if sid:
                out = {'kind': 'study', 'id': sid}
                if frag:
                    out['anchor'] = mw_anchor(frag)
                out['url'] = href
                return out
            self.stats['tvot_external'][href] += 1
        return {'kind': 'external', 'url': href}

    def _topic_fields(self, title, frag, url):
        e = self.topic(title)
        out = {'kind': 'topic', 'id': e['id'] if e else None}
        if not e:
            out['url'] = url or SITE + '/' + urllib.parse.quote(title.strip().replace(' ', '_'), safe="/:,()'._-")
            self.stats['topic_unresolved'][title] += 1
        self._anchor(e, frag, out)
        return out


def resolve_entry(e, side, R, stats):
    """Turn an entry's raw sidecars (hrefs, titles) into its final fields, in place."""
    def fill(items):
        for it in items:
            href = it.pop('_href')
            it.update(R.href(href))
        return items

    links = {str(n): fill(v) for n, v in sorted(side['links'].items()) if v}
    bare = {str(n): fill(v) for n, v in sorted(side['bare'].items()) if v}
    # Note refs in a footnote paragraph ("A. Acts 17:30") become tappable scripture links.
    notes = {}
    for n, items in sorted(side['notes'].items()):
        for it in items:
            it['note'] = find_note(e['paragraphs'], n, it['marker'])
            if it['note'] is None:
                stats['notes_unlinked'].append((e['id'], n, it['marker']))
            else:
                add_note_refs(e['paragraphs'], it['note'], links)
        notes[str(n)] = items
    for n, items in links.items():
        items.sort(key=lambda x: x['at'])
    return links, bare, notes


def find_note(paras, n, marker):
    """The paragraph a <sup> marker points at: the next one opening with "1." / "[1]" / "A." (on any
    line), else an <ol> footnote rendered as "↑ ..."."""
    mk = marker.strip().strip('[]')
    for k in range(n, len(paras)):
        for line in paras[k]['text'].split('\n'):
            s = line.lstrip('•').strip().lstrip('*_').strip()
            if k > n and (s.startswith(mk + '. ') or s.startswith('[' + mk + ']')):
                return k
            if k == n:
                continue
    for k in range(n + 1, len(paras)):
        s = paras[k]['text'].lstrip('•').strip().lstrip('*_').strip()
        if s.startswith('↑'):
            return k
    return None


SCRIPTURE_IN_TEXT_RE = re.compile(r'\b((?:[1-3] )?[A-Z][a-z]+(?: of [A-Z][a-z]+)?) (\d+):(\d+(?:-\d+)?)')


def add_note_refs(paras, k, links):
    """Scripture named in a footnote paragraph -> links {kind: 'scripture', ref}."""
    t = paras[k]['text']
    u16 = U16(t)
    have = {(x['at'], x.get('ref')) for x in links.get(str(k), [])}
    for m in SCRIPTURE_IN_TEXT_RE.finditer(t):
        refs = canon_refs(m.group(0))
        if not refs or (u16(m.start()), refs[0]) in have:
            continue
        s = m.group(0)
        links.setdefault(str(k), []).append({'text': s, 'occ': occ_of(t, s, m.start()), 'at': u16(m.start()), 'kind': 'scripture', 'ref': refs[0]})


# ─── Main ───────────────────────────────────────────────────────────────
def convert_page(title, wikitext, html_secs, ctx, main=False):
    """One site page -> (paragraphs, side, related titles, related-more items, groups, nav, media)."""
    bitly, matcher, stats = ctx['bitly'], ctx['matcher'], ctx['stats']
    related, rel_items, rel_groups, nav, end_media = [], [], [], {}, []
    blocks = []
    heads = section_meta(wikitext, html_secs, stats)
    for k, (heading, body) in enumerate(split_sections(wikitext)):
        h = (heading or '').strip().lower()
        if main and heading is None:
            continue  # the Main Page's banner + "ANSWERS ONLY GOD CAN GIVE / OFFICIAL WEBSITE" go to the hero
        if h == 'related topics':
            related.extend(re.findall(r'\[\[([^\]|]+)', body))
            items, groups = parse_related(body)
            base = len(rel_items)
            rel_items.extend(items)
            rel_groups.extend((g[0], [i + base for i in g[1]]) for g in groups)
            continue
        if h == 'navigation':
            nav.update(parse_nav(body))
            continue
        # 'videos': the site's YouTube playlist / channel links. They used to be dropped (a dead
        # "(Video-Playlist)" line on 11 pages); they ride in `media` (at 'end', the Watch block) now,
        # still outside the paragraphs, so no earlier paragraph moves.
        if h == 'videos':
            for url, label in EXT_LINK_RE.findall(body):
                kind = media_kind(url)
                if kind:
                    end_media.append(media_item(kind, html.unescape(TAG_RE.sub('', label)), url, 'end'))
            continue
        if h in ('see also', 'external links'):
            stats['dropped_sections'].append((title, heading))
            continue
        p = Parser()
        if heading:
            hb = _heading_block(heading)
            hb.sec = heads[k - 1] if 0 < k <= len(heads) else None
            p.blocks.append(hb)
        p.feed(wiki_to_html(body))
        p.close()
        blocks.extend(p.blocks)
    side = {}
    paras = blocks_to_paragraphs(blocks, bitly, matcher, stats, side)
    side['media'].extend(end_media)
    return paras, side, related, rel_items, rel_groups, nav


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', required=True)
    ap.add_argument('--fetch', action='store_true')
    ap.add_argument('--repo', default=REPO)
    ap.add_argument('--out', default=None)
    ap.add_argument('--against', default=None,
                    help='the answers.js the refusal rule compares with (default: the --out file as it is on disk)')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--accept-shift', action='store_true',
                    help='write even when a kept paragraph moves or a topic\'s paragraph count changes '
                         '(it carries readers\' highlights with it)')
    ap.add_argument('--accept-text-change', action='store_true',
                    help='write even when a shipped paragraph changes other than by a {{ref:}} insertion')
    a = ap.parse_args()
    if a.fetch:
        fill_cache(a.cache)
    out_path = a.out or os.path.join(a.repo, 'app/src/main/assets/src/data/answers.js')
    against = a.against or out_path

    pages = jload(os.path.join(a.cache, 'allpages-nonredir.json'))['query']['allpages']
    redirects = jload(os.path.join(a.cache, 'redirect-map.json'))
    bitly = {k: v for k, v in jload(os.path.join(a.cache, 'bitly-map.json')).items() if not v.startswith('ERR')}
    sidebar_wt = jload(os.path.join(a.cache, 'sidebar.json'))['parse']['wikitext']
    sidebar = parse_sidebar(sidebar_wt)
    sidebar_raw = parse_sidebar_raw(sidebar_wt)
    cols = load_app_collections(a.repo)
    studies = load_studies(a.repo)
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
    # The site's own groups, verbatim: topic groups are the ones whose items are pages, not URLs.
    topic_groups = [(lab, items) for lab, items in sidebar_raw if not any(t.startswith('http') for t, _ in items)]
    site_group_of = {}
    for gi, (lab, items) in enumerate(topic_groups, 1):
        for t, txt in items:
            g = {'n': gi, 'label': lab}
            if txt and txt != t:
                g['text'] = txt
            site_group_of.setdefault(t, g)

    stats = {'refs': 0, 'refs_unparsed': [], 'ref_words_kept': 0, 'topic_links': 0, 'paras': 0, 'skipped': [],
             'attr_wording': collections.Counter(), 'attr_nonstd': [], 'refmeta_versions': collections.Counter(),
             'locate_miss': 0, 'u_runs': 0, 'bare_orphans': 0, 'html_headings': 0, 'section_unmatched': [],
             'dropped_sections': [], 'topic_fixups': [], 'anchor_retargeted': [], 'anchor_dead': [],
             'topic_unresolved': collections.Counter(), 'tvot_external': collections.Counter(), 'notes_unlinked': []}
    ctx = {'bitly': bitly, 'matcher': matcher, 'stats': stats}
    entries, by_title, raw = [], {}, {}
    anchors = {}

    def html_sections(t):
        fn = cache_file(a.cache, 'html', t)
        return jload(fn).get('sections', []) if os.path.exists(fn) else []

    def build_entry(title, wikitext, eid, group, main=False):
        secs = html_sections(title)
        paras, side, related, rel_items, rel_groups, nav = convert_page(title, wikitext, secs, ctx, main)
        if not paras:
            return None
        disp = title.replace('�', '’') if not main else MAIN_TITLE
        e = {
            'id': eid, 'num': 0, 'title': disp, 'type': 'wtlb',
            'sourceLabel': 'answersonlygodcangive.com',
            'group': group,
            'groupShort': group.replace('Thus Says The Lord…', 'Thus Says…'),  # index-row eyebrow
            'siteUrl': SITE + '/' + urllib.parse.quote(title.replace(' ', '_'), safe="/:,()'._-"),
            'related': related,  # resolved to ids below
            'paragraphs': paras,
        }
        anchors[eid] = [(anchor_key(s.get('line', '')), s.get('anchor')) for s in secs if s.get('anchor')]
        raw[eid] = {'side': side, 'rel_items': rel_items, 'rel_groups': rel_groups, 'nav': nav, 'title': title}
        return e

    for title in order:
        if title not in real_titles:
            stats['skipped'].append(('not a page', title))
            continue
        if title == MAIN_PAGE or title.startswith("''"):
            stats['skipped'].append(('utility', title))
            continue
        wikitext = jload(cache_file(a.cache, 'wikitext', title))['wikitext']
        if len(wikitext) < 200:
            stats['skipped'].append(('stub', title))
            continue
        disp = title.replace('�', '’')
        eid = slugify(disp)
        if eid in taken_ids:
            eid = 'answers-' + eid
        e = build_entry(title, wikitext, eid, group_of[title])
        if e is None:
            stats['skipped'].append(('empty', title))
            continue
        taken_ids.add(eid)
        entries.append(e)
        by_title[title] = e
        stats['paras'] += len(e['paragraphs'])
        if a.limit and len(entries) >= a.limit:
            break
    topic_refs = stats['refs']

    # The Main Page, appended LAST: highlights key on id + paragraph index, so array position is free.
    main_wt = jload(cache_file(a.cache, 'wikitext', MAIN_PAGE))['wikitext']
    main_e = build_entry(MAIN_PAGE, main_wt, MAIN_ID, 'Main Page', main=True)
    main_e['siteUrl'] = SITE + '/Main_Page'
    entries.append(main_e)
    by_title[MAIN_PAGE] = main_e
    main_head = split_sections(main_wt)[0][1]
    banner = re.search(r'\[\[\s*(?:File|Image)\s*:([^\]|]+)', main_head, re.I)
    if banner:
        raw[MAIN_ID]['side']['media'].insert(0, image_item(banner.group(1).strip(), MAIN_TITLE, -1))
    center = re.search(r'<center>(.*?)</center>', main_head, re.S | re.I)
    main_header = []
    if center:
        for ln in re.split(r'<br\s*/?>', center.group(1), flags=re.I):
            t = html.unescape(TAG_RE.sub('', re.sub(r'__(?:FORCE|NO)?TOC__', '', ln))).strip()
            if t:
                main_header.append(t)
    # "- See left column for all topics": the site's pointer to its contents (the sidebar).
    for n, p in enumerate(main_e['paragraphs']):
        i = p['text'].find('See left column for all topics')
        if i >= 0:
            i = p['text'].rfind('-', 0, i + 1) if p['text'][max(0, i - 2):i].strip() == '-' else i
            t = p['text'][i:p['text'].find('topics', i) + len('topics')]
            u16 = U16(p['text'])
            raw[MAIN_ID]['side']['links'].setdefault(n, []).append(
                {'text': t, 'occ': occ_of(p['text'], t, i), 'at': u16(i), '_href': 'contents:'})
            break

    R = Resolver(by_title, redirects, anchors, matcher, studies, stats, bitly)
    orig_href = R.href
    R.href = lambda h: {'kind': 'contents'} if h == 'contents:' else orig_href(h)

    def resolve_title(t):
        return R.topic(t.strip())

    num = 0
    for e in entries:
        is_main = e['id'] == MAIN_ID
        if not is_main:
            num += 1
        e['num'] = 0 if is_main else num
        rel = []
        for t in e['related']:
            tgt = resolve_title(t)
            if tgt and tgt is not e and tgt['id'] not in [r['id'] for r in rel]:
                rel.append({'id': tgt['id'], 'title': tgt['title']})
        e['related'] = rel
        r = raw[e['id']]
        side = r['side']
        title = r['title']
        # siteGroup
        if is_main:
            e['siteGroup'] = {'n': 0, 'label': 'Main Page'}
        else:
            e['siteGroup'] = site_group_of.get(title, {'n': None, 'label': 'Unlisted'})
        # siteNav
        nav = {}
        for key in ('prev', 'next', 'ret'):
            if key in r['nav']:
                tgt = resolve_title(r['nav'][key]) if r['nav'][key] else None
                nav[key] = tgt['id'] if tgt else None
                if r['nav'][key] and not tgt:
                    stats['topic_unresolved']['nav:' + r['nav'][key]] += 1
        if 'end' in r['nav']:
            nav['end'] = r['nav']['end']
        if r['nav'].get('proceed'):
            pr = R.href(r['nav']['proceed']['href'])
            nav['proceed'] = dict({'title': r['nav']['proceed']['title']}, **pr)
        if nav:
            e['siteNav'] = nav
        if side['sections']:
            e['sections'] = side['sections']
        if side['media']:
            e['media'] = side['media']
        links, bare, notes = resolve_entry(e, side, R, stats)
        if links:
            e['links'] = links
        if bare:
            e['bareLinks'] = bare
        # relatedMore: the full-URL Related Topics links ([[...]] ones stay in `related`)
        more = []
        for pos, (href, label) in enumerate(r['rel_items']):
            if href.startswith('wiki:'):
                continue
            f = R.href(href)
            item = {'id': f.get('id') if f['kind'] == 'topic' else None, 'title': label}
            if f.get('anchor'):
                item['anchor'] = f['anchor']
            if f['kind'] == 'letter':
                item['letter'] = {'collection': f['collection'], 'title': f['title']}
            item['url'] = href
            item['pos'] = pos
            more.append(item)
        if more:
            e['relatedMore'] = more
        if r['rel_groups']:
            groups = []
            for lab, idxs in r['rel_groups']:
                items = []
                for i in idxs:
                    href, label = r['rel_items'][i]
                    f = R.href(href)
                    it = {'id': f.get('id'), 'title': label}
                    if f.get('anchor'):
                        it['anchor'] = f['anchor']
                    items.append(it)
                groups.append({'label': lab, 'items': items})
            e['relatedGroups'] = groups
        if side['refmeta']:
            e['refMeta'] = {str(n): v for n, v in sorted(side['refmeta'].items())}
        if side['marks']:
            e['marks'] = {str(n): v for n, v in sorted(side['marks'].items())}
        if notes:
            e['notes'] = notes
        if side['attr']:
            e['attr'] = {str(n): v for n, v in sorted(side['attr'].items())}
        e['words'] = word_count(e['paragraphs'])

    url_index = dict((k, e['id']) for k, e in R.by_key.items())

    # ── siteMeta: the sidebar extras, the About page, the Main Page's own blocks ──
    flat = by_title.get('Regarding the Flat Earth Theory')
    end_card = None
    for e in entries:
        if e.get('siteNav', {}).get('end'):
            end_card = e['siteNav']['end']
            break
    sister, promo = [], None
    for lab, items in sidebar_raw:
        if lab.lower().startswith('sister sites'):
            sister = [{'label': txt, 'url': url} for url, txt in items]
        elif lab.lower().startswith('site promotion') and items:
            url, txt = items[0]
            mm = re.match(r'^(.*?)\s*\((\*?Note:.*)\)\s*$', txt)
            promo = {'text': txt, 'label': mm.group(1) if mm else txt, 'note': mm.group(2) if mm else None, 'url': url}
    about_fn = cache_file(a.cache, 'html', 'My wiki:About')
    about = parse_about(jload(about_fn).get('wikitext', '')) if os.path.exists(about_fn) else {}
    for key in ('see', 'alsoSee'):
        if key in about:
            about[key] = [{'title': t, 'id': (resolve_title(t) or {}).get('id')} for t in about[key]]
    cr = COPYRIGHT_RE.search(main_wt)
    trumpet = None
    for heading, body in split_sections(main_wt):
        if heading and heading.lower().startswith('be a part of the trumpet call'):
            trumpet = dict({'title': heading}, **parse_trumpet_call(body))
    tag = None
    for p in main_e['paragraphs']:
        if p['text'].startswith('• ') and 'Record Straight' in p['text']:
            tag = plain_text(p['text'][2:])
            break
    mtimes = [os.path.getmtime(os.path.join(a.cache, d, f)) for d in ('wikitext', 'html')
              if os.path.isdir(os.path.join(a.cache, d)) for f in os.listdir(os.path.join(a.cache, d))]
    site_meta = {
        'site': SITE,
        'title': MAIN_TITLE,
        'mainHeader': main_header,
        'tagline': tag,
        'about': about,
        'copyright': html.unescape(TAG_RE.sub('', cr.group(1))).strip() if cr else None,
        'sisterSites': sister,
        'promotion': promo,
        'trumpetCall': trumpet,
        'sidebar': [lab for lab, _ in topic_groups],
        'capturedAt': datetime.date.fromtimestamp(max(mtimes)).isoformat() if mtimes else None,
        'endCard': end_card,
    }
    if flat is None:
        stats['skipped'].append(('no Flat Earth page for the end card', ''))

    # ── The refusal rule: a shipped paragraph may only gain {{ref:}} markers ──
    changed, problems, field_diffs, old_size = text_changes(against, entries)
    shifts = paragraph_shifts(against, entries)
    if field_diffs:
        print('\nOther site differences in fields the app already ships (%d):' % len(field_diffs))
        for d in field_diffs:
            print('  ' + d)
    if changed:
        print('\n%d shipped paragraph(s) gain a {{ref:}} marker (in place, no index moves):' % len(changed))
        for eid, i, added in changed:
            print('  %s:%d  + %s' % (eid, i, ', '.join(added)))
    if shifts:
        print('\nPARAGRAPHS MOVE in %d topic(s) - highlights key on paragraph index (wtlb:<id>:<n>), so marks' % len(shifts))
        print('made on these topics would sit on a different paragraph:')
        for sid, old_i, new_i, n in shifts:
            print('  %s: paragraph %d -> %d (%d kept paragraph(s) move)' % (sid, old_i, new_i, n))
    if problems:
        print('\nREFUSED CHANGES (%d):' % len(problems))
        for p in problems[:40]:
            print('  ' + p)
    if (shifts or any(p.startswith(('LEN', 'GONE')) for p in problems)) and not a.accept_shift:
        sys.exit('refusing to write %s: paragraphs would move or a topic\'s paragraph count changes '
                 '(pass --accept-shift only once the move is intended, and say so in the commit).' % out_path)
    if any(p.startswith('TEXT') for p in problems) and not a.accept_text_change:
        sys.exit('refusing to write %s: a shipped paragraph changes other than by a {{ref:}} insertion '
                 '(pass --accept-text-change only for an intended re-vendor, and say so in the commit).' % out_path)

    n_topics = len(entries) - 1
    # The sidecars ride in their own lazily loaded file: inline they would grow answers.js by ~355 KB,
    # past its 250 KB allowance (D4), and a reader who never taps a link should not download them.
    meta_path = os.path.join(os.path.dirname(out_path), 'answers-meta.js')
    with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// GENERATED by tools/fetch-answers.py from answersonlygodcangive.com — do not hand-edit.\n')
        f.write('// %d topic pages (%d paragraphs, %d scripture refs) + the Main Page, last (%d, %d). Format B (see CLAUDE.md).\n'
                % (n_topics, stats['paras'], topic_refs, len(main_e['paragraphs']), stats['refs'] - topic_refs))
        f.write('// Loaded on demand (src/utils/sync-loaders.js). Highlights key on paragraph\n')
        f.write('// index (wtlb:<id>:<n>), so a regeneration that moves paragraphs moves them.\n')
        f.write('// The sidecars (links, marks, notes, sections, media, ...) are in answers-meta.js.\n')
        f.write('var ANSWERS = [\n')
        for i, e in enumerate(entries):
            core = {k: e[k] for k in CORE_KEYS if k in e}
            f.write(json.dumps(core, ensure_ascii=False, separators=(',', ':')) + (',\n' if i < len(entries) - 1 else '\n'))
        f.write('];\n')
        f.write('// The site around the topics: sidebar, About, the Main Page\'s header and Trumpet Call block.\n')
        f.write('var ANSWERS_SITE_META = ' + json.dumps(site_meta, ensure_ascii=False, separators=(',', ':')) + ';\n')
    with open(meta_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// GENERATED by tools/fetch-answers.py from answersonlygodcangive.com — do not hand-edit.\n')
        f.write('// The sidecars of answers.js, by topic id (loaded on demand: src/utils/sync-loaders.js).\n')
        f.write('// Offsets (`at`) are UTF-16 indices into a paragraph\'s raw `text`; `text` + `occ` re-anchor\n')
        f.write('// a link if they drift. Shapes: the docstring of tools/fetch-answers.py.\n')
        f.write('var ANSWERS_META = {\n')
        for i, e in enumerate(entries):
            meta = {k: v for k, v in e.items() if k not in CORE_KEYS}
            f.write(json.dumps(e['id']) + ':' + json.dumps(meta, ensure_ascii=False, separators=(',', ':'))
                    + (',\n' if i < len(entries) - 1 else '\n'))
        f.write('};\n')

    # The link index ships in bundle-d, always loaded, so a letter's Related
    # Topics row knows it opens in-app before the 2.5 MB corpus is fetched.
    index_path = os.path.join(a.repo, 'app/src/main/assets/src/utils/answers-url-index.js')
    titles = {e['id']: e['title'] for e in entries}
    with open(index_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* GENERATED by tools/fetch-answers.py — do not hand-edit.\n')
        f.write('   Every answersonlygodcangive.com URL key (real titles and the wiki\'s\n')
        f.write('   redirects, followed transitively) -> topic id, and every topic id -> its title. */\n')
        f.write('export const ANSWERS_URL_INDEX = ' + json.dumps(url_index, ensure_ascii=False, indent=2, sort_keys=True) + ';\n')
        f.write('export const ANSWERS_TITLES = ' + json.dumps(titles, ensure_ascii=False, indent=2) + ';\n')

    size = os.path.getsize(out_path)
    print('\nwrote %s (%d bytes, %+d against %s): %d topics + Main Page, %d paragraphs, %d refs in topics (+%d on the Main Page; %d unparsed scripture links), %d topic links kept as text'
          % (out_path, size, size - old_size if old_size else size, os.path.basename(against), n_topics, stats['paras'],
             topic_refs, stats['refs'] - topic_refs, len(stats['refs_unparsed']), stats['topic_links']))
    print('wrote %s (%d bytes)' % (meta_path, os.path.getsize(meta_path)))
    ms = matcher.stats
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
    print_counts(entries, stats, site_meta)


def print_counts(entries, stats, site_meta):
    """The sidecar counts, for comparison with the site audit (brief C5-C9)."""
    C = collections.Counter()
    pages = collections.defaultdict(set)
    topics = [e for e in entries if e['id'] != MAIN_ID]
    for scope, es in (('topics', topics), ('main', [e for e in entries if e['id'] == MAIN_ID])):
        for e in es:
            for items in e.get('links', {}).values():
                for it in items:
                    C[scope + ':links:' + it['kind']] += 1
                    if it['kind'] == 'topic':
                        pages[scope + ':topic'].add(e['id'])
                    if 'thevolumesoftruth.com' in (it.get('url') or '') or it['kind'] in ('letter', 'study'):
                        C[scope + ':links:tvot'] += 1
            for items in e.get('bareLinks', {}).values():
                for it in items:
                    C[scope + ':bare'] += 1
                    C[scope + ':bare:' + it['kind']] += 1
                    pages[scope + ':bare'].add(e['id'])
                    host = urllib.parse.urlsplit(it.get('url') or '').netloc.replace('www.', '') or it['kind']
                    C[scope + ':bare-host:' + host] += 1
                    if it['kind'] == 'topic':
                        pages[scope + ':topic'].add(e['id'])
            if e.get('relatedMore'):
                C[scope + ':relatedMore'] += len(e['relatedMore'])
                pages[scope + ':relatedMore'].add(e['id'])
            if e.get('relatedGroups'):
                C[scope + ':relatedGroups'] += len(e['relatedGroups'])
                C[scope + ':relatedGroups:labelled'] += sum(1 for g in e['relatedGroups'] if g['label'])
            for items in e.get('refMeta', {}).values():
                C[scope + ':refMeta'] += len(items)
            for p in e['paragraphs']:
                C[scope + ':refs'] += len(REF_MARK_RE.findall(p['text']))
            for s in e.get('sections', []):
                C[scope + ':sections'] += 1
                C[scope + ':sections:level%d' % s['level']] += 1
                if s.get('synthetic'):
                    C[scope + ':sections:synthetic'] += 1
                    pages[scope + ':synthetic'].add(e['id'])
                if s['level'] == 2:
                    pages[scope + ':level2'].add(e['id'])
            for a in e.get('attr', {}).values():
                C[scope + ':attr'] += 1
                if 'title' in a:
                    C[scope + ':attr:nonstd'] += 1
                C[scope + ':attr:' + a.get('wording', 'From')] += 1
            for mk in e.get('marks', {}).values():
                C[scope + ':u'] += len(mk.get('u', []))
                C[scope + ':big'] += len(mk.get('big', []))
                C[scope + ':small'] += len(mk.get('small', []))
                C[scope + ':indent'] += 1 if mk.get('indent') else 0
            for items in e.get('notes', {}).values():
                C[scope + ':notes'] += len(items)
            for m in e.get('media', []):
                C[scope + ':media:' + m['kind'] + (':inline' if m.get('inline') else (':end' if m['at'] == 'end' else ''))] += 1
    print('\nsidecar counts (topics = the 121 shipped entries; main = the Main Page):')
    for k in sorted(C):
        print('  %-40s %d' % (k, C[k]))
    for k in sorted(pages):
        print('  pages %-34s %d' % (k, len(pages[k])))
    print('  <u> runs carried                         %d' % stats['u_runs'])
    print('  refMeta versions:', dict(stats['refmeta_versions'].most_common()))
    print('  attribution wording (standard lines):', dict(stats['attr_wording'].most_common()))
    print('  non-standard source lines (%d):' % len(stats['attr_nonstd']))
    for t, w, ia in stats['attr_nonstd']:
        print('     %-14s %-70s -> %s' % (w, t[:70], ia))
    print('  locate misses: %d | bare links with no paragraph of their own: %d | html headings: %d'
          % (stats['locate_miss'], stats['bare_orphans'], stats['html_headings']))
    print('  sections not in the parse API list: %d %s' % (len(stats['section_unmatched']), stats['section_unmatched'][:6]))
    print('  dropped sections (see also / external links):', stats['dropped_sections'])
    print('  topic fixups:', stats['topic_fixups'])
    print('  anchors retargeted to a page:', stats['anchor_retargeted'])
    print('  dead anchors kept (%d):' % len(stats['anchor_dead']), stats['anchor_dead'][:12])
    print('  unresolved topic titles:', dict(stats['topic_unresolved']))
    print('  thevolumesoftruth links with no in-app letter or study (%d distinct): %s'
          % (len(stats['tvot_external']), [u for u, _ in stats['tvot_external'].most_common(8)]))
    print('  notes with no note paragraph:', stats['notes_unlinked'])
    print('  siteMeta keys:', list(site_meta.keys()), '| sidebar groups:', len(site_meta['sidebar']),
          '| sister sites:', len(site_meta['sisterSites']))


def _drop_marks(m):
    close, opened = m.group(1) or '', m.group(3) or ''
    if close and close == opened[::-1]:
        return ''                       # the run the marker closed and reopened is one run again
    return close + opened


def without_refs(t):
    """Paragraph text with its {{ref:}} markers out. A marker set inside an italic or bold run closes
    and reopens it ("Covenant_{{ref:1 Corinthians 5:7-8}}_..._", "**a**{{ref:X}}** b**",
    "**_a_**{{ref:X}}**_ b_**"), so that close-and-reopen pair goes with it, and only that pair: an
    empty "__" or "****" anywhere else is a real change to the words, and the refusal rule sees it."""
    return REF_SPLIT_RE.sub(_drop_marks, t or '')


def text_changes(against, entries):
    """Compare the new entries with the shipped answers.js. Returns (changed, problems, field_diffs, size):
    changed = [(id, index, [added refs])] for paragraphs that only GAIN {{ref:}} markers (in place);
    problems = 'TEXT ...' / 'LEN ...' / 'GONE ...' lines for anything else; field_diffs = changes to the
    fields the shipped file already has, other than paragraphs."""
    if not os.path.exists(against):
        return [], [], [], 0
    old = {}
    with open(against, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line.startswith('{'):
                e = json.loads(line.rstrip(','))
                old[e['id']] = e
    changed, problems, field_diffs = [], [], []
    new_ids = {e['id'] for e in entries}
    for oid in old:
        if oid not in new_ids:
            problems.append('GONE %s' % oid)
    for e in entries:
        was = old.get(e['id'])
        if was is None:
            if e['id'] != MAIN_ID:
                problems.append('NEW %s (only %s may be added)' % (e['id'], MAIN_ID))
            continue
        a, b = was.get('paragraphs', []), e['paragraphs']
        if len(a) != len(b):
            problems.append('LEN %s %d -> %d' % (e['id'], len(a), len(b)))
        for i, (x, y) in enumerate(zip(a, b)):
            if x == y:
                continue
            ra, rb = REF_MARK_RE.findall(x.get('text', '')), REF_MARK_RE.findall(y.get('text', ''))
            same_words = (x.get('align') == y.get('align')
                          and without_refs(x.get('text', '')) == without_refs(y.get('text', '')))
            it = iter(rb)
            kept_in_order = all(r in it for r in ra)  # every old marker survives, in order
            if same_words and kept_in_order and len(rb) > len(ra):
                added = list(rb)
                for r in ra:
                    added.remove(r)
                changed.append((e['id'], i, [r[6:-2] for r in added]))
            else:
                problems.append('TEXT %s:%d\n      was %s\n      now %s' % (
                    e['id'], i, json.dumps(x, ensure_ascii=False)[:300], json.dumps(y, ensure_ascii=False)[:300]))
        for k in sorted(set(was) - {'paragraphs'}):
            if was.get(k) != e.get(k):
                field_diffs.append('%s.%s: %s -> %s' % (e['id'], k, json.dumps(was.get(k), ensure_ascii=False)[:160],
                                                       json.dumps(e.get(k), ensure_ascii=False)[:160]))
    return changed, problems, field_diffs, os.path.getsize(against)


def paragraph_shifts(out_path, entries):
    """Topics whose KEPT paragraphs would move to a new index against the answers.js on disk.

    Highlights, notes and links key on a paragraph's index, so a regeneration that inserts or drops
    a paragraph above one a reader marked moves the mark onto different words; c62 (2026-09-25) did
    it to Regarding Spiritual Gifts from paragraph 88 on and only a screenshot caught it (improvement
    sweep n5-08). Edits in place, and changes after the last kept paragraph, move nothing.
    Returns [(id, first old index, its new index, kept paragraphs that move)]."""
    if not os.path.exists(out_path):
        return []
    old = {}
    with open(out_path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line.startswith('{'):
                e = json.loads(line.rstrip(','))
                old[e['id']] = [p.get('text', '') for p in e.get('paragraphs', [])]
    out = []
    for e in entries:
        was = old.get(e['id'])
        if was is None:
            continue
        now = [p.get('text', '') for p in e['paragraphs']]
        moved, first = 0, None
        for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=was, b=now, autojunk=False).get_opcodes():
            if tag == 'equal' and i1 != j1:
                moved += i2 - i1
                if first is None:
                    first = (i1, j1)
        if moved:
            out.append((e['id'], first[0], first[1], moved))
    return out


def _heading_block(heading):
    b = Block('h2')
    b.runs.append([heading, False, False, None])
    return b


if __name__ == '__main__':
    main()
