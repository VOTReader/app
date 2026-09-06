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
  BIBLE_SYNC_<EDITION>[bookId][chapter] = [cs, cs, ...]   one slot per verse
  NUMBER, 1-based, sized to max(n): integer CENTISECONDS, 0 where the verse was
  not proven OR the edition does not have it. ~184 KB for all 31,102 verses; the
  app fetches it only while a Bible recording is actually playing.

  NOT "one slot per verse in verse order" -- that wording is what produced a
  phantom off-by-one defect on 2026-09-05, and a fix for it that would have
  broken this. Editions may number SPARSELY: the WEB omits acts 8:37, acts
  15:34, acts 24:7 and luke 17:36 and keeps the verses after each gap at their
  own numbers, so verse 38 of acts 8 belongs at index 37 and index 36 stays 0.
  ReadAlongHighlight._bibleRowsFor reads position i back as verse NUMBER i + 1
  and resolves it through bibleHlKey(book, chapter, n) against the on-screen
  verse's own n, so the two ends meet by verse identity and a verse either side
  lacks paints nothing. Guarded by test_batch_align_bible_ship.py.
"""
import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import time

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
    # The TSOT reading of Matthew: ONE book, 28 chapters, and the only edition
    # whose assets are the archive's Drive ids rather than a naming rule -- so
    # its audio index comes from the Drive listing, not from a mirror script's
    # collect(). Its reference is `vot-matthew` (matthew.js, the text the
    # Matthew SCREEN renders); `nkjv` must keep resolving to matthew-plain.js
    # because that is the Word of Promise's reference, and moving it would
    # silently change what a future WOP Matthew belt was aligned against.
    "tsot-matthew": {
        "translation": "vot-matthew",
        "family": "bible-tsot-matthew",
        "mirror": None,
        "prefix": None,
        "driveFolder": "18. TSOT New Testament",
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
        capture_output=True, encoding="utf-8", errors="replace", cwd=ROOT)
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


def ship(ed, belts_dir, want_settings=None, idx=None):
    """Rebuild src/data/bible-sync-<edition>.js from the CURRENT belts on disk.

    A belt ships only when it was made with today's settings AND describes the
    audio that is on disk right now (its audioSize equals the local mp3's).
    Before 2026-09-01 the shipper took every belt it found, so a settings
    change followed by a partial run, or a re-cut chapter that had not been
    re-belted yet, would have shipped timings for audio nobody would hear.
    Dropped belts are counted by reason so a short ship is never silent."""
    table = {}
    kept = dropped = verses_timed = verses_total = 0
    stale_settings = stale_audio = no_audio = 0
    for name in sorted(os.listdir(belts_dir)):
        # Belts only. The same directory holds each chapter's cached whisper
        # transcript (<tag>.tx.json) and its silence map (<tag>.16k.wav.sil.json),
        # and the latter may be a bare LIST — a shipper that reads every .json in
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
        if want_settings and d.get("settings_hash") != want_settings:
            stale_settings += 1
            continue
        if idx is not None:
            entry = idx.get((book_id, chapter))
            if not entry:
                no_audio += 1
                continue
            if d.get("audioSize") != os.path.getsize(entry[0]):
                stale_audio += 1
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
        "   per verse NUMBER (1-based, sized to the edition's highest verse number,\n"
        "   NOT one slot per verse in row order), integer CENTISECONDS from the\n"
        "   start of the chapter recording. 0 means the belt could not prove that\n"
        "   verse, or this edition does not have it at all — some number sparsely,\n"
        "   e.g. the WEB has no acts 8:37 but still calls the next verse 38. The\n"
        "   app paints nothing for a 0 rather than guessing. Loaded lazily by\n"
        "   window.__loadBibleSync('bible-" + ed + "') the first time a recording\n"
        "   from this edition plays with read-along on. */\n"
        "var " + var + " = " + body + ";\n"
    )
    path = os.path.join(DATA, "bible-sync-" + ed + ".js")
    open(path, "w", encoding="utf-8", newline="\n").write(out)
    size = os.path.getsize(path)
    print(f"\nship: {kept} chapters ({dropped} below the {MIN_PROVEN:.0%} proven gate; "
          f"not shipped: {stale_settings} other settings, {stale_audio} audio changed since the belt, "
          f"{no_audio} no local audio), "
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
    ap.add_argument("--min-free-vram-gb", type=float, default=5.0,
                    help="refuse to start alignment with less free GPU memory than this (0 disables)")
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
    print(f"batch-align-bible {ed}: {len(work)} chapters  family {cfg['family']}  settings {want_settings}  "
          f"started {time.strftime('%Y-%m-%d %H:%M:%S')}", flush=True)
    if a.min_free_vram_gb > 0:
        free = al.vram_free_gb()
        if free is not None and free < a.min_free_vram_gb:
            print(f"PREFLIGHT: only {free:.1f} GB of GPU memory free (< {a.min_free_vram_gb} GB); "
                  f"something else holds the card. Not starting.", flush=True)
            return 3

    # Chapters tools/align-supervisor.py killed for memory. Without this the
    # supervisor's relaunch walks straight back into the chapter that just blew
    # the ceiling and the two spin against each other until max-restarts.
    # batch-align.py carries the same hook; both aligners resume by belt, so the
    # only work a kill costs is the offending unit.
    skip_units = {u for u in os.environ.get("ALIGN_SKIP_UNITS", "").split(",") if u}
    if skip_units:
        print(f"batch-align-bible: skipping {len(skip_units)} chapter(s) the supervisor "
              f"killed for memory: {', '.join(sorted(skip_units))}", flush=True)

    done = skipped = failed = 0
    review = []
    per_book = {}
    t_run = time.time()
    progress_path = os.path.join(belts, "progress.json")

    def note(book_id, key):
        b = per_book.setdefault(book_id, {"done": 0, "skipped": 0, "failed": 0, "review": []})
        if key in b:
            b[key] += 1

    def book_summary(book_id):
        b = per_book.get(book_id)
        if b and (b["done"] or b["failed"]):
            rv = f"  review {b['review']}" if b["review"] else ""
            print(f"  book {book_id}: {b['done']} aligned, {b['skipped']} current, "
                  f"{b['failed']} failed{rv}   elapsed {(time.time() - t_run) / 60:.1f} min", flush=True)

    def checkpoint(last_tag):
        # A machine-readable heartbeat for whoever is watching a 19-hour run.
        try:
            json.dump({"edition": ed, "started": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(t_run)),
                       "updated": time.strftime('%Y-%m-%d %H:%M:%S'), "work": len(work),
                       "done": done, "skipped": skipped, "failed": failed, "last": last_tag,
                       "review": review, "rss_gb": round(al.rss_gb(), 2)},
                      open(progress_path, "w", encoding="utf-8"), indent=1)
        except OSError:
            pass

    last_book = None
    for n, (book_id, chapter) in enumerate(work, 1):
        if last_book is not None and book_id != last_book:
            book_summary(last_book)
        last_book = book_id
        entry = idx.get((book_id, chapter))
        audio = entry[0] if entry else None
        tag = f"{book_id}_{chapter:03d}"
        # Printed BEFORE the work, not with the result: tools/align-supervisor.py
        # names the unit in flight off the log, and a tag that only appears on
        # completion tells it nothing about the chapter that is eating the box.
        print(f"  [{n}/{len(work)}] {tag}  start", flush=True)
        if tag in skip_units:
            print(f"  [{n}/{len(work)}] {tag}  SKIPPED (memory ceiling)", flush=True)
            failed += 1
            note(book_id, "failed")
            continue
        if not audio:
            print(f"  [{n}/{len(work)}] {tag}  NO AUDIO", flush=True)
            failed += 1
            note(book_id, "failed")
            continue
        belt_path = os.path.join(belts, tag + ".json")
        try:
            vpath = verses_json(ed, book_id, chapter, verses_dir)
        except RuntimeError as e:
            print(f"  [{n}/{len(work)}] {tag}  NO VERSES  {e}", flush=True)
            failed += 1
            note(book_id, "failed")
            continue
        if not a.force and is_current(belt_path, want_settings, vpath, audio):
            skipped += 1
            note(book_id, "skipped")
            continue
        t0 = time.time()
        try:
            d = hb.run_chapter(vpath, audio, tag, dict(s), out_dir=belts, quiet=True)
        except Exception as e:                                      # noqa: BLE001
            print(f"  [{n}/{len(work)}] {tag}  ERROR {str(e).splitlines()[0][:110]}", flush=True)
            failed += 1
            note(book_id, "failed")
            checkpoint(tag)
            continue
        share = proven_share(d)
        done += 1
        note(book_id, "done")
        # After EVERY chapter, not every 25. The 2026-09-02 campaign ran at
        # 0.17x realtime for 27 chapters, then Deuteronomy 28 (737 s, the first
        # chunked emission of the night) filled torch's allocator cache to the
        # card's 16 GB and every chapter after it ran 7x slower (1.3x realtime):
        # Windows WDDM spills allocations past the ceiling into system memory
        # over PCIe and torch never gives the cache back on its own. Returning
        # it costs milliseconds; the models stay resident either way.
        al.release_caches()
        flag = "" if share >= 0.90 else ("  REVIEW" if share >= MIN_PROVEN else "  EXCLUDED")
        if flag:
            review.append((tag, share))
            per_book[book_id]["review"].append(tag)
        print(f"  [{n}/{len(work)}] {tag}  {len(d['verses'])}v  "
              f"C{d['confirmed']} P{d['probed']} R{d['review']}  proven {share:.3f}{flag}"
              f"   {time.time() - t0:5.1f}s  rss {al.rss_gb():.2f} GB "
              f"commit {al.commit_gb():.2f} GB", flush=True)
        checkpoint(tag)
    if last_book is not None:
        book_summary(last_book)

    print(f"\ndone {done}  skipped(current) {skipped}  failed {failed}  "
          f"elapsed {(time.time() - t_run) / 60:.1f} min", flush=True)
    checkpoint("END")
    if review:
        print("below the silent-ship bar:")
        for tag, share in sorted(review, key=lambda r: r[1]):
            print(f"  {share:.3f}  {tag}")
    if not a.no_ship:
        ship(ed, belts, want_settings, idx)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
