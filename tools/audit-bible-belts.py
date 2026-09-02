"""audit-bible-belts — what the alignment belts say about the chapter CUTS.

  py -3.13 tools/audit-bible-belts.py [--edition brm-kjv]

Read-only. A chapter file that starts late or ends early shows up in its belt
as UNSPOKEN verses at the head or the tail (the words are provably not in the
recording); a file that carries a neighbour's audio hides behind the edge
stars and shows up in the NEIGHBOUR instead. So, per belt: leading UNSPOKEN
run, trailing UNSPOKEN run, UNSPOKEN anywhere, proven share, and whether the
belt is current for the audio on disk. Then a table of the suspects and a
one-line verdict. Complements the whole-book transcript audit
(D:/BibleAudio/boundary-audit.py), which cannot see errors beyond its
+-60 s window -- this can, because it reads the chapter files themselves.
"""
import argparse
import importlib.util
import json
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, BASE)
import _alignlib as al                                              # noqa: E402


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--edition", default="brm-kjv")
    a = ap.parse_args()
    bab = load(os.path.join(BASE, "batch-align-bible.py"), "batch_align_bible")
    want = al.settings_hash(al.settings_for(bab.EDITIONS[a.edition]["family"]))
    idx = bab.audio_index(a.edition)
    belts_dir = os.path.join(BASE, "_align-work", "bible", a.edition)
    rows, missing = [], []
    for (book, ch), (path, _asset) in sorted(idx.items()):
        bp = os.path.join(belts_dir, f"{book}_{ch:03d}.json")
        if not os.path.exists(bp):
            missing.append(f"{book}_{ch:03d}")
            continue
        d = json.load(open(bp, encoding="utf-8"))
        vs = d["verses"]
        st = [v["status"] for v in vs]
        lead = 0
        while lead < len(st) and st[lead] == "UNSPOKEN":
            lead += 1
        trail = 0
        while trail < len(st) and st[-1 - trail] == "UNSPOKEN":
            trail += 1
        current = (d.get("settings_hash") == want and d.get("audioSize") == os.path.getsize(path))
        rows.append((book, ch, len(vs), lead, trail, st.count("UNSPOKEN"), st.count("REVIEW"),
                     bab.proven_share(d), current))
    n = len(rows)
    print(f"{a.edition}: {n} belts, {len(missing)} chapters without a belt, "
          f"{sum(1 for r in rows if not r[8])} belts not current for the audio on disk")
    if missing:
        print("  no belt:", " ".join(missing[:40]) + (" ..." if len(missing) > 40 else ""))
    lead_cut = [r for r in rows if r[3] >= 1]
    tail_cut = [r for r in rows if r[4] >= 1]
    low = [r for r in rows if r[7] < 0.90]
    uns = [r for r in rows if r[5] > r[3] + r[4]]
    print(f"\nleading UNSPOKEN (file starts late / previous file ends late): {len(lead_cut)}")
    for r in sorted(lead_cut, key=lambda r: -r[3]):
        print(f"  {r[0]:14s} ch{r[1]:>3}  first {r[3]} of {r[2]} verses unspoken   proven {r[7]:.3f}{'' if r[8] else '  (belt stale)'}")
    print(f"\ntrailing UNSPOKEN (file ends early / next file starts early): {len(tail_cut)}")
    for r in sorted(tail_cut, key=lambda r: -r[4]):
        print(f"  {r[0]:14s} ch{r[1]:>3}  last {r[4]} of {r[2]} verses unspoken   proven {r[7]:.3f}{'' if r[8] else '  (belt stale)'}")
    print(f"\nUNSPOKEN inside the chapter (reader skipped text, or transcript miss): {len(uns)}")
    for r in sorted(uns, key=lambda r: -(r[5] - r[3] - r[4]))[:40]:
        print(f"  {r[0]:14s} ch{r[1]:>3}  {r[5] - r[3] - r[4]} inner unspoken of {r[2]}   proven {r[7]:.3f}")
    print(f"\nbelow the 0.90 silent-ship bar: {len(low)}  (below the 0.60 gate: {sum(1 for r in low if r[7] < 0.60)})")
    for r in sorted(low, key=lambda r: r[7])[:60]:
        print(f"  {r[7]:.3f}  {r[0]}_{r[1]:03d}  {r[2]}v  unspoken {r[5]}  review {r[6]}")
    tot_v = sum(r[2] for r in rows)
    print(f"\nverses {tot_v}  unspoken {sum(r[5] for r in rows)}  review {sum(r[6] for r in rows)}  "
          f"mean proven {sum(r[7] for r in rows) / max(1, n):.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
