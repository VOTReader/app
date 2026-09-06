"""build-audio-facts — commit the FACTS about the audio, because the audio never can.

  py -3.13 tools/build-audio-facts.py [--edition <ed>]... [--out tools/audio-facts.json]

Writes one small JSON file recording, per chapter asset: its byte size, its
duration, and the sha256 of its contents. That file is committed; the mp3s are
not (433 MB for ONE edition, and tools/_align-work/ and the BibleAudio drive are both
outside the repo).

WHY IT EXISTS. Until now no LANDING gate has ever checked that a shipped timing
matches its audio. validate-bible-sync.py has the check -- "the last onset lies
inside the chapter's local audio" -- but ci.yml and ci-gates.sh both pass
--structural, deliberately, because the check reaches through a .gitignore'd
path into a drive CI does not have. With this file committed, that leg runs on
any clone.

WHAT IT CANNOT SEE, and this belongs in the artifact rather than in a handoff:
even with this file, CI checks facts ABOUT the audio and never the audio. A
belt whose onsets are all shifted two seconds but still inside the duration
passes every leg here. The honest pairing is

    this sidecar        catches THE RECORDING CHANGED UNDER THE BELT
    e2e:readalong       catches THE BELT IS WRONG ABOUT THE RECORDING

They are complements, not substitutes. "CI now verifies the timings against the
audio" is the sentence people will remember and it is false.

THE CIRCULARITY TRAP. Durations, sizes and hashes come from ffprobing and
reading the MP3s -- never from the belts. A sidecar derived from the belts is
self-consistent by construction: it agrees with any belt including a wrong one,
so it would be green in exactly the case it exists to catch. (Precedent already
paid for here: a coverage sidecar taken from a generator's own mapping stage
catches bookkeeping drift and cannot see a mapping regression.) The sidecar's
trustworthiness rests entirely on the run that generates it, which is why
validate-bible-sync.py in FULL mode AUDITS this file against the real audio and
fails when it is stale. FULL audits it; CI trusts it.

THE KEY IS A CONTENT HASH, NOT A BYTE SIZE -- measured, not assumed:

    brm-kjv     1,189 files -> 1,165 distinct sizes | 24 sizes shared, so 48
                               chapters have a size twin IN THEIR OWN EDITION
    web-ebible  1,189 files -> 1,189 distinct sizes | 0 collisions

Forty-eight brm-kjv chapters cannot be told apart by size on today's corpus, and
the collision rate is a property of the EDITION (WEB 0, BRM 48), not of the
format -- so a permanent artifact keyed on size would have been validated by
whichever edition happened to be measured first. `bytes` stays as the cheap
first comparison because the belts record `audioSize` and nothing else; the
identity is the hash.

Re-run this whenever the audio changes, and commit the result.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
DATA = os.path.join(ROOT, "app", "src", "main", "assets", "src", "data")
DEFAULT_OUT = os.path.join(BASE, "audio-facts.json")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


bab = load(os.path.join(BASE, "batch-align-bible.py"), "batch_align_bible")
# The duration the gate compares against and the duration recorded here must be
# the SAME function, not two callers of ffprobe that agree today: a boundary
# onset is exactly where a rounding difference would show up, and it would show
# up as a data problem rather than as a tooling one.
vbs = load(os.path.join(BASE, "validate-bible-sync.py"), "validate_bible_sync")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def facts_for(ed):
    """assetId -> {book, chapter, bytes, dur, sha256}, from the audio itself.

    Keyed by asset id because that is the file's own identity and the name the
    release carries; book and chapter are recorded beside it so a consumer never
    re-derives them from the key with a second copy of the naming regex."""
    idx = bab.audio_index(ed)
    out = {}
    for (book, ch), (path, asset) in sorted(idx.items()):
        dur = vbs.ffprobe_dur(path)
        if dur is None:
            raise RuntimeError(f"{ed} {book} {ch}: ffprobe gave no duration for {path}")
        out[asset] = {
            "book": book,
            "chapter": ch,
            "bytes": os.path.getsize(path),
            "dur": round(dur, 3),
            "sha256": sha256_file(path),
        }
    # An asset id serving two chapters would silently collapse them and the file
    # would simply be short -- which reads exactly like a chapter the mirror does
    # not carry. Refuse instead.
    if len(out) != len(idx):
        raise RuntimeError(f"{ed}: {len(idx)} chapters collapsed into {len(out)} asset ids")
    return out


def shipped_editions():
    """The editions that actually have a data file to gate, so the default run
    covers exactly what CI will ask about."""
    import re
    pat = re.compile(r"^bible-sync-(.+)\.js$")
    return sorted(m.group(1) for m in map(pat.match, os.listdir(DATA)) if m)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--edition", action="append",
                    help="edition to record (repeatable; default: every shipped one)")
    ap.add_argument("--out", default=DEFAULT_OUT)
    a = ap.parse_args()

    eds = a.edition or shipped_editions()
    if not eds:
        print("FAIL: no src/data/bible-sync-*.js and no --edition, so there is nothing to record")
        return 1
    unknown = [e for e in eds if e not in bab.EDITIONS]
    if unknown:
        print(f"FAIL: unknown edition(s) {', '.join(unknown)} "
              f"(known: {', '.join(sorted(bab.EDITIONS))})")
        return 1
    no_mirror = [e for e in eds if not bab.EDITIONS[e].get("mirror")]
    if no_mirror:
        print(f"FAIL: {', '.join(no_mirror)} has no mirror script, so audio_index() cannot "
              f"resolve its files; record it only once it has one")
        return 1

    editions = {}
    for ed in eds:
        editions[ed] = facts_for(ed)
        n = len(editions[ed])
        sizes = len({f["bytes"] for f in editions[ed].values()})
        hashes = len({f["sha256"] for f in editions[ed].values()})
        print(f"{ed}: {n} chapters  {sizes} distinct sizes  {hashes} distinct hashes"
              f"{'' if hashes == n else '   <-- IDENTICAL AUDIO SHARED BY CHAPTERS'}")

    doc = {
        # "README", not "note": json.dump sorts keys, and "note" would put the
        # sentence saying what this file CANNOT prove at the very end of 482 KB,
        # where a header belongs at the top. "R" sorts before "e" in "editions".
        "README": ("Facts about the chapter audio, ffprobed and hashed from the mp3s. CI checks "
                 "facts ABOUT the audio and never the audio: a belt shifted uniformly inside the "
                 "duration passes every leg here. Regenerate with tools/build-audio-facts.py "
                 "whenever the audio changes; validate-bible-sync.py in FULL mode audits this "
                 "file against the real files and fails when it is stale."),
        "editions": editions,
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    print(f"wrote {a.out}  ({os.path.getsize(a.out):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
