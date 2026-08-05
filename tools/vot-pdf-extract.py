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


EDGE_BAND = 0.08      # top/bottom 8% of the page height is where chrome lives
RUNHEAD_MIN_SHARE = 0.30   # a string must recur in that band on 30% of pages to be chrome


def edge_lines(page) -> list:
    """Short text lines physically sitting in the top or bottom band of the page.

    Position in the extracted text STREAM is not position on the PAGE — this corpus proved it.
    The Matthew study bible emits its running footer ("MATTHEW", the folio, "CHAPTER 9") as the
    FIRST lines of the text layer even though they are printed at the FOOT of the page, so an
    edge heuristic counting lines from the start or end of the stream identifies the wrong ones.
    Geometry is the honest signal: ask where the ink actually is.
    """
    h = page.rect.height
    out = []
    for blk in page.get_text("dict").get("blocks", []):
        for line in blk.get("lines", []):
            y = line["bbox"][1]
            if y > h * EDGE_BAND and y < h * (1 - EDGE_BAND):
                continue
            s = "".join(sp.get("text", "") for sp in line.get("spans", [])).strip()
            if s and len(s) <= 60:
                out.append(s)
    return out


def column_text(page):
    """Re-emit a multi-column page in COLUMN order, or return None if it is single-column.

    Found by the fidelity audit (2026-08-05): the study books set prophecy/fulfilment pages in
    two columns, and PyMuPDF's default stream order emitted the RIGHT column's heading before
    the left column's body. Every word was present — the audit's order-insensitive content score
    was 100% on those pages — but the reading order was wrong, which for this app means a
    prophecy and its fulfilment render interleaved.

    Detection is deliberately conservative: a page is only treated as two-column when its text
    blocks fall into two clean x-clusters that do not overlap and both carry real text. Anything
    ambiguous keeps the default order, because reordering a single-column page would be a much
    worse defect than leaving a rare two-column page alone.
    """
    blocks = [b for b in page.get_text("blocks") if b[6] == 0 and b[4].strip()]
    if len(blocks) < 4:
        return None
    mid = page.rect.width / 2
    left = [b for b in blocks if b[2] <= mid + 5]        # ends before the midline
    right = [b for b in blocks if b[0] >= mid - 5]       # starts after the midline
    spanning = [b for b in blocks if b[0] < mid - 5 and b[2] > mid + 5]
    if len(left) < 2 or len(right) < 2:
        return None
    # every column block must sit wholly on its side, or the page is not cleanly two-column
    if len(left) + len(right) + len(spanning) != len(blocks):
        return None

    def dump(bs):
        return "\n".join(b[4].strip() for b in sorted(bs, key=lambda b: (round(b[1], 1), b[0])))

    # spanning blocks (title, intro paragraph) belong above the columns
    parts = [dump(spanning)] if spanning else []
    parts += [dump(left), dump(right)]
    return "\n".join(p for p in parts if p)


