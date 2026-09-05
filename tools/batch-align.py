"""batch-align — volume-scale read-along alignment + audio-sync.js shipper.

  python tools/batch-align.py --volkeys one [--force] [--no-ship]

Per manifest key in the volume: the dual-leg belt via hone-align.py's run_belt
(resumable — a key whose belt JSON already carries the current settings_hash is
skipped unless --force). Alternate renditions align per-asset into their own
timelines. Then the shipper rebuilds src/data/audio-sync.js:

  AUDIO_SYNC[volKey:letterId] = [[t, bi, cs, ce, part], ...]   (5-tuples, asserted)
  AUDIO_SYNC_ALT[assetId]     = [[t, bi, cs, ce, 0], ...]      (one timeline per asset;
                                a multi-asset rendition's parts split per asset, part 0)

Ship gates (owner policy, unchanged): coverage >= 0.90 ships silent, 0.60-0.90
ships + REVIEW list, < 0.60 EXCLUDED (no read-along — never a wrong highlight).
UNSPOKEN rows and interpolated REVIEW guesses are never in tuples (engine-side).
Other volumes' existing sync rows are preserved verbatim. CORPUS_VERSION is NOT
bumped here — the committer bumps once per ship (see flock-audio-sync.bump_corpus).

Report: tools/_align-work/reports/batch-<volkeys>.txt
"""
import argparse
import importlib.util
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
WORK = os.path.join(BASE, "_align-work")
HONE = os.path.join(WORK, "hone")
REPORTS = os.path.join(WORK, "reports")
SYNC_JS = os.path.join(ROOT, "app", "src", "main", "assets", "src", "data", "audio-sync.js")

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, BASE)
import _alignlib as al                                              # noqa: E402

_spec = importlib.util.spec_from_file_location("hone_align", os.path.join(BASE, "hone-align.py"))
ha = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ha)


def _rss_gb():
    """Resident set in GB; the implementation moved to _alignlib.rss_gb so the
    Bible runner's progress line reads the same as this one's."""
    return al.rss_gb()


def belt_path(key, asset=None):
    safe = key.replace(":", "__")
    if asset:
        return os.path.join(HONE, f"{safe}@{asset}.json")
    return os.path.join(HONE, f"{safe}.large-v3.json")


def is_current(path, want_hash, want_frag_hash):
    """A belt is reusable only when EVERY input still matches: the settings AND
    the fragment domain it was aligned against. Settings alone was not enough —
    the 2026-08-12 DOM-offset fix changed offsets without touching settings, so
    a 'resume' silently replayed timings addressed to the old character
    positions and shipped them. Belts without the field predate it: recompute."""
    if not os.path.exists(path):
        return False
    try:
        d = json.load(open(path, encoding="utf-8"))
    except ValueError:
        return False
    return (d.get("settings_hash") == want_hash
            and d.get("fragmentsHash") == want_frag_hash)


def metrics(d):
    """(coverage, unspokenShare) — recomputed from the stored rows so belts
    written before the metric fix report on the same footing as fresh ones.
    Coverage excludes UNSPOKEN units (text proven absent from the recording)."""
    rows = d.get("results") or []
    if not rows:
        return d.get("coverage", 0.0), d.get("unspokenShare", 0.0)
    tok_all = sum(r.get("tokens", 0) for r in rows)
    tok_uns = sum(r.get("tokens", 0) for r in rows if r.get("status") == "UNSPOKEN")
    hit = sum(r.get("hit", 0) for r in rows)
    return hit / max(1, tok_all - tok_uns), tok_uns / max(1, tok_all)


