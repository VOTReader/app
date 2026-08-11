"""hone-bible — verse-level forced alignment for Bible audio (dramatized-safe).

  python tools/hone-bible.py --verses <verses.json> --audio <chapter.mp3> --out-tag wop_genesis_1
  python tools/hone-bible.py ... --family bible-brm-kjv          # KJV prompt + edition policy
  python tools/hone-bible.py ... --lead-in 0.15                  # pre-campaign archives

A thin CLI over _alignlib: two INDEPENDENT aligners, then a belt.
  A) MMS_FA (wav2vec2 CTC) forces the known verse text onto the audio; star tokens
     before verse 1 and after the last verse absorb announcements, music and outros.
  B) faster-whisper large-v3 word timestamps + global Needleman-Wunsch matching.
Per verse: agreement inside agree_sec confirms; otherwise an independent probe
transcribes at each candidate start and says which one actually begins with the
verse. Nothing ships unproven — a verse neither leg can prove lands on REVIEW with
an interpolated fallback, flagged.

Output: tools/_align-work/bible/<out-tag>.json
  { verses: [{n, t, tEnd, status: CONFIRMED|PROBED_A|PROBED_B|REVIEW,
              tA, tB, delta, probe}], settings, settings_hash }

verses.json shape: { "book": "...", "chapter": 1,
                     "verses": [{"n": 1, "text": "In the beginning..."}] }
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _alignlib as al                                              # noqa: E402

BIBLE = os.path.join(al.WORK, "bible")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verses", required=True)
    ap.add_argument("--audio", required=True)
    ap.add_argument("--out-tag", required=True)
    ap.add_argument("--family", default="bible-wop-nkjv",
                    help="settings family (default bible-wop-nkjv)")
    ap.add_argument("--star-gap", action="store_true", help="star token between verses too")
    ap.add_argument("--lead-in", type=float,
                    help="seconds subtracted from every start (default 0.0 — true onsets)")
    ap.add_argument("--model", help="override the whisper model")
    a = ap.parse_args()

    s = al.settings_for(a.family, whisper_model=a.model, lead_in=a.lead_in)
    if a.star_gap:
        s["mms_star_gap"] = True
    os.makedirs(BIBLE, exist_ok=True)

    vdata = json.load(open(a.verses, encoding="utf-8"))
    verses = vdata["verses"]
    stem = os.path.splitext(os.path.basename(a.audio))[0]
    wav = al.to_wav16k(a.audio, os.path.join(BIBLE, stem + ".16k.wav"))
    print(f"{a.out_tag}: {len(verses)} verses, audio {a.audio}")
    print(f"family {s['family']}  settings {al.settings_hash(s)}  lead_in {s['lead_in']}")

    units = [{"owner": vi, "tokens": al.spoken_words(v["text"]),
              "text": v["text"], "ident": {"n": v["n"]}}
             for vi, v in enumerate(verses)]

    print("leg A: MMS_FA forced alignment ...")
    A = al.MMSLeg(s).align(wav, units)
    print(f"  {len(A)}/{len(verses)} verses placed")

    print(f"leg B: {s['whisper_model']} + global match ...")
    wl = al.WhisperLeg(s)
    tx = wl.transcribe_words(wav, os.path.join(BIBLE, a.out_tag + ".tx.json"))
    nrm = al.match_normalizer(s, tx["words"])
    cols, owners = [], []
    for u in units:
        for t in u["tokens"]:
            cols.append(nrm(t))
            owners.append(u["owner"])
    B = al.nw_rows(tx["words"], cols, owners, al.nw_align(tx["words"], cols, s))
    print(f"  {len(B)}/{len(verses)} verses placed  (transcript {len(tx['words'])} words, {tx['dur']}s)")

    snap = al.make_snap(al.silence_intervals(wav))
    rows = al.belt(A, B, units, s, lambda t, txt: al.probe(wav, t, txt, s, wl), snap_fn=snap)
    n_conf = sum(1 for r in rows if r["status"] == "CONFIRMED")
    n_probed = sum(1 for r in rows if r["status"].startswith("PROBED"))
    n_review = sum(1 for r in rows if r["status"] == "REVIEW")

    out = {"tag": a.out_tag, "book": vdata.get("book"), "chapter": vdata.get("chapter"),
           "family": s["family"], "settings_hash": al.settings_hash(s),
           "settings": s, "audio": a.audio,
           "confirmed": n_conf, "probed": n_probed, "review": n_review,
           "verses": rows}
    path = os.path.join(BIBLE, a.out_tag + ".json")
    json.dump(out, open(path, "w", encoding="utf-8"), indent=1)
    print(f"\nCONFIRMED {n_conf}  PROBED {n_probed}  REVIEW {n_review}  -> {path}")
    print(f"\n{'v':>3} {'t':>8} {'A':>8} {'B':>8}  {'Δ':>5}  status")
    for r in rows:
        f = lambda x: f"{x:8.2f}" if x is not None else "       —"          # noqa: E731
        d = (f"{abs(r['tA'] - r['tB']):5.2f}"
             if (r.get("tA") is not None and r.get("tB") is not None) else "    —")
        flag = " ~interp" if r.get("interpolated") else (" ^clamp" if r.get("clamped") else "")
        print(f"{r['n']:>3} {f(r.get('t'))} {f(r.get('tA'))} {f(r.get('tB'))}  {d}  {r['status']}{flag}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
