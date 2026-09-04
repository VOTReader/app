"""audio-archive-hashes — reconcile D:\\VOT-Archive against the Drive listing, and
produce the driveFileId -> audio-hash map gen-audio-manifest.mjs needs.

WHY THIS EXISTS (2026-09-04). Two censuses of the same recordings disagreed:
the FlockSync archive note counted 334 distinct text-to-speech recordings while
the generated manifest shipped 629 primary V tracks. Either one side was
collapsing across letters or the two sides were different trees, and nobody
could tell which from counts alone. The archive is on disk, so the question is
answerable by bytes rather than by argument: hash the audio frames of every
letter-side mp3 and join the result to the Drive listing by path.

It leaves two things behind:

  tools/_audio-drive-hashes.json   { driveFileId: <sha1 of the audio frames> }
      Read by gen-audio-manifest.mjs, which cannot compute it: the generator
      sees a Drive LISTING, never the bytes, and Drive's own md5Checksum covers
      the ID3 tags this hash deliberately strips. Gitignored like the listing.

  the census on stdout        the two-way diff, the duplicate groups, and the
      distinct-recording count per reader -- the number the two censuses
      disagreed about.

Usage:
  python tools/audio-archive-hashes.py [--archive D:\\VOT-Archive] [--json <out>]
                                       [--census <out.md>] [--jobs N]

The hash is vot_curate.py:audio_hash -- SHA1 over the mp3 frames with the ID3v2
header and any ID3v1 trailer removed, so a retagged file still matches itself.
Nothing in the archive is opened for writing.
"""
import argparse
import hashlib
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# The letter-side folders. Everything else in the archive is a different
# surface and is deliberately out of the app manifest: the AI song variants,
# the Gospel of John movie audio, the Bible-Letter Studies (tracks span several
# study chapters) and the TSOT New Testament (Bible chapters). Same exclusion
# the generator applies to the listing, expressed against folder names.
LETTER_DIR = re.compile(
    r"^(0\. ALL LETTERS|1[0-3]\. |16\. |19\. |[1-9]\. )", re.IGNORECASE
)
SKIP_DIR = re.compile(
    r"^(AI Songs of the Letters|The Gospel of John Movie Audio|17\. |18\. |"
    r"Trumpeting Materials|_)", re.IGNORECASE
)


def audio_hash(path):
    """SHA1 of the mp3 audio frames only (vot_curate.py:audio_hash)."""
    data = Path(path).read_bytes()
    start = 0
    if data[:3] == b"ID3":
        size = 0
        for b in data[6:10]:
            size = (size << 7) | (b & 0x7F)
        start = 10 + size
    end = len(data) - 128 if data[-128:-125] == b"TAG" else len(data)
    return hashlib.sha1(data[start:end]).hexdigest()


def reader_of(name):
    """B / T / V / M, the same convention gen-audio-manifest.mjs parses."""
    m = re.search(r"\(read by ([^)]+)\)", name, re.IGNORECASE)
    if not m:
        return "V"
    t = m.group(1).lower()
    if "benjamin" in t or "bejamin" in t:
        return "B"
    if "timothy" in t:
        return "T"
    if "ai" in t:
        return "M"
    return "V"


def letter_side_files(root):
    """Every letter-side mp3 in the archive, as posix paths relative to root."""
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel = Path(dirpath).relative_to(root).as_posix()
        top = rel.split("/")[0] if rel != "." else ""
        if top and (SKIP_DIR.match(top) or not LETTER_DIR.match(top)):
            dirnames[:] = []
            continue
        for f in filenames:
            if f.lower().endswith(".mp3"):
                out.append((rel + "/" + f) if rel != "." else f)
    return sorted(out)


# rclone rewrites the characters Windows forbids in a filename, so a Drive name
# holding `?` lands on disk as the fullwidth `？`. Join on the ASCII form or
# eight real recordings fall out of the map and look like archive-only files.
_FULLWIDTH = str.maketrans({chr(0xFF1F): "?", chr(0xFF02): '"', chr(0xFF1C): "<",
                            chr(0xFF1E): ">", chr(0xFF1A): ":", chr(0xFF5C): "|",
                            chr(0xFF0A): "*", chr(0xFF3C): chr(92)})


def joinkey(p):
    """The path form both sides agree on."""
    return p.translate(_FULLWIDTH)


def load_listing(path):
    """The generator's Drive listing: relative path -> Drive file id."""
    if not Path(path).exists():
        return {}
    by_path = {}
    for rec in json.loads(Path(path).read_text(encoding="utf-8")):
        by_path.setdefault(joinkey(rec["path"]), rec["id"])
    return by_path


