"""batch-align-sections — read-along timings for the WTLB range compilations
(AUDIO_SECTIONS: ONE recording, MANY letters) + the audio-sync-sections.js shipper.

  python tools/batch-align-sections.py                       # every AUDIO_SECTIONS asset
  python tools/batch-align-sections.py --only <assetId>[,..] # the rest carried forward
  python tools/batch-align-sections.py --force --no-ship

Per section asset: the candidate letters -- the label's range ("Part 3 · 40–59"
is Drive numbers 40..59; the Drive number of a letter is read off its PRIMARY
recording's file name in tools/_audio-drive-listing.json, because WTLB II's
Drive numbering repeats 002 and 003 so corpus `num` is NOT the Drive number
there; letters numbered past the LAST range ride with the last asset and the
audio decides) -- become ONE virtual Format-B letter: each letter's spoken
title as a fragment, then its fragments with a global paragraph index. That
virtual letter goes through the letters' own dual-leg belt (hone-align.run_belt,
settings family letters-A, MMS forced alignment + whisper large-v3 witness),
and the rows come back per letter on the compilation file's clock:

  AUDIO_SYNC_SECTIONS[assetId][volKey:letterId] = [[t, pi, cs, ce, 0], ...]

Same row shape as AUDIO_SYNC (t = seconds from the start of the SECTION file;
pi/cs/ce in the letter's own corpus domain); inner key order = playback order.
The ship gate is the letters' (tag_of): a letter below 0.60 coverage is ABSENT
from its asset -- never a wrong highlight -- and the page follows to the next
present letter. Belts bank as _align-work/hone/sections__<assetId>.large-v3.json
(resumable: settings + fragments hash, like batch-align.py). Shape agreed with
the readalong lane: D:\\Swarm\\lanes\\align\\wtlb-shape.md (2026-09-20).
"""
import argparse
import importlib.util
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
DATA = os.path.join(ROOT, "app", "src", "main", "assets", "src", "data")
OUT_JS = os.path.join(DATA, "audio-sync-sections.js")
LISTING = os.path.join(BASE, "_audio-drive-listing.json")
VOL_FILES = {"wtlb1": ("wtlb-one.js", "WTLB_ONE"), "wtlb2": ("wtlb-two.js", "WTLB_TWO")}

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, BASE)


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(BASE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ba = _load("batch_align", "batch-align.py")     # is_current / metrics / tag_of, and its ha + al
ha, al = ba.ha, ba.al


def corpus_order(vol):
    """Letter ids of a WTLB volume in corpus (playback) order."""
    fname, gname = VOL_FILES[vol]
    text = open(os.path.join(DATA, fname), encoding="utf-8").read()
    arr = json.loads(re.search(r"var " + gname + r" = (\[.*\]);", text, re.S).group(1))
    return [(l["id"], l["title"]) for l in arr]


def drive_numbers(vol, manifest):
    """volKey:letterId -> the Drive number on its primary recording's file name."""
    if not os.path.exists(LISTING):
        raise SystemExit(f"{LISTING} missing -- copy tools/_audio-drive-listing.json from main")
    names = {e["id"]: e["path"].rsplit("/", 1)[-1] for e in json.load(open(LISTING, encoding="utf-8"))}
    pat = re.compile(r"^WTLB2\.(\d+)_" if vol == "wtlb2" else r"^WTLB_(\d+)_")
    out = {}
    for key, rows in manifest.items():
        if key.split(":", 1)[0] != vol:
            continue
        m = pat.match(names.get(rows[0][0], ""))
        if m:
            out[key] = int(m.group(1))
    return out


def label_range(label):
    m = re.search(r"(Intro|\d+)\s*[–-]\s*(\d+)", label)
    if not m:
        raise SystemExit(f"cannot read a range off the section label {label!r}")
    return (1 if m.group(1) == "Intro" else int(m.group(1))), int(m.group(2))


def candidates(vol, label, last_hi, manifest):
    """Letter keys the label says this asset reads, in playback order."""
    lo, hi = label_range(label)
    dn = drive_numbers(vol, manifest)
    keys = []
    for lid, title in corpus_order(vol):
        key = f"{vol}:{lid}"
        n = dn.get(key)
        if n is None:
            continue                       # no numbered recording: nothing says where it sits
        if lo <= n <= hi or (hi == last_hi and n > hi):
            keys.append((key, title))
    return keys


def virtual_letter(keys):
    """One Format-B fragment list for many letters: title fragment (pi < 0,
    dropped on output) then the letter's fragments with a global pi. Returns
    (fragments, owner) where owner[fi] = (key, local pi) or None for a title."""
    frags, owner, base = [], [], 0
    for idx, (key, title) in enumerate(keys):
        lf, fmt = ha.fragments_for(key)
        if fmt != "B":
            raise SystemExit(f"{key} is Format {fmt}; the compilations are WTLB (Format B) only")
        frags.append({"pi": -(idx + 1), "cs": -1, "ce": -1, "text": title, "bi": idx})
        owner.append(None)
        top = -1
        for f in lf:
            frags.append({"pi": base + f["pi"], "cs": f["cs"], "ce": f["ce"], "text": f["text"], "bi": idx})
            owner.append((key, f["pi"]))
            top = max(top, f["pi"])
        base += top + 1
    return frags, owner


def per_letter(d, owner, frags):
    """(rows, stats) per letter key from a belt: rows on the section's clock;
    stats = (coverage, unspokenShare, shipped, total) with the letters' metric
    (UNSPOKEN tokens leave the denominator)."""
    rows, tok, uns, hit, tot, shp = {}, {}, {}, {}, {}, {}
    for r in d["results"]:
        o = owner[r["fi"]]
        if o is None:
            continue                       # the spoken title: aligned, never painted
        key, pi = o
        tok[key] = tok.get(key, 0) + r["tokens"]
        hit[key] = hit.get(key, 0) + r["hit"]
        tot[key] = tot.get(key, 0) + 1
        if r["status"] == "UNSPOKEN":
            uns[key] = uns.get(key, 0) + r["tokens"]
        if r.get("ship_t") is not None and r["tokens"]:
            f = frags[r["fi"]]
            rows.setdefault(key, []).append([r["ship_t"], pi, f["cs"], f["ce"], 0])
            shp[key] = shp.get(key, 0) + 1
    stats = {}
    for key in tot:
        cov = hit.get(key, 0) / max(1, tok[key] - uns.get(key, 0))
        stats[key] = (cov, uns.get(key, 0) / max(1, tok[key]), shp.get(key, 0), tot[key])
    return rows, stats


def belt_path(fid):
    return os.path.join(ha.HONE, f"sections__{fid}.large-v3.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated section asset ids to align THIS run")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-ship", action="store_true")
    a = ap.parse_args()
    s = al.settings_for("letters-A")
    want_hash = al.settings_hash(s)
    manifest = ha.js_object("AUDIO_MANIFEST")
    sections = ha.js_object("AUDIO_SECTIONS")
    only = {u for u in a.only.split(",") if u}
    all_ids = [fid for rows in sections.values() for _, fid, _ in rows]
    if only - set(all_ids):
        raise SystemExit(f"--only names ids not in AUDIO_SECTIONS: {sorted(only - set(all_ids))}")

    result, report, failures = {}, [], []
    for vol, rows in sections.items():
        last_hi = max(label_range(label)[1] for label, _, _ in rows)
        for label, fid, reader in rows:
            if only and fid not in only:
                continue
            keys = candidates(vol, label, last_hi, manifest)
            frags, owner = virtual_letter(keys)
            vkey = f"sections:{fid}"
            # ponytail: run_belt resolves fragments and tracks by KEY through two
            # module-level caches; a virtual key injected into both is the whole
            # adapter. A real hook in hone-align.py is the upgrade if a third
            # caller ever needs one.
            ha._FRAGS_ALL[vkey] = {"fragments": frags, "format": "B"}
            manifest[vkey] = [[fid, reader]]
            path = belt_path(fid)
            frag_hash = ha.fragments_hash(frags)
            print(f"[{vol}] {label}  {fid}  {len(keys)} letters ({keys[0][0]} .. {keys[-1][0]}), "
                  f"{len(frags)} fragments", flush=True)
            if not a.force and ba.is_current(path, want_hash, frag_hash):
                d = json.load(open(path, encoding="utf-8"))
                print("  current belt reused")
            else:
                try:
                    d = ha.run_belt(vkey, dict(s), None)
                except Exception as e:                                   # noqa: BLE001
                    failures.append((fid, str(e).splitlines()[0][:110]))
                    print(f"  ERROR {e}")
                    al.release_caches()
                    continue
                al.release_caches()          # run_belt wrote belt_path(fid) itself (key -> sections__<fid>)
            lrows, stats = per_letter(d, owner, frags)
            timeline = {}
            for key, _ in keys:
                cov, uns, shp, tot = stats.get(key, (0.0, 0.0, 0, 0))
                tag = ba.tag_of(cov, uns, shp, tot)
                report.append((fid, label, key, cov, shp, tot, tag, uns))
                if tag != "EXCLUDED" and lrows.get(key):
                    timeline[key] = lrows[key]
            # playback order is the candidates' order; the audio must agree
            starts = [timeline[k][0][0] for k, _ in keys if k in timeline]
            if any(b < a_ for a_, b in zip(starts, starts[1:])):
                failures.append((fid, "letters are not in candidate order in the audio; see the report"))
            result[fid] = timeline
            print(f"  {len(timeline)}/{len(keys)} letters shipped  "
                  f"{sum(len(v) for v in timeline.values())} rows  rss {al.rss_gb():.2f} GB")

    os.makedirs(ba.REPORTS, exist_ok=True)
    rep_path = os.path.join(ba.REPORTS, "batch-sections.txt")
    with open(rep_path, "w", encoding="utf-8") as f:
        f.write(f"batch-align-sections  settings {want_hash}\n")
        f.write(f"{sum(1 for r in report if r[6].startswith('OK'))} OK / "
                f"{sum(1 for r in report if r[6] == 'REVIEW')} REVIEW / "
                f"{sum(1 for r in report if r[6] == 'EXCLUDED')} EXCLUDED of {len(report)} letters "
                f"({len(failures)} errors)\n\n")
        for fid, label, key, cov, shp, tot, tag, uns in sorted(report, key=lambda r: r[3]):
            u = f" U{uns:.2f}" if uns else ""
            f.write(f"  {cov:.3f}  {tag:8s} {shp:>3}/{tot:<3}{u}  {label:22s} {key}\n")
        for fid, err in failures:
            f.write(f"  ERROR  {fid}  {err}\n")
    print(f"report -> {rep_path}")
    if a.no_ship:
        return 1 if failures else 0
    ship(result, sections, manifest, want_hash)
    return 1 if failures else 0


def ship(result, sections, manifest, want_hash):
    """Rebuild audio-sync-sections.js: this run's assets replace their entries,
    every other asset keeps what it shipped (a crash is not a regression)."""
    prev = {}
    if os.path.exists(OUT_JS):
        m = re.search(r"var AUDIO_SYNC_SECTIONS = (\{.*?\n\});", open(OUT_JS, encoding="utf-8").read(), re.S)
        if m:
            prev = json.loads(m.group(1))
    ids = [fid for rows in sections.values() for _, fid, _ in rows]
    out = {}
    for fid in ids:                                  # AUDIO_SECTIONS order, never alphabetical
        if fid in result:
            out[fid] = result[fid]
        elif fid in prev:
            out[fid] = prev[fid]
            print(f"  CARRIED FORWARD  {fid}  (no result this run -- its shipped timings are kept)")
    for fid, tl in out.items():
        for key, rows in tl.items():
            assert key in manifest and not key.startswith("sections:"), f"{fid}: {key} is not a manifest key"
            assert all(len(r) == 5 and r[4] == 0 for r in rows), f"{fid}/{key}: non-5-tuple"
    lines = []
    for fid, tl in out.items():
        inner = ",\n".join(json.dumps(k) + ":" + json.dumps(v) for k, v in tl.items())
        lines.append(json.dumps(fid) + ":{\n" + inner + "\n}")
    body = (
        "/* AUDIO SYNC SECTIONS — read-along timings for the WTLB range compilations,\n"
        "   generated by tools/batch-align-sections.py (settings " + want_hash + "). DO NOT EDIT.\n"
        "   AUDIO_SYNC_SECTIONS[sectionAssetId][\"volKey:letterId\"] = [[startSec, paraIndex,\n"
        "   charStart, charEnd, 0], ...] — the AUDIO_SYNC row shape, startSec on the SECTION\n"
        "   file's clock (one recording reads many letters). Inner key order is playback\n"
        "   order; a letter's start is its first row; a letter the recording skips or the\n"
        "   belt could not prove is absent. Loaded lazily by utils/sync-loaders.js. */\n"
        "var AUDIO_SYNC_SECTIONS = {\n" + ",\n".join(lines) + "\n};\n")
    open(OUT_JS, "w", encoding="utf-8", newline="\n").write(body)
    n_letters = sum(len(tl) for tl in out.values())
    print(f"audio-sync-sections.js: {len(out)} assets, {n_letters} letter timelines, "
          f"{sum(len(r) for tl in out.values() for r in tl.values())} rows, {os.path.getsize(OUT_JS)} B")


if __name__ == "__main__":
    sys.exit(main())