def tag_of(cov, unspoken, shipped, total):
    # A large unspoken share means the transcript, not the page, is suspect —
    # never let it flatter the coverage into a silent ship.
    if unspoken > 0.25:
        return "REVIEW"
    if cov >= 0.90:
        return "OK" if shipped == total else "OK-"
    return "REVIEW" if cov >= 0.60 else "EXCLUDED"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--volkeys", required=True, help="comma-separated volume keys (e.g. one,two)")
    ap.add_argument("--force", action="store_true", help="re-run even when settings_hash matches")
    ap.add_argument("--no-ship", action="store_true", help="align only; do not touch audio-sync.js")
    a = ap.parse_args()
    vols = set(a.volkeys.split(","))
    s = al.settings_for("letters-A")
    want_hash = al.settings_hash(s)
    os.makedirs(REPORTS, exist_ok=True)

    manifest = ha.js_object("AUDIO_MANIFEST")
    alternates = ha.js_object("AUDIO_ALTERNATES")
    keys = sorted(k for k in manifest if k.split(":", 1)[0] in vols)
    print(f"batch-align: {len(keys)} letters in volumes {sorted(vols)}  settings {want_hash}")

    # Units tools/align-supervisor.py killed for memory. A relaunch must not
    # walk straight back into the letter that just took 13.4 GB, or the
    # supervisor and this loop spin against each other until max-restarts.
    # Set by the supervisor, empty in a normal run.
    skip_units = {u for u in os.environ.get("ALIGN_SKIP_UNITS", "").split(",") if u}
    if skip_units:
        print(f"batch-align: skipping {len(skip_units)} unit(s) the supervisor killed for memory: "
              + ", ".join(sorted(skip_units)))

    report, failures = [], []
    for n, key in enumerate(keys, 1):
        if key in skip_units:
            failures.append((key, "SKIPPED — exceeded the supervisor's RSS ceiling"))
            print(f"  [{n}/{len(keys)}] {key}  SKIPPED (memory ceiling)")
            continue
        jobs = [(None, belt_path(key))]
        for reader, assets in alternates.get(key, []):
            jobs.append((assets[0][0], belt_path(key, assets[0][0])))
        for asset, path in jobs:
            label = key + (f"@{asset}" if asset else "")
            frag_hash = ha.fragments_hash(ha.fragments_for(key)[0])
            if not a.force and is_current(path, want_hash, frag_hash):
                d = json.load(open(path, encoding="utf-8"))
            else:
                try:
                    d = ha.run_belt(key, dict(s), asset)
                except Exception as e:
                    failures.append((label, str(e).splitlines()[0][:110]))
                    print(f"  [{n}/{len(keys)}] {label}  ERROR {e}")
                    continue
            cov, unspoken = metrics(d)
            shipped = d.get("shipped", len(d.get("tuples", [])))
            total = d.get("fragments", 0)
            tag = tag_of(cov, unspoken, shipped, total)
            report.append((label, cov, shipped, total,
                           d.get("confirmed", 0), d.get("probed", 0), d.get("review", 0),
                           tag, unspoken))
        # Every 25 items, drop the per-recording arrays and let torch return
        # its blocks. The MODELS stay -- reloading those per item is the fault
        # the singletons exist to avoid -- but everything around them grows.
        if n % 25 == 0:
            al.release_caches()
        if n % 5 == 0 or n == len(keys):
            # Resident memory rides the progress line. The 2026-08-26 run grew
            # from 7.8 GB to 15.3 GB and then stopped completing anything --
            # one core pinned, no belt for 45 minutes -- because run_belt built
            # a fresh whisper + MMS leg per letter. That is fixed, but a creep
            # that is invisible is a creep nobody catches twice.
            print(f"  [{n}/{len(keys)}] {key} done   rss {_rss_gb():.2f} GB", flush=True)

    rep_path = os.path.join(REPORTS, f"batch-{'-'.join(sorted(vols))}.txt")
    with open(rep_path, "w", encoding="utf-8") as f:
        ok = sum(1 for r in report if r[7].startswith("OK"))
        f.write(f"batch-align {sorted(vols)}  settings {want_hash}\n")
        f.write(f"{ok} OK / {sum(1 for r in report if r[7]=='REVIEW')} REVIEW / "
                f"{sum(1 for r in report if r[7]=='EXCLUDED')} EXCLUDED of {len(report)} "
                f"({len(failures)} errors)\n\n")
        for label, cov, shp, tot, c, p, rv, tag, uns in sorted(report, key=lambda r: r[1]):
            u = f" U{uns:.2f}" if uns else ""
            f.write(f"  {cov:.3f}  {tag:8s} {shp:>3}/{tot:<3} C{c} P{p} R{rv}{u}  {label}\n")
        for label, err in failures:
            f.write(f"  ERROR  {label}  {err}\n")
    print(f"report -> {rep_path}")

    if a.no_ship:
        return 0
    ship(vols, report, want_hash, keys)
    return 0 if not failures else 1