def load_live(path):
    """FlockSync's live upstream listing (`path;size` per line) -> set of paths."""
    if not Path(path).exists():
        return set()
    out = set()
    for line in Path(path).read_text(encoding="utf-8", errors="replace").splitlines():
        p = line.rsplit(";", 1)[0].strip()
        if p.lower().endswith(".mp3"):
            out.add(joinkey(p))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--archive", default=r"D:\VOT-Archive")
    ap.add_argument("--listing", default=None, help="tools/_audio-drive-listing.json")
    ap.add_argument("--json", default=None, help="where to write the id -> hash map")
    ap.add_argument("--census", default=None, help="write the census as markdown too")
    ap.add_argument("--jobs", type=int, default=8)
    a = ap.parse_args()

    here = Path(__file__).resolve().parent
    listing_path = a.listing or (here / "_audio-drive-listing.json")
    out_json = a.json or (here / "_audio-drive-hashes.json")
    root = Path(a.archive)
    if not root.is_dir():
        print(f"archive not found: {root}", file=sys.stderr)
        return 2

    files = letter_side_files(root)
    print(f"archive letter-side mp3s: {len(files)}")

    with ThreadPoolExecutor(max_workers=a.jobs) as ex:
        hashes = list(ex.map(lambda rel: audio_hash(root / rel), files))
    by_rel = {joinkey(rel): h for rel, h in zip(files, hashes)}

    listing = load_listing(listing_path)
    live = load_live(root / "_source-manifests" / "live-allaudio.tsv")
    listing_letter = {p: i for p, i in listing.items()
                      if p.lower().endswith(".mp3")
                      and LETTER_DIR.match(p.split("/")[0])
                      and not SKIP_DIR.match(p.split("/")[0])}

    only_archive = sorted(set(by_rel) - set(listing_letter))
    only_listing = sorted(set(listing_letter) - set(by_rel))
    # live-allaudio.tsv is only usable as an upstream census when it actually
    # covers the tree. On 2026-09-04 it held 804 mp3 rows spanning folders 7,
    # 12, 17, 18, 19, AI Songs and John plus 2 of "0. ALL LETTERS"'s 857 — a
    # truncated rclone run, not a shrunken Drive. Reporting "gone upstream" off
    # a listing that never saw twelve folders manufactures 1,498 phantom losses,
    # so say it is unusable instead.
    live_covers = len({p.split("/")[0] for p in live}) >= 12
    gone_upstream = sorted(set(by_rel) - live) if (live and live_covers) else []

    # id -> hash, for the generator.
    id_hash = {listing_letter[p]: by_rel[p] for p in by_rel if p in listing_letter}
    Path(out_json).write_text(json.dumps(id_hash, indent=0, sort_keys=True) + "\n",
                              encoding="utf-8")

    # Distinct recordings per reader. A hash carried by two files is ONE
    # recording; its reader is the strongest attribution any of its copies has,
    # because the same audio cannot be two readers.
    rank = {"B": 3, "T": 2, "V": 1, "M": 0}
    groups = {}
    for rel, h in by_rel.items():
        groups.setdefault(h, []).append(rel)
    reader_of_hash = {
        h: max((reader_of(Path(p).name) for p in paths), key=lambda r: rank[r])
        for h, paths in groups.items()
    }
    distinct = {}
    for r in reader_of_hash.values():
        distinct[r] = distinct.get(r, 0) + 1
    per_file = {}
    for rel in by_rel:
        r = reader_of(Path(rel).name)
        per_file[r] = per_file.get(r, 0) + 1

    dupes = {h: p for h, p in groups.items() if len(p) > 1}
    cross_reader = {h: p for h, p in dupes.items()
                    if len({reader_of(Path(x).name) for x in p}) > 1}

    lines = []
    add = lines.append
    add(f"archive letter-side mp3s: {len(files)}")
    add(f"distinct audio recordings: {len(groups)}  "
        f"(duplicate groups {len(dupes)}, extra copies {len(files) - len(groups)})")
    add(f"  of those, groups whose copies disagree about the reader: {len(cross_reader)}")
    add("")
    add("per reader — files in the archive vs DISTINCT recordings:")
    for r in ("B", "T", "V", "M"):
        add(f"  {r}: files {per_file.get(r, 0):>5}   distinct {distinct.get(r, 0):>5}")
    add("")
    add(f"Drive listing ({Path(listing_path).name}): {len(listing_letter)} letter-side records")
    add(f"  in the archive but NOT in the listing: {len(only_archive)}")
    add(f"  in the listing but NOT in the archive: {len(only_listing)}")
    if live and live_covers:
        add(f"  in the archive but no longer upstream (live-allaudio.tsv): {len(gone_upstream)}")
    elif live:
        add(f"  live-allaudio.tsv: UNUSABLE as an upstream census — {len(live)} mp3 rows over "
            f"{len({p.split('/')[0] for p in live})} top-level folders; a truncated rclone run, "
            f"not a shrunken Drive. Not diffed.")
    add(f"  id -> hash pairs written: {len(id_hash)} -> {out_json}")
    for label, rows in (("ARCHIVE ONLY", only_archive), ("LISTING ONLY", only_listing),
                        ("GONE UPSTREAM", gone_upstream)):
        if rows:
            add("")
            add(f"{label} ({len(rows)}):")
            for p in rows[:40]:
                add("  " + p)
            if len(rows) > 40:
                add(f"  ... and {len(rows) - 40} more")
    report = "\n".join(lines)
    print(report)
    if a.census:
        Path(a.census).write_text(report + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
