#!/usr/bin/env python3
"""Render PDF pages to PNG for the vision legs.

    python tools/vot-pdf-render.py Garden.pdf                 # every page
    python tools/vot-pdf-render.py Garden.pdf --every 10      # sample
    python tools/vot-pdf-render.py Garden.pdf --pages 3,7,12  # named pages (1-indexed)

Writes _ocr_out/vot/<slug>/_images/p####.png at 150 dpi (the dpi the reader bench in
docs/OCR-PIPELINE.md was measured at). Skips a page whose PNG already exists.
Prints the absolute path of every rendered page so a subagent can be handed the list.
"""
import argparse
import pathlib
import sys

import fitz

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "source-pdfs"
OUT = ROOT / "_ocr_out" / "vot"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--every", type=int, default=0, help="render every Nth page")
    ap.add_argument("--pages", default="", help="comma list of 1-indexed pages")
    ap.add_argument("--dpi", type=int, default=150)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    pdf = SRC / a.pdf
    doc = fitz.open(pdf)
    if a.pages:
        want = [int(p) for p in a.pages.split(",") if p.strip()]
    elif a.every:
        want = list(range(1, doc.page_count + 1, a.every))
    else:
        want = list(range(1, doc.page_count + 1))

    dest = OUT / pdf.stem / "_images"
    dest.mkdir(parents=True, exist_ok=True)
    for n in want:
        png = dest / f"p{n:04d}.png"
        if not png.exists():
            doc[n - 1].get_pixmap(dpi=a.dpi).save(png)
        print(png)
    doc.close()
    print(f"# {len(want)} pages at {a.dpi} dpi -> {dest}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