def ship(vols, report, want_hash, keys=()):
    """Rebuild audio-sync.js: replace this volume's keys, keep everything else."""
    sync, alt = {}, {}
    if os.path.exists(SYNC_JS):
        prev = open(SYNC_JS, encoding="utf-8").read()
        m = re.search(r"var AUDIO_SYNC = (\{.*?\n\});", prev, re.S)
        if m:
            sync = json.loads(m.group(1))
        m = re.search(r"var AUDIO_SYNC_ALT = (\{.*?\n\});", prev, re.S)
        if m:
            alt = json.loads(m.group(1))
    # A key this run produced NO report row for -- it raised, or the
    # supervisor's RSS ceiling skipped it -- keeps the timings it already
    # ships. Rebuilding from `report` alone DELETED them, so one CTC failure
    # or one memory spike silently became a coverage regression in a file no
    # gate compares against its previous self. A deliberate drop still works
    # and is tested: an EXCLUDED unit HAS a report row, and a key no longer in
    # the manifest is not in `keys`.
    reported = {label.partition("@")[0] for label, *_rest in report}
    keys = set(keys)
    carried = {k: v for k, v in sync.items()
               if k.split(":", 1)[0] in vols and k in keys and k not in reported}
    sync = {k: v for k, v in sync.items() if k.split(":", 1)[0] not in vols}
    sync.update(carried)
    for k in sorted(carried):
        print(f"  CARRIED FORWARD  {k}  (no result this run -- its shipped timings are kept)")

    shipped_n = alt_n = 0
    for label, cov, shp, tot, c, p, rv, tag, uns in report:
        if tag == "EXCLUDED":
            continue
        key, _, asset = label.partition("@")
        d = json.load(open(belt_path(key, asset or None), encoding="utf-8"))
        tuples = d.get("tuples", [])
        if not tuples:
            continue
        assert all(len(t) == 5 for t in tuples), f"non-5-tuple in {label}"
        if not asset:
            sync[key] = tuples
            shipped_n += 1
        else:
            # split a rendition's parts into per-asset timelines, part 0 each
            part_assets = {pr["part"]: pr["asset"] for pr in d.get("parts", [])}
            for part_idx, aid in part_assets.items():
                rows = [[t, bi, cs, ce, 0] for t, bi, cs, ce, pt in tuples if pt == part_idx]
                if rows:
                    alt[aid] = rows
                    alt_n += 1

    lines = [json.dumps(k) + ":" + json.dumps(sync[k]) for k in sorted(sync)]
    alt_lines = [json.dumps(k) + ":" + json.dumps(alt[k]) for k in sorted(alt)]
    body = (
        "/* AUDIO SYNC — read-along timings, generated by tools/batch-align.py\n"
        "   (settings " + want_hash + "; supersedes align-audio.py output volume by volume).\n"
        "   DO NOT EDIT. AUDIO_SYNC[\"volKey:letterId\"] = [[startSec, blockIndex,\n"
        "   charStart, charEnd, partIndex], ...] — clause/sentence onsets, belt-proven\n"
        "   only (no interpolations, no unspoken text). Format-B rows use charStart =\n"
        "   charEnd = -1 (whole-paragraph paint). Offsets live in the block's DOM\n"
        "   textContent domain. AUDIO_SYNC_ALT[assetId] = same shape, one timeline per\n"
        "   alternate-rendition asset, partIndex always 0. */\n"
        "var AUDIO_SYNC = {\n" + ",\n".join(lines) + "\n};\n"
        "var AUDIO_SYNC_ALT = {\n" + ",\n".join(alt_lines) + "\n};\n")
    open(SYNC_JS, "w", encoding="utf-8", newline="\n").write(body)
    print(f"audio-sync.js: {len(sync)} letters ({shipped_n} from this batch, "
          f"{len(carried)} carried forward), {len(alt)} alternate timelines ({alt_n} new)")


if __name__ == "__main__":
    sys.exit(main())
