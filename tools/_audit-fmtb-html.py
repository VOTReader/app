#!/usr/bin/env python3
# Audit helper (Format B): parse WTLB One/Two + The Blessed HTML into per-entry
# records (entries are delimited by mw-headline / ltitle headings within one page).
import re, html, json, os

HTML_DIR = r"D:\VOTReader-studio\Downloaded Webssite Source"
FILES = {"words_to_live_by_1": "WTLB One", "words_to_live_by_2": "WTLB Two", "the_blessed": "The Blessed"}
# headings that are NOT content entries
SKIP = {"contents", "relatedtopics", "audio", "audiorecordings", "videos", "navigation", "references", "seealso", "externallinks"}

def strip(s):
    s = re.sub(r"<sup[^>]*class=\"reference\"[^>]*>.*?</sup>", "", s, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    return html.unescape(s)

def norm(s):
    return re.sub(r"\s+", " ", s).strip()

def keyf(t):
    return re.sub(r"[^a-z0-9]", "", (t or "").lower())

# Each heading: <h2 ...><span class="mw-headline" id="...">TITLE</span></h2>  OR  <h2 class="ltitle">TITLE</h2>
HEAD_RE = re.compile(r'<h[1-3][^>]*>(?:<span[^>]*class="mw-headline"[^>]*>(.*?)</span>|<span class="ltitle">(.*?)</span>)\s*</h[1-3]>|<h2 class="ltitle">(.*?)</h2>', re.S)

out = {}
for stem, label in FILES.items():
    content = open(os.path.join(HTML_DIR, stem + ".html"), encoding="utf-8").read()
    # collect heading matches with positions
    heads = []
    for m in re.finditer(r'<h[1-3][^>]*>.*?</h[1-3]>', content, re.S):
        block = m.group(0)
        tm = re.search(r'class="mw-headline"[^>]*>(.*?)</span>', block, re.S) or re.search(r'<h2 class="ltitle">(.*?)</h2>', block, re.S)
        if not tm:
            continue
        title = norm(strip(tm.group(1)))
        heads.append((m.start(), m.end(), title))
    entries = []
    for i, (s, e, title) in enumerate(heads):
        if keyf(title) in SKIP or not title:
            continue
        body_html = content[e: heads[i + 1][0] if i + 1 < len(heads) else len(content)]
        # paragraph text only (skip toc/reference lists)
        body = norm(strip(body_html))
        words = body.split()
        entries.append({
            "title": title,
            "bodyWords": len(words),
            "bodyHead": " ".join(words[:12]),
            "bodyTail": " ".join(words[-12:]),
        })
    out[label] = entries

with open(r"D:\VOTReader-studio\tools\_audit-fmtb-html.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)
print("Extracted Format B HTML records:")
for label, arr in out.items():
    print(f"  {label}: {len(arr)} sections")
