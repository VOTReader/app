#!/usr/bin/env python3
# One-shot audit tool: extract every letter-header "occasion" line — the parenthetical
# 4th header line like "(Regarding Thanksgiving)" — from the downloaded website HTML.
# Structure-independent: strips tags, converts <br> to newlines, finds parenthetical header lines.
import re, html, glob, os

HTML_DIR = r"D:\VOTReader-studio\Downloaded Webssite Source"
FORMAT_A = ["volume_1","volume_2","volume_3","volume_4","volume_5","volume_6","volume_7",
            "lords_rebuke","letters_little_flock","letters_from_timothy"]

def strip_tags(s):
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s)

def title_of(article):
    m = re.search(r'<h2 class="ltitle">(.*?)</h2>', article, re.S)
    if not m:
        m = re.search(r'<h2><span class="mw-headline"[^>]*>(.*?)</span></h2>', article, re.S)
    if not m:
        return None
    return re.sub(r"\s+", " ", strip_tags(m.group(1))).strip()

def header_block(article):
    # first justify-aligned <p> after the title — the metadata header
    m = re.search(r'<p style="text-align:\s*justify[^"]*">(.*?)</p>', article, re.S)
    return m.group(1) if m else None

rows = []
for stem in FORMAT_A:
    path = os.path.join(HTML_DIR, stem + ".html")
    with open(path, encoding="utf-8") as f:
        content = f.read()
    for art in content.split("<article id=")[1:]:
        title = title_of(art)
        if not title:
            continue
        hdr = header_block(art)
        if not hdr:
            continue
        lines = [ln.strip() for ln in strip_tags(hdr).split("\n") if ln.strip()]
        # occasion line(s): a header line that is wholly a parenthetical
        occ = [ln for ln in lines if re.match(r"^\(.*\)$", ln)]
        if occ:
            for o in occ:
                rows.append((stem, title, o))

print(f"TOTAL occasion lines (Format A): {len(rows)}\n")
for stem, title, occ in rows:
    print(f"{stem}\t{title}\t{occ}")

# Write a machine-readable TSV for the cross-reference step
with open(r"D:\VOTReader-studio\tools\_occasion-lines.tsv", "w", encoding="utf-8") as f:
    for stem, title, occ in rows:
        f.write(f"{stem}\t{title}\t{occ}\n")
