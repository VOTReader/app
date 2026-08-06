#!/usr/bin/env python3
"""Ground-truth audit: the app's shipped corpus against the official PDFs, 100% of the words.

    python tools/vot-app-vs-pdf.py

No model is involved and nothing is sampled. Both directions are checked, because they answer
two different questions and only one of them is usually asked:

  app -> PDF   does the app contain anything the PDF does not?   (invented or altered text)
  PDF -> app   does the PDF contain anything the app does not?   (missing text)

Reports coverage per collection and the divergence runs, anchored to a PDF page, so each one can
be opened and adjudicated. A divergence is a QUESTION, not a verdict — the corpus has already
produced three separate cases where the flagged side turned out to be right.

Writes _ocr_out/vot/APP-VS-PDF.json and prints the summary.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "_ocr_out" / "vot"
APP = OUT / "_app-text"

K = 8
MIN_RUN = 2

# Letters and digits are tokenised SEPARATELY, and pure-digit tokens are then dropped.
#
# Two measured reasons, both from this corpus (2026-08-05):
#  - a footnote superscript extracts glued to the word before it ("love1"), so with a naive
#    [a-z0-9]+ tokenizer every footnote in the book breaks an 8-token shingle. Volume One is
#    dense with them, and it alone cost several points of apparent coverage.
#  - page folios and verse numbers appear on one side and not the other.
# This is a WORD-fidelity audit: whether the words match, and in what order. Numbers are
# carried by the structural checks (folio continuity, verse validators), not by this one.
TOKEN = re.compile(r"[a-z]+|[0-9]+")
WORD = re.compile(r"[a-z0-9]+")  # kept for callers that want the raw form


def tokenize(text: str):
    return [t for t in TOKEN.findall(text) if not t.isdigit()]

# (label, app collections, PDFs). App collections are GROUPED to match what a PDF actually
# contains: Flock_Book publishes the Flock letters AND the Timothy letters, and WTLB publishes
# Part One AND The Blessed. Comparing one half of a book against the whole book reports the
# other half as missing — that mistake scored letters-timothy at 21.6% and The Blessed at 15.0%
# on the first run, which looks exactly like catastrophic data loss and was pure mis-pairing.
PAIRS = [
    ("Volume One", ["volume-one"], ["letters-vol1"]),
    ("Volume Two", ["volume-two"], ["letters-vol2"]),
    ("Volume Three", ["volume-three"], ["letters-vol3"]),
    ("Volume Four", ["volume-four"], ["letters-vol4"]),
    ("Volume Five", ["volume-five"], ["letters-vol5"]),
    ("Volume Six", ["volume-six"], ["letters-vol6"]),
    ("Volume Seven", ["volume-seven"], ["letters-vol7"]),
    ("Lord's Rebuke", ["lords-rebuke"], ["Rebuke"]),
    ("Flock + Timothy", ["letters-flock", "letters-timothy"], ["Flock_Book"]),
    ("WTLB One + Blessed", ["wtlb-one", "the-blessed"], ["WTLB"]),
    ("WTLB Two", ["wtlb-two"], ["WTLB2"]),
    ("Matthew study bible", ["matthew"], ["New_Testament_Study_Bible-Matthew"]),
    ("Bible studies", ["bible-studies"],
     ["YAHUSHUA_MoreThanaMan", "THELAMBOFGODstudy"]),
]

# App-side markup that was never printed in the book: markdown emphasis and the reader's own
# inline directives. Left in, these tokens would be counted as text the PDF is "missing".
MARKUP = re.compile(r"\{\{[a-z]+:[^}]*\}\}")

# A contents page lists titles against pagination. The app stores that as navigation structure,
# never as body text, so a contents page has no counterpart on the app side BY CONSTRUCTION and
# comparing it measures nothing. Same classifier as tools/vot-pdf-crosscheck.py.
TOC_LOCATOR = re.compile(r"^\d{1,4}(\s*[-–]\s*\d{1,4})?$")


def is_toc_page(text: str) -> bool:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if len(lines) < 6:
        return False
    return sum(1 for ln in lines if TOC_LOCATOR.match(ln)) / len(lines) >= 0.33


def app_tokens(names: list):
    """BODY text only. The app's apparatus -- the NKJV footnote dictionary, cross-reference
    lists, see-also excerpts -- is text the app ADDS and the source PDFs never printed, so
    including it makes a faithful corpus look divergent (volume-one scored 72% that way)."""
    out = []
    for name in names:
        p = APP / f"{name}.json"
        if not p.exists():
            continue
        out.extend(json.loads(p.read_text(encoding="utf-8"))["strings"])
    if not out:
        return None
    return tokenize(MARKUP.sub(" ", " ".join(out).lower()))


def pdf_tokens_with_pages(slugs: list):
    toks, pages = [], []
    for slug in slugs:
        inv_p = OUT / slug / "inventory.json"
        if not inv_p.exists():
            continue
        inv = json.loads(inv_p.read_text(encoding="utf-8"))
        for m in inv["pages"]:
            n = m["page"]
            f = OUT / slug / f"page_{n - 1:04d}.txt"
            if not f.exists():
                continue
            t = re.sub(r"-\s*\n\s*", "", f.read_text(encoding="utf-8").lower())
            found = tokenize(t)
            toks.extend(found)
            pages.extend([f"{slug}:{n}"] * len(found))
    return toks, pages


def shingles(toks):
    return [" ".join(toks[i:i + K]) for i in range(max(0, len(toks) - K + 1))]


def runs_of(missing, anchors, toks):
    out, start, prev = [], None, None
    for i in missing:
        if start is None:
            start = prev = i
        elif i == prev + 1:
            prev = i
        else:
            out.append((start, prev))
            start = prev = i
    if start is not None:
        out.append((start, prev))
    out = [r for r in out if r[1] - r[0] + 1 >= MIN_RUN]
    detail = []
    for a, b in sorted(out, key=lambda r: r[1] - r[0], reverse=True)[:15]:
        detail.append({
            "anchor": anchors[a] if anchors and a < len(anchors) else None,
            "approx_words": b - a + K,
            "head": " ".join(toks[a:a + K]),
        })
    return len(out), detail


def cover(sub_toks, sup_toks, sub_anchors=None):
    sup = set(shingles(sup_toks))
    sh = shingles(sub_toks)
    missing = [i for i, s in enumerate(sh) if s not in sup]
    nruns, detail = runs_of(missing, sub_anchors, sub_toks)
    return {
        "shingles": len(sh),
        "missing": len(missing),
        "coverage": round((len(sh) - len(missing)) / len(sh), 6) if sh else 0.0,
        "runs": nruns,
        "worst": detail,
    }


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    results = []
    print(f"{'collection':21} {'pdf':30} {'app->pdf':>9} {'pdf->app':>9} {'runs':>6}")
    for name, cols, slugs in PAIRS:
        at = app_tokens(cols)
        pt, pa = pdf_tokens_with_pages(slugs)
        if not at or not pt:
            print(f"{name:21} {','.join(slugs)[:30]:30} {'-':>9} {'-':>9}  (missing side)")
            continue
        a2p = cover(at, pt)
        p2a = cover(pt, at, pa)
        results.append({"collection": name, "app_files": cols, "pdfs": slugs,
                        "app_words": len(at), "pdf_words": len(pt),
                        "app_to_pdf": a2p, "pdf_to_app": p2a})
        print(f"{name:21} {','.join(slugs)[:30]:30} "
              f"{a2p['coverage'] * 100:8.3f}% {p2a['coverage'] * 100:8.3f}% "
              f"{a2p['runs'] + p2a['runs']:6}")

    (OUT / "APP-VS-PDF.json").write_text(
        json.dumps(results, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    if results:
        worst = min(r["app_to_pdf"]["coverage"] for r in results)
        print(f"\n{len(results)} collections compared; lowest app->pdf coverage "
              f"{worst * 100:.3f}%  ->  {OUT / 'APP-VS-PDF.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
