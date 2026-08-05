#!/usr/bin/env python3
"""Leg 1 of the VOT PDF pipeline: deterministic text-layer extraction (PyMuPDF).

    python tools/vot-pdf-extract.py                 # every PDF in source-pdfs/
    python tools/vot-pdf-extract.py Garden.pdf      # one

Per PDF writes _ocr_out/vot/<slug>/:
    page_NNNN.txt   one file per PDF page, cleaned
    all.txt         the whole book with ==== PAGE n ==== markers
    inventory.json  page map, per-page char/word counts, headings, images, flags

Content-independent validators run on every book and land in inventory.json["flags"]:
  - coverage:   every page 1..page_count has a file (no silent gaps)
  - empty:      pages whose text layer is blank or near-blank -> vision leg required
  - thin:       pages far below this book's own median char count -> vision cross-check
  - imageonly:  page has images and no text -> scanned, vision leg required
  - toc_count:  headings found vs a separate count of heading-shaped lines (tripwire)

Nothing here is corrected or paraphrased. The only edits are extraction damage:
ligatures and the soft hyphen. The words are the book's own.
"""
import argparse
import json
import pathlib
import re
import statistics
import sys

import fitz  # PyMuPDF

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "source-pdfs"
OUT = ROOT / "_ocr_out" / "vot"

LIGATURES = {"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl"}
# A page number is a bare number on the first or last few lines. Anywhere else it is content
# (a verse number, a date) and dropping it silently loses data.
BARE_NUMBER = re.compile(r"^\d{1,4}$")
EDGE_LINES = 2
THIN_RATIO = 0.25  # of this book's median page


def clean(text: str) -> str:
    for bad, good in LIGATURES.items():
        text = text.replace(bad, good)
    text = text.replace("­", "")  # soft hyphen
    lines = text.split("\n")
    keep = []
    for i, ln in enumerate(lines):
        s = ln.strip()
        if BARE_NUMBER.match(s) and (i < EDGE_LINES or i >= len(lines) - EDGE_LINES):
            continue
        keep.append(ln.rstrip())
    return "\n".join(keep).strip()


def headings(doc) -> list:
    """Whatever the PDF's own outline says. Deterministic; no guessing from font sizes."""
    out = []
    for lvl, title, page in doc.get_toc(simple=True):
        out.append({"level": lvl, "title": title, "page": page})
    return out


def heading_shaped(pages: list) -> int:
    """Independent count of heading-shaped lines: the tripwire for the outline.

    A VOT letter title line is short, title/upper-cased, and stands alone. This never has
    to be exactly right — it only has to disagree loudly when the outline is missing.
    """
    n = 0
    for text in pages:
        for ln in text.split("\n"):
            s = ln.strip()
            if 4 <= len(s) <= 120 and s == s.upper() and any(c.isalpha() for c in s):
                n += 1
    return n


def extract(pdf: pathlib.Path) -> dict:
    slug = pdf.stem
    dest = OUT / slug
    dest.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf)

    pages, page_meta = [], []
    for i, page in enumerate(doc):
        raw = page.get_text()
        body = clean(raw)
        (dest / f"page_{i:04d}.txt").write_text(body, encoding="utf-8")
        pages.append(body)
        page_meta.append({
            "page": i + 1,
            "label": page.get_label() or "",
            "chars": len(body),
            "words": len(body.split()),
            "images": len(page.get_images(full=True)),
        })

    (dest / "all.txt").write_text(
        "\n".join(f"==== PAGE {i + 1} ====\n{t}" for i, t in enumerate(pages)),
        encoding="utf-8")

    counts = [m["chars"] for m in page_meta]
    median = statistics.median(counts) if counts else 0
    flags = {
        "coverage_ok": all((dest / f"page_{i:04d}.txt").exists() for i in range(doc.page_count)),
        "empty_pages": [m["page"] for m in page_meta if m["chars"] == 0],
        "thin_pages": [m["page"] for m in page_meta
                       if 0 < m["chars"] < max(1, median * THIN_RATIO)],
        "imageonly_pages": [m["page"] for m in page_meta
                            if m["chars"] == 0 and m["images"] > 0],
    }
    toc = headings(doc)
    shaped = heading_shaped(pages)
    flags["outline_headings"] = len(toc)
    flags["heading_shaped_lines"] = shaped
    # Tripwire: an outline claiming far fewer entries than the page bodies show heading-shaped
    # lines means the outline is not the book's structure and must not be trusted as one.
    flags["outline_trustworthy"] = bool(toc) and len(toc) >= shaped * 0.2

    total_chars = sum(counts)
    inv = {
        "source_pdf": pdf.name,
        "slug": slug,
        "page_count": doc.page_count,
        "total_chars": total_chars,
        "total_words": sum(m["words"] for m in page_meta),
        "median_page_chars": median,
        "has_text_layer": total_chars > 200 * doc.page_count * 0.1,
        "pages": page_meta,
        "outline": toc,
        "flags": flags,
        "pdf_metadata": {k: v for k, v in (doc.metadata or {}).items() if v},
    }
    (dest / "inventory.json").write_text(
        json.dumps(inv, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    doc.close()
    return inv


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdfs", nargs="*", help="filenames inside source-pdfs/ (default: all)")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    targets = ([SRC / p for p in a.pdfs] if a.pdfs
               else sorted(SRC.glob("*.pdf"), key=lambda p: p.name.lower()))
    OUT.mkdir(parents=True, exist_ok=True)

    summary = []
    print(f"{'book':38} {'pages':>6} {'words':>9} {'txt?':>5}  flags")
    for pdf in targets:
        if not pdf.exists():
            print(f"MISSING {pdf}")
            continue
        inv = extract(pdf)
        f = inv["flags"]
        bad = []
        if not f["coverage_ok"]:
            bad.append("COVERAGE")
        if f["empty_pages"]:
            bad.append(f"empty×{len(f['empty_pages'])}")
        if f["thin_pages"]:
            bad.append(f"thin×{len(f['thin_pages'])}")
        if f["imageonly_pages"]:
            bad.append(f"SCANNED×{len(f['imageonly_pages'])}")
        if not f["outline_trustworthy"]:
            bad.append("no-outline")
        print(f"{inv['slug'][:38]:38} {inv['page_count']:6} {inv['total_words']:9} "
              f"{'yes' if inv['has_text_layer'] else 'NO':>5}  {' '.join(bad) or 'clean'}")
        summary.append(inv)

    (OUT / "CORPUS.json").write_text(json.dumps(
        [{k: v for k, v in inv.items() if k not in ("pages", "outline")} for inv in summary],
        indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tot_pages = sum(i["page_count"] for i in summary)
    tot_words = sum(i["total_words"] for i in summary)
    print(f"\n{len(summary)} PDFs, {tot_pages} pages, {tot_words:,} words -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
