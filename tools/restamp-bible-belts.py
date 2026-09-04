"""restamp-bible-belts — re-key alignment belts after a CASE-ONLY corpus edit.

  py -3.13 tools/restamp-bible-belts.py --edition brm-kjv --old-data <previous bible-<code>.js> [--apply]

A belt is keyed by settings_hash + versesHash + audioSize (batch-align-bible.py,
validate-bible-sync.py). Any edit to the reference text re-keys every chapter it
touches, and a re-key means "re-align on the GPU" -- correct for a wording change,
pointless for one that only changes letter case: the whole-verse timings do not
move when "Lord" becomes "LORD" (both alignment legs fold case before they look
at the text). c43 restored the KJV's small-caps divine name in 5,820 verses; this
tool is how those belts stay current without a 10-hour re-run.

It is deliberately narrow. For every belt of the edition it requires BOTH:
  - belt.versesHash == hash(OLD text of that chapter)   (the belt was aligned to
    exactly the text we are moving away from -- a stale belt is left alone), and
  - OLD text == NEW text after .casefold(), verse by verse, same verse numbers.
Only then does it stamp hash(NEW text). Anything else is reported and untouched.
Dry run by default; --apply writes. Prints counts so the run is auditable.
"""
import argparse
import importlib.util
import json
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
DATA = os.path.join(ROOT, "app", "src", "main", "assets", "src", "data")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, BASE)
import _alignlib as al                                              # noqa: E402


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def flat_map(path, translation):
    prefix = "var BIBLE_" + translation.upper() + " = "
    src = open(path, encoding="utf-8").read()
    if not src.startswith(prefix):
        raise SystemExit(f"{path}: not a flat translation file ({prefix.strip()} …)")
    body = src[len(prefix):].rstrip()
    return json.loads(body[:-1] if body.endswith(";") else body)


def chapter_rows(flat, book, ch):
    rows = flat.get("matthew-plain" if book == "matthew" else book, {}).get(str(ch))
    if rows is None:
        return None
    return sorted(([r["n"], str(r["text"])] for r in rows), key=lambda r: r[0])


def vhash(rows):
    return al.sha10(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--edition", default="brm-kjv")
    ap.add_argument("--old-data", required=True, help="the bible-<code>.js the belts were aligned against")
    ap.add_argument("--apply", action="store_true", help="write the new versesHash (default: dry run)")
    a = ap.parse_args()
    bab = load(os.path.join(BASE, "batch-align-bible.py"), "batch_align_bible")
    translation = bab.EDITIONS[a.edition]["translation"]
    if translation == "nkjv":
        raise SystemExit("nkjv is Format C (books.js); this tool reads flat bible-<code>.js maps only")
    old = flat_map(a.old_data, translation)
    new = flat_map(os.path.join(DATA, f"bible-{translation}.js"), translation)
    belts_dir = os.path.join(BASE, "_align-work", "bible", a.edition)
    counts = {"belts": 0, "already_current": 0, "restamped": 0, "not_case_only": 0, "stale_before": 0, "no_chapter": 0}
    detail = []
    for name in sorted(os.listdir(belts_dir)):
        if not name.endswith(".json") or name.endswith(".tx.json") or ".wav." in name or name.startswith(("CAMPAIGN", "progress", "audio-index")):
            continue
        p = os.path.join(belts_dir, name)
        d = json.load(open(p, encoding="utf-8"))
        if not isinstance(d, dict) or "verses" not in d or "versesHash" not in d:
            continue
        counts["belts"] += 1
        book, ch = d.get("bookId"), d.get("chapter")
        o, n = chapter_rows(old, book, ch), chapter_rows(new, book, ch)
        if o is None or n is None:
            counts["no_chapter"] += 1
            detail.append((name, "chapter missing from old or new corpus"))
            continue
        ho, hn = vhash(o), vhash(n)
        if d["versesHash"] == hn:
            counts["already_current"] += 1
            continue
        if d["versesHash"] != ho:
            counts["stale_before"] += 1
            detail.append((name, f"belt hash {d['versesHash']} is neither old {ho} nor new {hn}: needs a re-align"))
            continue
        case_only = len(o) == len(n) and all(x[0] == y[0] and x[1].casefold() == y[1].casefold() for x, y in zip(o, n))
        if not case_only:
            counts["not_case_only"] += 1
            detail.append((name, "text differs beyond letter case: needs a re-align"))
            continue
        counts["restamped"] += 1
        if a.apply:
            d["versesHash"] = hn
            d["restamped"] = {"from": ho, "to": hn, "reason": "case-only corpus edit", "tool": "restamp-bible-belts.py"}
            json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{a.edition}: {counts['belts']} belts -- already current {counts['already_current']}, "
          f"{'restamped' if a.apply else 'would restamp'} {counts['restamped']}, "
          f"not case-only {counts['not_case_only']}, stale before the edit {counts['stale_before']}, "
          f"no chapter {counts['no_chapter']}  ({'APPLIED' if a.apply else 'DRY RUN'})")
    for name, why in detail[:100]:
        print(f"  {name:28s} {why}")
    return 1 if (counts["not_case_only"] or counts["stale_before"] or counts["no_chapter"]) else 0


if __name__ == "__main__":
    sys.exit(main())
