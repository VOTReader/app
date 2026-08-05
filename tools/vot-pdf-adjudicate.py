#!/usr/bin/env python3
"""Leg 3: adjudicate the vision sample against the text layer, deterministically.

The vision readers are asked for four structural facts per page (first line, last line, line
count, and any element that is not body prose). This compares each against what PyMuPDF
extracted for the same page and reports agreement per category.

Asking for structure rather than a second verbatim transcription is deliberate. A verbatim-vs-
verbatim diff drowns in whitespace and produces no verdict; a first/last-line and line-count
comparison is machine-checkable, and it is exactly what fails when a text layer silently drops
a column, a footnote, or a page's opening heading.

    python tools/vot-pdf-adjudicate.py

Reads  _ocr_out/vot/_vision-sample/*.json
Writes _ocr_out/vot/ADJUDICATION.json  + prints per-category agreement rates.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "_ocr_out" / "vot"
SAMPLE = OUT / "_vision-sample"

WORD = re.compile(r"[a-z0-9]+")
LINE_TOLERANCE = 0.20  # ±20% before a line-count disagreement is called


def toks(s: str):
    return WORD.findall((s or "").lower())


def page_lines(slug: str, page: int):
    p = OUT / slug / f"page_{page - 1:04d}.txt"
    if not p.exists():
        return None
    return [ln.strip() for ln in p.read_text(encoding="utf-8").split("\n") if ln.strip()]


_FOLIO_CACHE = {}


def folios(slug: str) -> dict:
    """{pdf page -> printed folio} as recorded by vot-pdf-extract.py."""
    if slug not in _FOLIO_CACHE:
        inv = OUT / slug / "inventory.json"
        data = json.loads(inv.read_text(encoding="utf-8")) if inv.exists() else {"pages": []}
        _FOLIO_CACHE[slug] = {m["page"]: m.get("folio", "") for m in data["pages"]}
    return _FOLIO_CACHE[slug]


def contained(needle: str, hay_tokens: list) -> bool:
    """Is every word of `needle`, in order, somewhere in the page's token stream?"""
    n = toks(needle)
    if not n:
        return True
    joined = " ".join(hay_tokens)
    return " ".join(n) in joined


def judge(rec: dict) -> dict:
    slug, page = rec["book"], rec["page"]
    lines = page_lines(slug, page)
    if lines is None:
        return {"book": slug, "page": page, "verdict": "NO_TEXT_LAYER_FILE"}
    all_toks = toks(" ".join(lines))

    # Compare against the page's HEAD and TAIL token windows, not against one extracted line.
    # Where a typeset line breaks is the typesetter's decision and the two readers make it
    # differently: the vision leg reports the line as printed, the extractor reports its own
    # line grouping, so the same sentence starts at a different word. The words are the
    # content; the break point is not. Scoring per-line cost 24 points of last-line agreement
    # on pages where both readers had the identical text.
    first_ok = contained(rec.get("first_line", ""), toks(" ".join(lines[:4])))

    # The folio is the last thing printed on the page, so a vision reader naming it as the last
    # line is RIGHT — the extractor moved it to metadata, it did not vanish. Scoring that as a
    # disagreement cost letters-vol7 five out of five sampled pages.
    book_folios = folios(slug)
    folio = (book_folios.get(page) or "").strip()
    vision_last = (rec.get("last_line") or "").strip()
    last_is_folio = bool(folio) and vision_last == folio
    last_ok = last_is_folio or contained(vision_last, toks(" ".join(lines[-4:])))

    # Same reason, applied to the tally: the vision leg counts the folio as a line of the page
    # and the extractor does not, so the expected count is the body lines plus the folio.
    vc, tc = rec.get("line_count") or 0, len(lines) + (1 if folio else 0)
    line_ok = bool(tc) and abs(vc - tc) <= max(2, tc * LINE_TOLERANCE)

    # PAGE-IDENTITY ANCHOR. If the reader quoted a folio at all and it belongs to a DIFFERENT
    # page of this same book, the reader was not looking at the page it was asked about. This
    # is what catches a batch whose per-page records have slipped out of alignment — the exact
    # failure found in letters-vol6 on 2026-08-05, where every record was shifted by one page
    # and every individual field looked perfectly plausible on its own.
    misaligned_with = None
    if folio and vision_last.isdigit() and vision_last != folio:
        for other_page, other_folio in book_folios.items():
            if other_folio == vision_last:
                misaligned_with = other_page
                break

    # A bare page number is not a missing element: vot-pdf-extract.py deliberately strips
    # numbers on the first/last lines of a page, because they are the folio and not the text.
    # Counting them as omissions made the first run report 63 phantom defects — the validator
    # flagging its own documented behaviour, which reads exactly like a real finding.
    extras = [e for e in (rec.get("extras") or []) if not e.strip().isdigit()]
    missing_extras = [e for e in extras if not contained(e, all_toks)]

    ok = first_ok and last_ok and line_ok and not missing_extras and not misaligned_with
    return {
        "book": slug,
        "page": page,
        "verdict": ("MISALIGNED" if misaligned_with else "AGREE" if ok else "DISAGREE"),
        "first_line_ok": first_ok,
        "last_line_ok": last_ok,
        "last_line_was_folio": last_is_folio,
        "line_count_vision": vc,
        "line_count_expected": tc,
        "line_count_ok": line_ok,
        "folio": folio,
        "misaligned_with_page": misaligned_with,
        "missing_extras": missing_extras,
    }


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if not SAMPLE.exists():
        sys.exit(f"no vision sample at {SAMPLE}")

    records = []
    for f in sorted(SAMPLE.glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        records.extend(data.get("results", []))

    results = [judge(r) for r in records]
    n = len(results)
    if not n:
        sys.exit("vision sample contained no page records")

    cats = {
        "first line": sum(1 for r in results if r.get("first_line_ok")),
        "last line": sum(1 for r in results if r.get("last_line_ok")),
        "line count": sum(1 for r in results if r.get("line_count_ok")),
        "no missing element": sum(1 for r in results if not r.get("missing_extras")),
    }
    agree = sum(1 for r in results if r["verdict"] == "AGREE")

    print(f"vision sample: {n} pages across {len({r['book'] for r in results})} books\n")
    for k, v in cats.items():
        print(f"  {k:20} {v:4}/{n}  {v / n * 100:6.2f}%")
    print(f"\n  {'ALL FOUR AGREE':20} {agree:4}/{n}  {agree / n * 100:6.2f}%")

    disagreements = [r for r in results if r["verdict"] != "AGREE"]
    if disagreements:
        print(f"\n{len(disagreements)} pages to adjudicate against the page image:")
        for r in disagreements:
            why = []
            if not r.get("first_line_ok"):
                why.append("first")
            if not r.get("last_line_ok"):
                why.append("last")
            if not r.get("line_count_ok"):
                why.append(f"lines {r.get('line_count_vision')}vs{r.get('line_count_expected')}")
            if r.get("missing_extras"):
                why.append(f"missing {len(r['missing_extras'])} element(s)")
            print(f"  {r['book']:34} p{r['page']:<5} {', '.join(why)}")

    (OUT / "ADJUDICATION.json").write_text(json.dumps({
        "pages": n, "agree": agree, "categories": cats, "results": results,
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