def clean(text: str):
    """Return (cleaned_text, folio) — and never silently discard the folio.

    Stripping the printed page number is right for the body text and wrong to do quietly. The
    folio is the one piece of a page that identifies *which page it is*, independent of its
    content, so it is the natural anchor for checking that any other reader was looking at the
    page it claims. It is returned, recorded per page in inventory.json, and used by
    vot-pdf-adjudicate.py both to reconcile line counts and to catch a reader whose per-page
    records have slipped out of alignment. (Learned 2026-08-05: a vision batch misattributed
    every record by one page, and the folio is what makes that detectable for free.)
    """
    for bad, good in LIGATURES.items():
        text = text.replace(bad, good)
    text = text.replace("­", "")  # soft hyphen
    lines = text.split("\n")
    keep, folio = [], None
    for i, ln in enumerate(lines):
        s = ln.strip()
        if BARE_NUMBER.match(s) and (i < EDGE_LINES or i >= len(lines) - EDGE_LINES):
            if folio is None:
                folio = s
            continue
        keep.append(ln.rstrip())
    return "\n".join(keep).strip(), folio


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

    # Pass 1: what sits in the page's edge bands, and how often. A string is a running head
    # only if it RECURS there across the book — frequency is content-independent, so it cannot
    # mistake a one-off line of text that happens to fall near the page edge for chrome.
    edge_seen, edge_per_page = {}, []
    for page in doc:
        e = edge_lines(page)
        edge_per_page.append(e)
        for s in set(e):
            edge_seen[s] = edge_seen.get(s, 0) + 1
    threshold = max(3, doc.page_count * RUNHEAD_MIN_SHARE)
    running_heads = sorted(s for s, c in edge_seen.items() if c >= threshold and not s.isdigit())

    pages, page_meta, multicol = [], [], []
    for i, page in enumerate(doc):
        col = column_text(page)
        if col is not None:
            multicol.append(i + 1)
        raw = col if col is not None else page.get_text()
        body, folio = clean(raw)
        # Geometry beats stream position: if the stream-order heuristic missed the folio, take
        # the bare number sitting in the page's edge band instead.
        if not folio:
            for s in edge_per_page[i]:
                if s.isdigit() and len(s) <= 4:
                    folio = s
                    break
        if not folio:
            # A folio is not always alone on its line. The Matthew study bible prints
            # "MATTHEW   36   CHAPTER 9" as one composite footer, so the number has to be
            # picked out of a short chrome line rather than matched against the whole line.
            for s in edge_per_page[i]:
                parts = s.split()
                if len(parts) > 6:
                    continue
                nums = [p for p in parts if p.isdigit() and len(p) <= 4]
                if len(nums) == 1:
                    folio = nums[0]
                    break
        (dest / f"page_{i:04d}.txt").write_text(body, encoding="utf-8")
        pages.append(body)
        page_meta.append({
            "page": i + 1,
            "label": page.get_label() or "",
            "folio": folio or "",
            "running_heads": [s for s in edge_per_page[i] if s in running_heads],
            "chars": len(body),
            "words": len(body.split()),
            "lines": len([ln for ln in body.split("\n") if ln.strip()]),
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
    # Folio continuity: consecutive pages that both print a folio should differ by exactly 1.
    # This is content-independent and catches a page map that has gone wrong — a page extracted
    # twice, a page missed, or a PDF whose physical order does not match its printed order.
    folio_breaks = []
    prev_page, prev_folio = None, None
    for m in page_meta:
        if not m["folio"].isdigit():
            continue
        f = int(m["folio"])
        if prev_folio is not None and m["page"] == prev_page + 1 and f != prev_folio + 1:
            folio_breaks.append({"page": m["page"], "folio": f, "prev_folio": prev_folio})
        prev_page, prev_folio = m["page"], f
    # A folio series is only useful if it actually counts. When the extracted numbers do not
    # advance by one across most of the book, the heuristic has picked up something that is not
    # a page number (the Matthew study bible prints "MATTHEW 36 CHAPTER 9" in its footer, and a
    # naive read takes the chapter number), so the honest move is to declare the series
    # untrustworthy and drop it rather than to guess harder. A validator that reports its own
    # unreliability is worth more than a heuristic that quietly emits plausible wrong numbers.
    folio_count = sum(1 for m in page_meta if m["folio"])
    trustworthy = folio_count > 0 and len(folio_breaks) <= max(3, folio_count * 0.05)
    if not trustworthy:
        for m in page_meta:
            m["folio"] = ""
    flags["multicolumn_pages"] = len(multicol)
    flags["multicolumn_sample"] = multicol[:20]
    flags["running_heads"] = running_heads[:20]
    flags["folio_pages"] = folio_count if trustworthy else 0
    flags["folio_pages_rejected"] = 0 if trustworthy else folio_count
    flags["folio_trustworthy"] = trustworthy
    flags["folio_breaks"] = folio_breaks[:20]
    flags["folio_break_count"] = len(folio_breaks)

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
