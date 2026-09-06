"""validate-bible-sync — the Bible read-along data file, checked the way a gate would.

  py -3.13 tools/validate-bible-sync.py [--edition brm-kjv] [--data <path>] [--structural]

Read-only. For every chapter in src/data/bible-sync-<edition>.js:
  - the array has one slot per verse NUMBER, 1..max(n), of the CURRENT reference
    corpus (a fresh extract through tools/extract-bible-verses.mjs, never the
    cache) -- NOT one per verse: an edition may number sparsely, and a slot it
    has no verse for is excluded by versification, reported by name
  - no slot carries a timing for a verse number the edition does not have
  - slots are non-negative integers; the non-zero onsets never step backwards
  - the last onset lies inside the chapter's local audio (ffprobe)
  - the belt on disk is current: today's settings hash, the fresh verses hash,
    the local mp3's byte size; its proven share clears the 60% ship gate
  - the shipped array is byte-equal to what ship() rebuilds from that belt
and every belt that clears the gate has a chapter in the file (nothing silently
dropped). Exit 1 on any problem; the summary names each one.

--structural (CI, any clone without the belts or the audio): only the checks that
need nothing but the repo -- one slot per verse of the current corpus, integer
non-negative slots, onsets never stepping backwards. The belt / audio / rebuild
checks are the pre-commit hook's job on the machine that aligned. The summary
line says which mode ran so a log can never be mistaken for the full gate.

This is the gate the pipeline lacked when c40 shipped: check-audio-sync covers
the letters, validate-schemas never looks at this file. Wired into pre-commit
(full) and CI (structural) in c43.
"""
import argparse
import functools
import hashlib
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


@functools.lru_cache(maxsize=None)
def _ffprobe_dur(path, mtime_ns, size):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", path], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return None


def ffprobe_dur(path):
    """The chapter's duration, memoised on (path, mtime, size).

    Memoised because FULL mode asks for every chapter's duration TWICE -- once in
    the per-chapter loop and once in the sidecar audit -- and each miss is a
    process spawn; without it the audit doubled the pre-commit gate.

    Keyed on the file's IDENTITY and not on its NAME: a cache keyed by path alone
    is a stale read the moment one process writes an mp3 and then probes it,
    which is what a re-encode pass regenerating in-process would do. The stat is
    one syscall against a process spawn, so the guard is free.
    Ceiling: mtime and size can collide in principle; hashing on every probe to
    close that would cost more than the cache saves, and no caller re-encodes a
    chapter to the same byte size inside one filesystem timestamp tick."""
    try:
        st = os.stat(path)
    except OSError:
        return None
    return _ffprobe_dur(path, st.st_mtime_ns, st.st_size)


def flat_translation_map(translation):
    """The whole bible-<code>.js map in one read (the flat-map translations only).
    Byte-for-byte the same verses the per-chapter extractor returns for these files
    (it reads the same global and only String()s the text), so hashing them here is
    hashing what the belts were stamped with -- but 1,189 node spawns become one
    json.loads. NKJV (books.js, Format C with sections) still goes through the
    extractor: that shape and the matthew-plain alias live there."""
    if translation == "nkjv":
        return None
    path = os.path.join(DATA, f"bible-{translation}.js")
    prefix = "var BIBLE_" + translation.upper() + " = "
    src = open(path, encoding="utf-8").read()
    if not src.startswith(prefix):
        return None
    body = src[len(prefix):].rstrip()
    if not body.endswith(";"):
        return None
    return json.loads(body[:-1])


def fresh_verses(bab, ed, book, ch, tmp, flat=None):
    if flat is not None:
        rows = flat.get("matthew-plain" if book == "matthew" else book, {}).get(str(ch))
        if rows is None:
            return None
        return sorted(({"n": r["n"], "text": str(r["text"])} for r in rows), key=lambda r: r["n"])
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


FACTS = os.path.join(BASE, "audio-facts.json")


def load_audio_facts(path, ed):
    """(book, chapter) -> the recorded facts, from the committed sidecar.

    Returns None when this edition has no section, which is a different answer
    from an empty one: an edition the sidecar has never heard of must fail loudly
    rather than pass with nothing to check."""
    doc = json.load(open(path, encoding="utf-8"))
    section = doc.get("editions", {}).get(ed)
    if section is None:
        return None
    # Keyed by asset id in the file; re-keyed here on the book and chapter the
    # file records BESIDE the id, never re-derived from the id with a second copy
    # of the naming regex -- the one naming rule lives in the producer.
    return {(f["book"], f["chapter"]): dict(f, assetId=asset)
            for asset, f in section.items()}


