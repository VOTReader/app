#!/usr/bin/env python3
# Audit helper: parse the downloaded website HTML into normalized per-letter
# records for HTML<->app comparison. One-shot tool.
import re, html, json, os, sys

HTML_DIR = r"D:\VOTReader-studio\Downloaded Webssite Source"
FILES = {
    "volume_1": "Volume One", "volume_2": "Volume Two", "volume_3": "Volume Three",
    "volume_4": "Volume Four", "volume_5": "Volume Five", "volume_6": "Volume Six",
    "volume_7": "Volume Seven", "lords_rebuke": "The Lord's Rebuke",
    "letters_little_flock": "Letters to the Flock", "letters_from_timothy": "Letters from Timothy",
}

def strip_tags(s):
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<sup[^>]*class=\"reference\"[^>]*>.*?</sup>", "", s, flags=re.S)  # footnote markers
    s = re.sub(r"<a[^>]*class=\"external autonumber\"[^>]*>\[\d+\]</a>", "", s)     # [n] ext links
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s)

def norm(s):
    return re.sub(r"\s+", " ", s).strip()

def get_title(art):
    m = re.search(r'<h2 class="ltitle">(.*?)</h2>', art, re.S)
    if not m:
        m = re.search(r'<h2><span class="mw-headline"[^>]*>(.*?)</span></h2>', art, re.S)
    return norm(strip_tags(m.group(1))) if m else None

def header_lines(art):
    # The metadata header is the FIRST justify-aligned <p> that contains a date
    # or a "From/Wisdom" attribution. Some files wrap each line in its own <em>;
    # tag-strip + <br>-split handles both shapes.
    for m in re.finditer(r'<p style="text-align:\s*justify[^"]*">(.*?)</p>', art, re.S):
        raw = m.group(1)
        txt = strip_tags(raw)
        lines = [norm(l) for l in txt.split("\n") if norm(l)]
        if not lines:
            continue
        joined = " ".join(lines)
        if re.search(r"\bFrom (The Lord|YahuShua|Yah)|Wisdom Given to Timothy|Spoken to Timothy", joined) or re.match(r"^\d", lines[0]):
            return lines
    return []

def body_text(art):
    # Body = all justify/center <p> AFTER the header <p>, up to the first
    # section heading (Related Topics / Audio / Videos / References / Navigation).
    cut = re.search(r'<h2><span class="mw-headline" id="(Related_Topics|Audio|Videos|References|Navigation)"', art)
    region = art[:cut.start()] if cut else art
    ps = list(re.finditer(r'<p style="text-align:\s*(?:justify|center)[^"]*">(.*?)</p>', region, re.S))
    if not ps:
        return "", 0
    # drop the header paragraph (first one containing the date/attribution)
    out = []
    seen_header = False
    for m in ps:
        t = strip_tags(m.group(1))
        joined = norm(t)
        is_header = bool(re.search(r"\bFrom (The Lord|YahuShua|Yah)|Wisdom Given to Timothy", joined)) or bool(re.match(r"^\d{1,2}/\d", joined)) or joined.startswith("(Regarding")
        if not seen_header and is_header:
            seen_header = True
            continue
        out.append(joined)
    body = norm(" ".join(out))
    return body, (len(body.split()) if body else 0)

def footnotes(art):
    # The reference list: <li id="cite_note-N">↑ <content></li>
    out = []
    for m in re.finditer(r'<li id="cite_note-(\d+)">(.*?)</li>', art, re.S):
        n = m.group(1)
        t = strip_tags(m.group(2))
        t = re.sub(r"^\s*↑\s*", "", norm(t))
        out.append({"n": n, "text": norm(t)})
    return out

def related_topics(art):
    m = re.search(r'id="Related_Topics".*?(<ul>.*?</ul>)', art, re.S)
    if not m:
        return []
    return [norm(strip_tags(a)) for a in re.findall(r'<a[^>]*>(.*?)</a>', m.group(1), re.S)]

out = {}
for stem, label in FILES.items():
    path = os.path.join(HTML_DIR, stem + ".html")
    content = open(path, encoding="utf-8").read()
    letters = []
    for art in content.split("<article id=")[1:]:
        title = get_title(art)
        if not title:
            continue
        hl = header_lines(art)
        body, words = body_text(art)
        letters.append({
            "title": title,
            "headerLines": hl,
            "bodyWords": words,
            "bodyHead": " ".join(body.split()[:12]),
            "bodyTail": " ".join(body.split()[-12:]),
            "fnCount": len(footnotes(art)),
            "footnotes": footnotes(art),
            "relatedTopics": related_topics(art),
        })
    out[label] = letters

with open(r"D:\VOTReader-studio\tools\_audit-html.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)

print("Extracted HTML records:")
for label, arr in out.items():
    print(f"  {label}: {len(arr)} letters")

if len(sys.argv) > 1 and sys.argv[1] == "--sample":
    import pprint
    pprint.pprint(out["Volume One"][1])
