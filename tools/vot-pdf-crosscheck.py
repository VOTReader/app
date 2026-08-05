#!/usr/bin/env python3
"""Leg 1b: the free validator this corpus hands you — the same words, typeset three ways.

The site publishes overlapping editions of identical text: the seven per-volume PDFs, the
combined `letters-vol1_7`, the LARGE PRINT reflow, and the complete `Volumes_Book`. Different
page geometry, different line breaks, same words. So a *deterministic* reader can be checked
against a *deterministic* reader with no model in the loop at all: every shingle of the smaller
edition must appear somewhere in the larger one.

That catches the failure mode sampling cannot — a silently dropped column, a swallowed
hyphenated word, a page whose text layer lied — across 100% of pages instead of every Nth.

    python tools/vot-pdf-crosscheck.py

Writes _ocr_out/vot/CROSSCHECK.json and prints a summary. A run of missing shingles is
reported with the page it starts on so it can be escalated to the page image.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "_ocr_out" / "vot"

K = 8            # shingle length in tokens
MIN_RUN = 2      # consecutive missing shingles before it counts as a divergence

# (subset, superset) — the subset's every word should exist in the superset.
PAIRS = [
    ("letters-vol1", "letters-vol1_7"),
    ("letters-vol2", "letters-vol1_7"),
    ("letters-vol3", "letters-vol1_7"),
    ("letters-vol4", "letters-vol1_7"),
    ("letters-vol5", "letters-vol1_7"),
    ("letters-vol6", "letters-vol1_7"),
    ("letters-vol7", "letters-vol1_7"),
    ("letters-vol1_7", "Volumes_Book"),
    ("letters-vol1_7", "Volumes1_7_LARGE_PRINT"),
    ("Volumes1_7_LARGE_PRINT", "letters-vol1_7"),
    ("WTLB", "WTLB1_2_LARGE_PRINT"),
    ("WTLB2", "WTLB1_2_LARGE_PRINT"),
    ("WTLB", "Volumes_Book"),
    ("WTLB2", "Volumes_Book"),
    ("Rebuke", "Volumes_Book"),
    ("Flock_Book", "Volumes_Book"),
]

WORD = re.compile(r"[a-z0-9]+")
# A contents entry's page locator. In this corpus the text layer emits the title and its
# locator as SEPARATE lines, so the locator is a line that is nothing but a number or a
# number range ("226", "222-225"). Matching "title ... 226" on one line found nothing.
TOC_LOCATOR = re.compile(r"^\d{1,4}(\s*[-–]\s*\d{1,4})?$")


def is_toc_page(text: str) -> bool:
    """A contents page: a third or more of its lines are nothing but a page locator.

    These are the one part of the book that is *supposed* to differ between editions — the
    same titles pointing at different pagination. Comparing them across editions measures the
    typesetting, not the text, so they are excluded from the word-coverage check and listed
    separately. (Adopted after the first run: 99 of 99 divergence runs between the combined
    volumes and the complete book started on a contents page.)
    """
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    if len(lines) < 6:
        return False
    return sum(1 for ln in lines if TOC_LOCATOR.match(ln)) / len(lines) >= 0.33


def tokens_with_pages(slug: str, skip_toc: bool = True):
    """Normalized token stream plus, for each token, the PDF page it came from.

    Normalization is aggressive on purpose: case, punctuation and whitespace are exactly what
    differs between two typesettings of the same sentence, and none of them are the words.
    """
    inv = json.loads((OUT / slug / "inventory.json").read_text(encoding="utf-8"))
    toks, pages, toc_pages = [], [], []
    for meta in inv["pages"]:
        n = meta["page"]
        text = (OUT / slug / f"page_{n - 1:04d}.txt").read_text(encoding="utf-8")
        if is_toc_page(text):
            toc_pages.append(n)
            if skip_toc:
                continue
        # a line-break hyphen is typesetting, not spelling: re-join before tokenizing
        text = re.sub(r"-\s*\n\s*", "", text.lower())
        found = WORD.findall(text)
        toks.extend(found)
        pages.extend([n] * len(found))
    return toks, pages, toc_pages


def shingles(toks):
    return [" ".join(toks[i:i + K]) for i in range(max(0, len(toks) - K + 1))]


def check(sub: str, sup: str, cache: dict) -> dict:
    if sub not in cache:
        cache[sub] = tokens_with_pages(sub)
    if sup not in cache:
        cache[sup] = tokens_with_pages(sup)
    sub_toks, sub_pages, sub_toc = cache[sub]
    sup_toks, _, _ = cache[sup]

    sup_set = set(shingles(sup_toks))
    sub_sh = shingles(sub_toks)
    missing = [i for i, s in enumerate(sub_sh) if s not in sup_set]

    # A shingle that straddles a page break is comparing the two editions' PAGINATION, not
    # their words: the running header, the entry heading and the page's first line land in a
    # different order once the text reflows. Books with short pages have far more of these per
    # word, which is exactly why the 70-words-a-page poetry scored worse than the 240-word
    # prose. Counted separately so the residue is the number that actually means something.
    straddles = sum(1 for i in missing if sub_pages[i] != sub_pages[min(i + K - 1, len(sub_pages) - 1)])
    interior_missing = len(missing) - straddles
    interior_total = sum(1 for i in range(len(sub_sh))
                         if sub_pages[i] == sub_pages[min(i + K - 1, len(sub_pages) - 1)])

    runs, start, prev = [], None, None
    for i in missing:
        if start is None:
            start, prev = i, i
        elif i == prev + 1:
            prev = i
        else:
            runs.append((start, prev))
            start, prev = i, i
    if start is not None:
        runs.append((start, prev))
    runs = [r for r in runs if r[1] - r[0] + 1 >= MIN_RUN]

    detail = []
    for a, b in sorted(runs, key=lambda r: r[1] - r[0], reverse=True)[:12]:
        detail.append({
            "sub_page": sub_pages[a] if a < len(sub_pages) else None,
            "shingles_missing": b - a + 1,
            "approx_words": b - a + K,
            "excerpt_head": " ".join(sub_toks[a:a + K]),
        })
    covered = len(sub_sh) - len(missing)
    return {
        "subset": sub,
        "superset": sup,
        "subset_tokens": len(sub_toks),
        "shingles": len(sub_sh),
        "missing_shingles": len(missing),
        "coverage": round(covered / len(sub_sh), 6) if sub_sh else 0.0,
        "page_straddling_misses": straddles,
        "interior_missing": interior_missing,
        "interior_coverage": round((interior_total - interior_missing) / interior_total, 6)
                             if interior_total else 0.0,
        "divergence_runs": len(runs),
        "toc_pages_excluded": sub_toc,
        "worst": detail,
    }


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    cache, results = {}, []
    print(f"{'subset':26} {'superset':26} {'coverage':>9} {'interior':>9} {'runs':>5}")
    for sub, sup in PAIRS:
        if not (OUT / sub / "inventory.json").exists() or not (OUT / sup / "inventory.json").exists():
            print(f"skip {sub} / {sup}: not extracted")
            continue
        r = check(sub, sup, cache)
        results.append(r)
        print(f"{sub[:26]:26} {sup[:26]:26} {r['coverage'] * 100:8.3f}% "
              f"{r['interior_coverage'] * 100:8.3f}% {r['divergence_runs']:5}")
    (OUT / "CROSSCHECK.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    worst = min((r["coverage"] for r in results), default=1.0)
    print(f"\n{len(results)} pairs; lowest coverage {worst * 100:.3f}% -> {OUT / 'CROSSCHECK.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