def facts_shape_problems(ed, facts, prefix):
    """Does every sidecar entry NAME the chapter it claims to describe?

    The only identity leg a clone can run: an entry whose asset id does not end
    in _<book>_<chapter> is mis-keyed, and a mis-keyed entry is a real record
    that describes the wrong file -- which is exactly what a hand edit or a bad
    regeneration produces. It cannot be checked against the audio (CI has none),
    so it is checked against the book and chapter the entry records beside the
    id. The volume digit is not reconstructed: audio_index() reads it off the
    filename ([12]) and there is nothing in the repo that knows which."""
    out = []
    for (book, ch), f in sorted(facts.items()):
        asset = f.get("assetId", "")
        tag = "%s_%03d" % (book, ch)
        if not asset.endswith("_%s_%03d" % (book, ch)):
            out.append((tag, f"audio-facts asset id {asset!r} does not name {book} {ch}"))
        elif prefix and not asset.startswith(prefix):
            out.append((tag, f"audio-facts asset id {asset!r} is not a {prefix!r} asset "
                             f"(wrong edition's entry in the {ed} section?)"))
    return out


def audit_facts(ed, idx, facts, hashes):
    """FULL mode only: is the committed sidecar still true of the real audio?

    Without this the sidecar is self-certifying -- it would agree with any belt,
    including a wrong one, which is green in exactly the case it exists to catch.

    A finding here NAMES BOTH PARTIES on purpose. Every leg fires identically
    when the sidecar drifted and when the AUDIO was swapped under it -- which is
    the case the guard exists for -- and a message that said "sidecar is stale"
    invited a reflex regeneration that would launder the swap into a green
    sidecar. The tool cannot tell which side moved; the reader can.
    FULL audits it; CI trusts it. bytes and dur are nearly free here because FULL
    already stats and ffprobes every chapter; the sha256 leg re-reads ~780 MB and
    is opt-in."""
    out = []
    for (book, ch), (path, asset) in sorted(idx.items()):
        f = facts.get((book, ch))
        tag = "%s_%03d" % (book, ch)
        if not f:
            out.append((tag, "audio on disk but no entry in audio-facts.json (regenerate it)"))
            continue
        if f.get("assetId") != asset:
            out.append((tag, f"audio-facts assetId {f.get('assetId')} != {asset} on disk"))
        if f.get("bytes") != os.path.getsize(path):
            out.append((tag, "audio-facts bytes != local mp3 "
                             "(sidecar or audio changed; find which before regenerating)"))
        d = ffprobe_dur(path)
        if d is not None and abs(d - f.get("dur", -1)) > 0.01:
            out.append((tag, f"audio-facts dur {f.get('dur')} != ffprobe {d:.3f} "
                             f"(sidecar or audio changed; find which before regenerating)"))
        if hashes:
            h = hashlib.sha256()
            with open(path, "rb") as fh:
                for block in iter(lambda: fh.read(1 << 20), b""):
                    h.update(block)
            if h.hexdigest() != f.get("sha256"):
                out.append((tag, "audio-facts sha256 != local mp3 "
                                 "(sidecar or audio changed; find which before regenerating)"))
    for (book, ch) in sorted(set(facts) - set(idx)):
        out.append(("%s_%03d" % (book, ch), "audio-facts entry with no audio on disk"))
    return out


