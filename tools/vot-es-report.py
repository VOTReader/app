#!/usr/bin/env python3
"""How complete is the Spanish mirror, measured against this repo's English corpus?

    python tools/vot-es-report.py

Reads  _ocr_out/spanish/posts/*.json   (produced by tools/vot-es-fetch.mjs)
Writes _ocr_out/spanish/SPANISH.json   -- categorised manifest, app-ready
       _ocr_out/spanish/SPANISH-GAP.md -- the completeness report

The English side is counted from the app's own data files rather than from any document,
because those files are the audited corpus this app actually ships.
"""
import json
import pathlib
import re
import statistics
import sys
from urllib.parse import unquote

ROOT = pathlib.Path(__file__).resolve().parent.parent
ES = ROOT / "_ocr_out" / "spanish"
POSTS = ES / "posts"
DATA = ROOT / "app/src/main/assets/src/data"

# Spanish blog category slug -> the English collection it mirrors, and the app data file.
CATEGORY_MAP = {
    "": ("Words to Live By: Part One", "wtlb-one.js"),
    "parte-2": ("Words to Live By: Part Two", "wtlb-two.js"),
    "los-bendecidos": ("The Blessed", "the-blessed.js"),
    "the-blessed": ("The Blessed", "the-blessed.js"),
}
THIN_WORDS = 20


def english_counts() -> dict:
    out = {}
    for f in ("wtlb-one.js", "wtlb-two.js", "the-blessed.js"):
        p = DATA / f
        if not p.exists():
            continue
        t = p.read_text(encoding="utf-8", errors="ignore")
        nums = re.findall(r'"num"\s*:\s*(\d+)', t) or re.findall(r"\bnum:\s*(\d+)", t)
        out[f] = len(nums)
    return out


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if not POSTS.exists():
        sys.exit("no Spanish posts yet - run tools/vot-es-fetch.mjs first")

    posts = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(POSTS.glob("*.json"))]

    # Membership comes from each section's own index page, NOT from the per-post "category"
    # field: that selector picked up a sidebar link and labelled 350 of 352 posts Part Two.
    # A field that is wrong on 99% of rows while looking perfectly well-formed is exactly the
    # kind of plausible-but-false signal this pipeline exists to refuse.
    mem_file = ES / "MEMBERSHIP.json"
    p1 = set()
    if mem_file.exists():
        mem = json.loads(mem_file.read_text(encoding="utf-8"))
        p1 = {unquote(s).strip().lower() for s in mem.get("parte1", [])}
    by_cat = {}
    for p in posts:
        cat = "" if p["slug"].strip().lower() in p1 else "parte-2"
        p["collection_source"] = "parte1 index" if cat == "" else "remainder (not on parte1 index)"
        by_cat.setdefault(cat, []).append(p)

    eng = english_counts()
    words = [p["words"] for p in posts]
    thin = [p for p in posts if p["words"] < THIN_WORDS]

    lines = []
    add = lines.append
    add("# Spanish mirror — completeness against the English corpus\n")
    add(f"Source: `losvolumenes.wixsite.com/los-volumenes` (Wix blog). "
        f"Enumerated from `blog-posts-sitemap.xml`.\n")
    add(f"- posts fetched: **{len(posts)}**")
    add(f"- total words: **{sum(words):,}**")
    add(f"- median words/entry: {statistics.median(words):.0f}" if words else "")
    add(f"- entries under {THIN_WORDS} words (suspect renders): **{len(thin)}**\n")

    add("## By category\n")
    add("| Spanish category | mirrors | Spanish entries | English entries | gap |")
    add("|---|---|---:|---:|---:|")
    covered_en = set()
    for cat, items in sorted(by_cat.items(), key=lambda kv: -len(kv[1])):
        label, engfile = CATEGORY_MAP.get(cat, (f"UNMAPPED ({cat})", None))
        n_en = eng.get(engfile, 0) if engfile else 0
        if engfile:
            covered_en.add(engfile)
        gap = n_en - len(items) if n_en else 0
        add(f"| `{cat or '(none)'}` | {label} | {len(items)} | {n_en or '—'} | "
            f"{gap if n_en else '—'} |")
    add("")

    # Los Bendecidos is NOT in the blog. Its whole text is rendered inline on one page, so a
    # crawler that walks only blog-posts-sitemap.xml misses that collection entirely while
    # still reporting a total that looks correct. Counted from its headings instead.
    pages_dir = ES / "pages"
    standalone = {}
    if pages_dir.exists():
        for p in sorted(pages_dir.glob("*.json")):
            d = json.loads(p.read_text(encoding="utf-8"))
            standalone[d["name"]] = d
    lb = standalone.get("losbendecidos")
    if lb:
        n_en = eng.get("the-blessed.js", 0)
        add("## Los Bendecidos — inline page, not blog posts\n")
        add(f"- rendered as one page with **{len(lb['headings'])} headings**, "
            f"{lb['words']:,} words, {lb['postLinks']} blog links")
        add(f"- English `the-blessed.js`: **{n_en} sections** (plus its introduction)")
        add(f"- heading count vs English sections+intro: "
            f"{len(lb['headings'])} vs {n_en + 1} — "
            f"{'match' if len(lb['headings']) == n_en + 1 else 'DIFFERS, check by hand'}\n")

    add("## English collections not represented\n")
    missing = [f for f in eng if f not in covered_en and not (f == "the-blessed.js" and lb)]
    add("- none — every English WTLB/Blessed collection is present in the Spanish mirror."
        if not missing else "\n".join(f"- `{f}` ({eng[f]} entries)" for f in missing))
    add("")

    if thin:
        add(f"## Suspect entries (<{THIN_WORDS} words)\n")
        for p in thin[:40]:
            add(f"- `{p['slug']}` — {p['words']} words — {p['url']}")
        add("")

    (ES / "SPANISH-GAP.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    manifest = {
        "source": "https://losvolumenes.wixsite.com/los-volumenes",
        "language": "es",
        "posts": len(posts),
        "total_words": sum(words),
        "categories": {c: len(v) for c, v in by_cat.items()},
        "english_baseline": eng,
        "standalone_pages": {
            k: {"url": v["url"], "headings": v["headings"], "words": v["words"],
                "paragraphs": v["paragraphs"]}
            for k, v in standalone.items() if k == "losbendecidos"
        },
        "entries": [
            {
                "slug": p["slug"],
                "title": p["title"],
                # derived from the section index pages, not the unreliable per-post category
                "collection": ("Words to Live By: Part One"
                               if p["slug"].strip().lower() in p1
                               else "Words to Live By: Part Two"),
                "collection_source": p["collection_source"],
                "scraped_category_UNRELIABLE": p.get("category", ""),
                "url": p["url"],
                "words": p["words"],
                "paragraphs": p["paragraphs"],
            }
            for p in posts
        ],
    }
    (ES / "SPANISH.json").write_text(
        json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    print("\n".join(lines))
    print(f"-> {ES/'SPANISH.json'}  and  {ES/'SPANISH-GAP.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
