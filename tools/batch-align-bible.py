"""batch-align-bible — verse-level read-along alignment for a Bible edition.

  py -3.13 tools/batch-align-bible.py --edition brm-kjv --chapters john:1,matthew:6
  py -3.13 tools/batch-align-bible.py --edition brm-kjv --books matthew,mark,luke,john,acts
  py -3.13 tools/batch-align-bible.py --edition brm-kjv --all [--force] [--no-ship]

A sibling of batch-align.py, not an extension of it. They share _alignlib and
the ship discipline and nothing else: batch-align is built around AUDIO_MANIFEST
keys, letter fragments, multi-part consumption boundaries and AUDIO_SYNC_ALT,
none of which a Bible chapter has — and this has three things it does not
(verse extraction, LOCAL audio paths, and the per-edition superscription policy).

AUDIO IS LOCAL. All 3,567 chapter MP3s are already on disk under D:\\BibleAudio,
so unlike the letters there is no download leg. The local path -> asset id
mapping is NOT re-derived here: each mirror script already owns it, and its
collect() is imported so the two can never disagree about which file is
"brm1_matthew_006".

RESUME KEY = settings_hash + versesHash + audioSize. Settings alone was the
2026-08-12 lesson from the letters: the reference domain changed without the
settings moving, every belt still looked current, and a resumed run replayed
timings addressed to the old text. A cache key must cover every INPUT.

SHIP GATE (owner policy, same as the letters): a chapter whose CONFIRMED+PROBED
share is below MIN_PROVEN ships nothing at all rather than a doubtful timeline.
Verses the belt could not prove carry an onset spread across the gap by
_alignlib._interpolate_runs and DO ship (owner directive 2026-08-26 — a clause
that does not paint reads as the feature being broken). UNSPOKEN verses never
ship: those words are provably absent from the recording.

Output: src/data/bible-sync-<edition>.js
  BIBLE_SYNC_<EDITION>[bookId][chapter] = [cs, cs, ...]   one slot per verse,
  integer CENTISECONDS, 0 = "not proven, do not paint". ~184 KB for all 31,102
  verses; the app fetches it only while a Bible recording is actually playing.
"""
import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
WORK = os.path.join(BASE, "_align-work")
DATA = os.path.join(ROOT, "app", "src", "main", "assets", "src", "data")

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, BASE)
import _alignlib as al                                              # noqa: E402


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


hb = _load(os.path.join(BASE, "hone-bible.py"), "hone_bible")

# Per edition: the reference translation (it MUST match the recording — that is
# the alignment invariant), the settings family, and the mirror script whose
# collect() maps local files to asset ids.
EDITIONS = {
    "brm-kjv": {
        "translation": "kjv",
        "family": "bible-brm-kjv",
        "mirror": r"D:\BibleAudio\mirror-brm-chapters-release.py",
        "prefix": "brm",
    },
    "wop-nkjv": {
        "translation": "nkjv",
        "family": "bible-wop-nkjv",
        "mirror": os.path.join(BASE, "mirror-wop-release.py"),
        "prefix": "wop",
    },
    "web-ebible": {
        "translation": "web",
        "family": "bible-web",
        "mirror": r"D:\BibleAudio\mirror-web-release.py",
        "prefix": "web",
    },
}

MIN_PROVEN = 0.60          # below this the chapter ships nothing (owner policy)


def audio_index(ed):
    """assetId -> local mp3 path, via the mirror script's own collect()."""
    cfg = EDITIONS[ed]
    mod = _load(cfg["mirror"], "mirror_" + ed.replace("-", "_"))
    idx = {}
    pat = re.compile(re.escape(cfg["prefix"]) + r"[12]_([a-z0-9]+)_(\d{3})\.mp3$")
    for _tag, path, name in mod.collect():
        m = pat.match(name)
        if m:
            idx[(m.group(1), int(m.group(2)))] = (path, name[:-4])
    return idx


