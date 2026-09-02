"""validate-bible-sync — the Bible read-along data file, checked the way a gate would.

  py -3.13 tools/validate-bible-sync.py [--edition brm-kjv] [--data <path>]

Read-only. For every chapter in src/data/bible-sync-<edition>.js:
  - the array has exactly one slot per verse of the CURRENT reference corpus
    (a fresh extract through tools/extract-bible-verses.mjs, never the cache)
  - slots are non-negative integers; the non-zero onsets never step backwards
  - the last onset lies inside the chapter's local audio (ffprobe)
  - the belt on disk is current: today's settings hash, the fresh verses hash,
    the local mp3's byte size; its proven share clears the 60% ship gate
  - the shipped array is byte-equal to what ship() rebuilds from that belt
and every belt that clears the gate has a chapter in the file (nothing silently
dropped). Exit 1 on any problem; the summary names each one.

This is the gate the pipeline lacked when c40 shipped: check-audio-sync covers
the letters, validate-schemas never looks at this file.
"""
import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile

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


def ffprobe_dur(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", path], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return None


def fresh_verses(bab, ed, book, ch, tmp):
    path = os.path.join(tmp, f"{book}_{ch:03d}.json")
    r = subprocess.run(["node", os.path.join(BASE, "extract-bible-verses.mjs"), book, str(ch), path,
                        "--translation", bab.EDITIONS[ed]["translation"]],
                       capture_output=True, encoding="utf-8", errors="replace", cwd=ROOT)
    if r.returncode != 0 or not os.path.exists(path):
        return None
    return json.load(open(path, encoding="utf-8"))["verses"]


def rebuild(belt):
    """ship()'s per-chapter array, re-derived independently."""
    rows = belt["verses"]
    arr = [0] * max(r["n"] for r in rows)
    for r in rows:
        t = r.get("t")
        if t is not None and r.get("status") != "UNSPOKEN":
            arr[r["n"] - 1] = max(0, int(round(t * 100)))
    last = 0
    for i, v in enumerate(arr):
        if v and v < last:
            arr[i] = last
        elif v:
            last = v
    return arr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--edition", default="brm-kjv")
    ap.add_argument("--data", help="data file to check (default src/data/bible-sync-<edition>.js)")
    a = ap.parse_args()
    ed = a.edition
    bab = load(os.path.join(BASE, "batch-align-bible.py"), "batch_align_bible")
    want = al.settings_hash(al.settings_for(bab.EDITIONS[ed]["family"]))
    idx = bab.audio_index(ed)
    belts_dir = os.path.join(BASE, "_align-work", "bible", ed)
    data_path = a.data or os.path.join(DATA, f"bible-sync-{ed}.js")
    src = open(data_path, encoding="utf-8").read()
    var = "BIBLE_SYNC_" + ed.upper().replace("-", "_")
    m = re.search(r"var " + var + r" = (\{.*\});", src, re.S)
    if not m:
        print(f"FAIL: {var} not found in {data_path}")
        return 1
    table = json.loads(m.group(1))
    problems = []
    tmp = tempfile.mkdtemp(prefix="bible-sync-validate-")
    chapters = slots = zeros = 0
    shipped = set()
    for book in table:
        for ch_s, arr in table[book].items():
            ch = int(ch_s)
            tag = f"{book}_{ch:03d}"
            chapters += 1
            shipped.add((book, ch))
            verses = fresh_verses(bab, ed, book, ch, tmp)
            if verses is None:
                problems.append((tag, "reference verses could not be extracted"))
                continue
            slots += len(arr)
            zeros += sum(1 for v in arr if not v)
            if len(arr) != len(verses):
                problems.append((tag, f"{len(arr)} slots for {len(verses)} verses"))
            if any((not isinstance(v, int)) or isinstance(v, bool) or v < 0 for v in arr):
                problems.append((tag, "non-integer or negative slot"))
            last = 0
            for i, v in enumerate(arr):
                if v and v < last:
                    problems.append((tag, f"onset steps backwards at verse {i + 1}"))
                if v:
                    last = v
            entry = idx.get((book, ch))
            if not entry:
                problems.append((tag, "no local audio for this chapter"))
                continue
            dur = ffprobe_dur(entry[0])
            if dur is not None and last / 100.0 >= dur:
                problems.append((tag, f"last onset {last / 100:.2f}s is past the audio end {dur:.2f}s"))
            bp = os.path.join(belts_dir, tag + ".json")
            if not os.path.exists(bp):
                problems.append((tag, "no belt on disk"))
                continue
            belt = json.load(open(bp, encoding="utf-8"))
            fresh_hash = al.sha10(json.dumps([[x["n"], x["text"]] for x in verses],
                                             ensure_ascii=False, separators=(",", ":")))
            if belt.get("settings_hash") != want:
                problems.append((tag, f"belt settings {belt.get('settings_hash')} != {want}"))
            if belt.get("versesHash") != fresh_hash:
                problems.append((tag, "belt versesHash != current corpus text"))
            if belt.get("audioSize") != os.path.getsize(entry[0]):
                problems.append((tag, "belt audioSize != local mp3 (audio changed since alignment)"))
            if bab.proven_share(belt) < bab.MIN_PROVEN:
                problems.append((tag, f"proven share {bab.proven_share(belt):.3f} below the gate"))
            if rebuild(belt) != arr:
                problems.append((tag, "shipped array != rebuilt from belt"))
    # every gate-clearing current belt must be in the file
    missing = []
    for name in os.listdir(belts_dir):
        if not name.endswith(".json") or name.endswith(".tx.json") or ".wav." in name or name.startswith(("CAMPAIGN", "progress", "audio-index")):
            continue
        d = json.load(open(os.path.join(belts_dir, name), encoding="utf-8"))
        if not isinstance(d, dict) or "verses" not in d:
            continue
        key = (d.get("bookId"), d.get("chapter"))
        entry = idx.get(key)
        if (d.get("settings_hash") == want and entry and d.get("audioSize") == os.path.getsize(entry[0])
                and bab.proven_share(d) >= bab.MIN_PROVEN and key not in shipped):
            missing.append(f"{key[0]}_{key[1]:03d}")
    for tag in sorted(missing):
        problems.append((tag, "current belt clears the gate but is not in the data file"))

    print(f"{data_path}: {chapters} chapters, {slots} verse slots, {slots - zeros} timed, {zeros} zero  "
          f"(settings {want}, audio index {len(idx)} chapters)")
    if problems:
        print(f"FAIL: {len(problems)} problem(s)")
        for tag, why in problems[:200]:
            print(f"  {tag:22s} {why}")
        return 1
    print("OK: every chapter matches its corpus, its audio and its belt; every current belt is shipped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