def check(ed, a):
    """Validate ONE edition's data file. Returns 0 when it is clean."""
    bab = load(os.path.join(BASE, "batch-align-bible.py"), "batch_align_bible")
    if ed not in bab.EDITIONS:
        print(f"FAIL: src/data/bible-sync-{ed}.js exists but {ed!r} is not a known edition "
              f"in batch-align-bible.py (known: {', '.join(sorted(bab.EDITIONS))})")
        return 1
    want = al.settings_hash(al.settings_for(bab.EDITIONS[ed]["family"]))
    structural = a.structural
    facts = None
    if a.audio_facts:
        facts = load_audio_facts(a.audio_facts, ed)
        if facts is None:
            print(f"FAIL: {a.audio_facts} has no section for edition {ed!r} "
                  f"(regenerate it with tools/build-audio-facts.py --edition {ed})")
            return 1
        shape = facts_shape_problems(ed, facts, bab.EDITIONS[ed].get("prefix"))
        if shape:
            print(f"FAIL: {len(shape)} malformed entr(y/ies) in {a.audio_facts}")
            for tag, why in shape[:200]:
                print(f"  {tag:22s} {why}")
            return 1
    idx = {} if (structural or facts is not None) else bab.audio_index(ed)
    belts_dir = os.path.join(BASE, "_align-work", "bible", ed)
    flat = flat_translation_map(bab.EDITIONS[ed]["translation"])
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
    absent = []                 # slots this edition has no verse for
    for book in table:
        for ch_s, arr in table[book].items():
            ch = int(ch_s)
            tag = f"{book}_{ch:03d}"
            chapters += 1
            shipped.add((book, ch))
            verses = fresh_verses(bab, ed, book, ch, tmp, flat)
            if verses is None:
                problems.append((tag, "reference verses could not be extracted"))
                continue
            slots += len(arr)
            zeros += sum(1 for v in arr if not v)
            # ONE SLOT PER VERSE NUMBER, not one per verse. The array is
            # addressed by the edition's own verse numbers (ship() writes
            # arr[n - 1] and sizes to max(n)), and some editions number
            # SPARSELY: the WEB omits acts 8:37, acts 15:34, acts 24:7 and
            # luke 17:36 while keeping the verses after each gap at their own
            # numbers. Comparing against len(verses) failed all four of those
            # chapters on a correctly shipped file -- measured 2026-09-05
            # against a fixture built by ship()'s own formula, and it would
            # have blocked the WEB ship. rebuild() below already used max(n);
            # the two legs of this gate disagreed and only one of them fired.
            nums = {v["n"] for v in verses}
            if not nums:
                # The old len() comparison degraded into a plain problem line
                # here; max() would raise and take the whole gate down with it,
                # and a gate that crashes is a gate someone bypasses.
                problems.append((tag, "reference corpus has no verses for this chapter"))
                continue
            want_len = max(nums)
            if len(arr) != want_len:
                problems.append((tag, f"{len(arr)} slots for verse numbers 1..{want_len}"))
            # The other half, and the one that catches a DENSE shipper: a
            # timing may only sit at a slot this edition actually numbers.
            # Packing rows densely puts acts 8's verse 38 at index 36, i.e. at
            # verse 37, which the WEB does not have -- the array stays a
            # plausible length and every other check here passes.
            stray = [i + 1 for i, v in enumerate(arr) if v and (i + 1) not in nums]
            if stray:
                problems.append((tag, f"timed at verse {', '.join(map(str, stray[:5]))}"
                                      f"{' …' if len(stray) > 5 else ''}, which this edition does not have"))
            # A ZERO slot the edition has no verse for is EXCLUDED BY
            # VERSIFICATION, not untimed. Reported apart from the unproven zeros
            # so no later session chases it as an alignment gap (Orchestrator,
            # 2026-09-05). It must stay a subset of the zeros: a NON-zero slot at
            # a verse number the edition lacks is the `stray` defect above, and
            # counting it here made the summary print "-2 unproven" on a dense
            # file -- a nonsense number that still reads like a count.
            for n in range(1, len(arr) + 1):
                if n not in nums and not arr[n - 1]:
                    absent.append(f"{book} {ch}:{n}")
            if any((not isinstance(v, int)) or isinstance(v, bool) or v < 0 for v in arr):
                problems.append((tag, "non-integer or negative slot"))
            last = 0
            for i, v in enumerate(arr):
                if v and v < last:
                    problems.append((tag, f"onset steps backwards at verse {i + 1}"))
                if v:
                    last = v
            if structural:
                continue
            if facts is not None:
                # FACTS mode: the two legs a clone can run with no audio and no
                # belts. The belt legs below need tools/_align-work/, which is
                # .gitignore'd, so they stay the aligning machine's job -- and the
                # mode line says so, because a leg that quietly does not run reads
                # exactly like a leg that passed.
                f = facts.get((book, ch))
                if not f:
                    problems.append((tag, "no audio facts for this chapter "
                                          "(regenerate tools/audio-facts.json)"))
                    continue
                if last / 100.0 >= f["dur"]:
                    problems.append((tag, f"last onset {last / 100:.2f}s is past "
                                          f"the audio end {f['dur']:.2f}s"))
                continue
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
    for name in ([] if (structural or facts is not None) else os.listdir(belts_dir)):
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

    audited = "ABSENT"
    n_audit = 0
    if not structural and facts is None:
        # A missing sidecar is named in the mode line rather than skipped.
        if os.path.exists(FACTS):
            on_disk = load_audio_facts(FACTS, ed)
            if on_disk is None:
                problems.append(("audio-facts", f"no section for edition {ed!r}"))
            else:
                # PREPENDED, not appended. A stale sidecar makes every duration
                # finding below it suspect, so the instrument's own health is the
                # first thing to read -- and problems are printed truncated at
                # 200, which had put these last where a bad run hid them.
                audit = audit_facts(ed, idx, on_disk, a.audit_audio_hashes)
                # PREPENDED, and counted separately below: a stale sidecar makes
                # every duration finding under it suspect, so the instrument's
                # own health is the first thing to read. Findings print truncated
                # at 200, and appending had put these last -- where a run with
                # 1,188 other problems hid them completely.
                n_audit = len(audit)
                problems[:0] = audit
                audited = "audited incl. sha256" if a.audit_audio_hashes else "audited, bytes+dur"
    if structural:
        mode = "STRUCTURAL (corpus shape only; belts + audio not checked)"
    elif facts is not None:
        mode = ("FACTS (corpus shape + audio duration and presence from the committed "
                "sidecar; belts and audio bytes NOT checked)")
    else:
        mode = f"FULL (audio-facts.json {audited})"
    print(f"{data_path}: {chapters} chapters, {slots} verse slots, {slots - zeros} timed, "
          f"{zeros - len(absent)} unproven, {len(absent)} excluded by versification  "
          f"(settings {want}, audio index {len(idx)} chapters, mode {mode})")
    if absent:
        # Named, because an unnamed count is what a later session mistakes for
        # an alignment gap and spends card time chasing.
        print(f"  excluded by versification ({len(absent)}): {', '.join(absent[:20])}"
              f"{' …' if len(absent) > 20 else ''}")
    if problems:
        print(f"FAIL: {len(problems)} problem(s)"
              + (f", of which {n_audit} are audio-facts audit findings (listed first)"
                 if n_audit else ""))
        for tag, why in problems[:200]:
            print(f"  {tag:22s} {why}")
        return 1
    if structural:
        print("OK (structural): every chapter has one integer slot per corpus verse and onsets never step back")
        return 0
    if facts is not None:
        print("OK (facts): every chapter's last onset lies inside the duration the committed "
              "sidecar records, and every shipped chapter has an entry")
        return 0
    print("OK: every chapter matches its corpus, its audio and its belt; every current belt is shipped")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--edition", default="brm-kjv")
    ap.add_argument("--data", help="data file to check (default src/data/bible-sync-<edition>.js)")
    ap.add_argument("--structural", action="store_true",
                    help="corpus-shape checks only: no belts, no local audio, no ffprobe (CI)")
    ap.add_argument("--audio-facts", nargs="?", const=FACTS, default=None,
                    help="check every last onset against the durations in the committed "
                         "audio-facts sidecar (CI, on a clone with no audio); the bare flag "
                         "uses tools/audio-facts.json")
    ap.add_argument("--audit-audio-hashes", action="store_true",
                    help="FULL mode only: also re-hash every mp3 to prove the sidecar is "
                         "current (~780 MB of reads); bytes and duration are audited anyway")
    # Both callers -- ci.yml and .githooks/pre-commit -- used to invoke this with
    # no --edition at all, so they checked brm-kjv and nothing else while their
    # own comments claimed "every chapter in src/data/bible-sync-*.js". The
    # hook's trigger already matches any bible-sync-<edition>.js, so the WEB
    # edition now being aligned would have STAGED a new timings file, FIRED the
    # gate, and had the gate validate a different file and pass. A gate that runs
    # on the wrong input is worse than none: it reads as coverage.
    ap.add_argument("--all-editions", action="store_true",
                    help="check every src/data/bible-sync-<edition>.js on disk")
    a = ap.parse_args()
    if a.audio_facts and a.structural:
        ap.error("--structural runs no audio checks at all, so --audio-facts would have "
                 "nothing to do; pick one")
    if a.audit_audio_hashes and (a.structural or a.audio_facts):
        ap.error("--audit-audio-hashes audits the sidecar against the real mp3s, which only "
                 "FULL mode has")
    if not a.all_editions:
        return check(a.edition, a)
    if a.data:
        ap.error("--data names one file and cannot be combined with --all-editions")
    pat = re.compile(r"^bible-sync-(.+)\.js$")
    eds = sorted(m.group(1) for m in map(pat.match, os.listdir(DATA)) if m)
    if not eds:
        print("FAIL: --all-editions found no src/data/bible-sync-*.js to check")
        return 1
    # Every edition is checked even after one fails: a short report hides the
    # rest, and the point of the flag is that nothing goes unlooked-at.
    return max(check(ed, a) for ed in eds)


if __name__ == "__main__":
    sys.exit(main())