def verses_json(ed, book_id, chapter, out_dir):
    """One chapter's reference verses, cached. Shells out to the existing
    extractor rather than re-reading the corpus here — it already owns the
    two corpus shapes and the matthew/matthew-plain book-id alias."""
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{book_id}_{chapter:03d}.json")
    if os.path.exists(path):
        return path
    r = subprocess.run(
        ["node", os.path.join(BASE, "extract-bible-verses.mjs"), book_id, str(chapter),
         path, "--translation", EDITIONS[ed]["translation"]],
        capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0 or not os.path.exists(path):
        raise RuntimeError((r.stderr or r.stdout).strip()[:160])
    return path


def is_current(belt_path, want_settings, verses_path, audio_path):
    if not os.path.exists(belt_path):
        return False
    try:
        d = json.load(open(belt_path, encoding="utf-8"))
    except (OSError, ValueError):
        return False
    if d.get("settings_hash") != want_settings:
        return False
    if d.get("audioSize") != os.path.getsize(audio_path):
        return False
    v = json.load(open(verses_path, encoding="utf-8"))["verses"]
    want = al.sha10(json.dumps([[x["n"], x["text"]] for x in v],
                               ensure_ascii=False, separators=(",", ":")))
    return d.get("versesHash") == want


def proven_share(belt):
    rows = belt.get("verses") or []
    if not rows:
        return 0.0
    ok = sum(1 for r in rows
             if r.get("status") in ("CONFIRMED",) or str(r.get("status", "")).startswith("PROBED"))
    return ok / len(rows)


def chapters_for(args, idx, books_meta):
    """The (bookId, chapter) work list, in canonical Bible order."""
    order = {b: i for i, b in enumerate(books_meta)}
    if args.chapters:
        want = []
        for spec in args.chapters.split(","):
            b, _, c = spec.partition(":")
            want.append((b.strip(), int(c)))
    elif args.books:
        names = [b.strip() for b in args.books.split(",")]
        want = [(b, c) for (b, c) in idx if b in names]
    else:
        want = list(idx)
    return sorted(set(want), key=lambda bc: (order.get(bc[0], 999), bc[1]))


def ship(ed, belts_dir):
    """Rebuild src/data/bible-sync-<edition>.js from every belt on disk."""
    table = {}
    kept = dropped = verses_timed = verses_total = 0
    for name in sorted(os.listdir(belts_dir)):
        # Belts only. The same directory holds each chapter's cached whisper
        # transcript (<tag>.tx.json) and its silence map (<tag>.16k.wav.sil.json),
        # and the latter is a bare LIST — a shipper that reads every .json in
        # the folder crashes on it.
        if not name.endswith(".json") or name.endswith(".tx.json") or ".wav." in name:
            continue
        d = json.load(open(os.path.join(belts_dir, name), encoding="utf-8"))
        if not isinstance(d, dict) or "verses" not in d:
            continue
        rows = d.get("verses") or []
        book_id, chapter = d.get("bookId"), d.get("chapter")
        if not book_id or not chapter or not rows:
            continue
        if proven_share(d) < MIN_PROVEN:
            dropped += 1
            continue
        n_max = max(r["n"] for r in rows)
        arr = [0] * n_max
        for r in rows:
            t = r.get("t")
            if t is not None and r.get("status") != "UNSPOKEN":
                arr[r["n"] - 1] = max(0, int(round(t * 100)))
        # Monotonic within the chapter: the app binary-searches these, so a
        # backwards step would make a verse unreachable.
        last = 0
        for i, v in enumerate(arr):
            if v and v < last:
                arr[i] = last
            elif v:
                last = v
        verses_timed += sum(1 for v in arr if v)
        verses_total += len(arr)
        table.setdefault(book_id, {})[str(chapter)] = arr
        kept += 1

    var = "BIBLE_SYNC_" + ed.upper().replace("-", "_")
    lines = []
    for book in sorted(table):
        chs = table[book]
        inner = ",".join(json.dumps(c) + ":" + json.dumps(chs[c], separators=(",", ":"))
                         for c in sorted(chs, key=int))
        lines.append(" " + json.dumps(book) + ":{" + inner + "}")
    body = "{\n" + ",\n".join(lines) + "\n}"
    out = (
        "/* BIBLE READ-ALONG timings — generated by tools/batch-align-bible.py.\n"
        "   DO NOT EDIT. " + var + "[bookId][chapter] = [cs, cs, ...], one slot\n"
        "   per verse in verse order, integer CENTISECONDS from the start of the\n"
        "   chapter recording. 0 means the belt could not prove that verse: the\n"
        "   app paints nothing for it rather than guessing. Loaded lazily by\n"
        "   window.__loadBibleSync('bible-" + ed + "') the first time a recording\n"
        "   from this edition plays with read-along on. */\n"
        "var " + var + " = " + body + ";\n"
    )
    path = os.path.join(DATA, "bible-sync-" + ed + ".js")
    open(path, "w", encoding="utf-8", newline="\n").write(out)
    size = os.path.getsize(path)
    print(f"\nship: {kept} chapters ({dropped} below the {MIN_PROVEN:.0%} proven gate), "
          f"{verses_timed}/{verses_total} verses timed -> {path} ({size // 1024} KB)")
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--edition", required=True, choices=sorted(EDITIONS))
    ap.add_argument("--chapters", help="comma list of book:chapter (e.g. john:1,psalms:23)")
    ap.add_argument("--books", help="comma list of book ids — every chapter of each")
    ap.add_argument("--all", action="store_true", help="every chapter of the edition")
    ap.add_argument("--force", action="store_true", help="re-align even when the belt is current")
    ap.add_argument("--no-ship", action="store_true", help="align only; do not write the data file")
    ap.add_argument("--limit", type=int, help="stop after N chapters (calibration runs)")
    ap.add_argument("--write-audio-index", action="store_true",
                    help="write assetId -> local path and exit (the e2e harness reads it)")
    a = ap.parse_args()
    if not (a.chapters or a.books or a.all):
        ap.error("one of --chapters / --books / --all is required")

    ed = a.edition
    cfg = EDITIONS[ed]
    s = al.settings_for(cfg["family"])
    want_settings = al.settings_hash(s)
    belts = os.path.join(WORK, "bible", ed)
    verses_dir = os.path.join(belts, "verses")
    os.makedirs(belts, exist_ok=True)

    idx = audio_index(ed)
    if a.write_audio_index:
        # The browser harness serves these bytes under the real release URL.
        # It reads this file rather than re-deriving the mapping in JS: the
        # mirror script is the one place that knows which local file is
        # "brm2_john_001", and a second implementation is a second thing to drift.
        os.makedirs(belts, exist_ok=True)
        out = {asset: path for (path, asset) in idx.values()}
        path = os.path.join(belts, "audio-index.json")
        json.dump(out, open(path, "w", encoding="utf-8"), indent=0)
        print(f"wrote {len(out)} entries -> {path}")
        return 0
    books_meta = sorted({b for b, _ in idx})
    work = chapters_for(a, idx, books_meta)
    if a.limit:
        work = work[:a.limit]
    print(f"batch-align-bible {ed}: {len(work)} chapters  family {cfg['family']}  settings {want_settings}")

    done = skipped = failed = 0
    review = []
    for n, (book_id, chapter) in enumerate(work, 1):
        entry = idx.get((book_id, chapter))
        audio = entry[0] if entry else None
        tag = f"{book_id}_{chapter:03d}"
        if not audio:
            print(f"  [{n}/{len(work)}] {tag}  NO AUDIO")
            failed += 1
            continue
        belt_path = os.path.join(belts, tag + ".json")
        try:
            vpath = verses_json(ed, book_id, chapter, verses_dir)
        except RuntimeError as e:
            print(f"  [{n}/{len(work)}] {tag}  NO VERSES  {e}")
            failed += 1
            continue
        if not a.force and is_current(belt_path, want_settings, vpath, audio):
            skipped += 1
            continue
        try:
            d = hb.run_chapter(vpath, audio, tag, dict(s), out_dir=belts, quiet=True)
        except Exception as e:                                      # noqa: BLE001
            print(f"  [{n}/{len(work)}] {tag}  ERROR {str(e).splitlines()[0][:110]}")
            failed += 1
            continue
        share = proven_share(d)
        done += 1
        flag = "" if share >= 0.90 else ("  REVIEW" if share >= MIN_PROVEN else "  EXCLUDED")
        if flag:
            review.append((tag, share))
        print(f"  [{n}/{len(work)}] {tag}  {len(d['verses'])}v  "
              f"C{d['confirmed']} P{d['probed']} R{d['review']}  proven {share:.3f}{flag}", flush=True)

    print(f"\ndone {done}  skipped(current) {skipped}  failed {failed}")
    if review:
        print("below the silent-ship bar:")
        for tag, share in sorted(review, key=lambda r: r[1]):
            print(f"  {share:.3f}  {tag}")
    if not a.no_ship:
        ship(ed, belts)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
