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
_MMS = {}
_WL = {}


def _mms(s):
    """One MMS leg per settings hash. Chapters are short, so re-instantiating
    (and re-loading wav2vec2) per chapter would cost more than the alignment."""
    return _MMS.setdefault(al.settings_hash(s), al.MMSLeg(s))


def _whisper(s):
    return _WL.setdefault(al.settings_hash(s), al.WhisperLeg(s))
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

    out = run_chapter(a.verses, a.audio, a.out_tag, s)
    rows = out["verses"]
    print(f"\n{'v':>3} {'t':>8} {'A':>8} {'B':>8}  {'Δ':>5}  status")
    for r in rows:
        f = lambda x: f"{x:8.2f}" if x is not None else "       —"          # noqa: E731
        d = (f"{abs(r['tA'] - r['tB']):5.2f}"
             if (r.get("tA") is not None and r.get("tB") is not None) else "    —")
        flag = " ~interp" if r.get("interpolated") else (" ^clamp" if r.get("clamped") else "")
        print(f"{r['n']:>3} {f(r.get('t'))} {f(r.get('tA'))} {f(r.get('tB'))}  {d}  {r['status']}{flag}")
    return 0


def run_chapter(verses_path, audio, out_tag, s, out_dir=None, quiet=False):
    """Align ONE chapter and write its belt. Extracted from main() so the batch
    runner can drive thousands of chapters without shelling out per chapter —
    the whisper and MMS models then load once for the whole run instead of once
    per chapter, which is most of the wall clock on short Bible audio."""
    say = (lambda *_a, **_k: None) if quiet else print
    out_dir = out_dir or BIBLE
    os.makedirs(out_dir, exist_ok=True)
    vdata = json.load(open(verses_path, encoding="utf-8"))
    verses = vdata["verses"]
    stem = os.path.splitext(os.path.basename(audio))[0]
    # Every per-chapter cache is keyed by the mp3's byte size (the same value
    # the belt's resume key carries), so a re-cut chapter cannot inherit the
    # previous file's transcript, silence map or scratch wav. The wav is
    # normally deleted below; one left behind by a crash is rebuilt, not reused.
    stamp = os.path.getsize(audio)
    wav_path = os.path.join(out_dir, stem + ".16k.wav")
    if os.path.exists(wav_path):
        os.remove(wav_path)
    wav = al.to_wav16k(audio, wav_path)
    say(f"{out_tag}: {len(verses)} verses, audio {audio}")
    say(f"family {s['family']}  settings {al.settings_hash(s)}  lead_in {s['lead_in']}")

    units = [{"owner": vi, "tokens": al.spoken_words(v["text"]),
              "text": v["text"], "ident": {"n": v["n"]}}
             for vi, v in enumerate(verses)]

    say("leg A: MMS_FA forced alignment ...")
    A = _mms(s).align(wav, units)
    say(f"  {len(A)}/{len(verses)} verses placed")

    say(f"leg B: {s['whisper_model']} + global match ...")
    wl = _whisper(s)
    tx = wl.transcribe_words(wav, os.path.join(out_dir, out_tag + ".tx.json"), stamp=stamp)
    nrm = al.match_normalizer(s, tx["words"])
    cols, owners = [], []
    for u in units:
        for t in u["tokens"]:
            cols.append(nrm(t))
            owners.append(u["owner"])
    B = al.nw_rows(tx["words"], cols, owners, al.nw_align(tx["words"], cols, s))
    say(f"  {len(B)}/{len(verses)} verses placed  (transcript {len(tx['words'])} words, {tx['dur']}s)")

    snap = al.make_snap(al.silence_intervals(wav, stamp=stamp))
    rows = al.belt(A, B, units, s, lambda t, txt: al.probe(wav, t, txt, s, wl),
                   snap_fn=snap, end_t=tx.get("dur"))
    n_conf = sum(1 for r in rows if r["status"] == "CONFIRMED")
    n_probed = sum(1 for r in rows if r["status"].startswith("PROBED"))
    n_review = sum(1 for r in rows if r["status"] == "REVIEW")

    # versesHash + audioSize join settings_hash in the resume key. Settings
    # alone was the 2026-08-12 lesson: the fragment domain changed without the
    # settings moving, every belt still looked "current", and a resumed run
    # silently replayed timings addressed to the old text. A cache key must
    # cover every INPUT, and the reference text and the recording are two.
    out = {"tag": out_tag, "book": vdata.get("book"), "chapter": vdata.get("chapter"),
           "bookId": vdata.get("bookId"), "verseCount": len(verses),
           "family": s["family"], "settings_hash": al.settings_hash(s),
           "versesHash": al.sha10(json.dumps([[v["n"], v["text"]] for v in verses],
                                             ensure_ascii=False, separators=(",", ":"))),
           "settings": s, "audio": audio, "audioSize": os.path.getsize(audio),
           "confirmed": n_conf, "probed": n_probed, "review": n_review,
           "verses": rows}
    path = os.path.join(out_dir, out_tag + ".json")
    json.dump(out, open(path, "w", encoding="utf-8"), indent=1)
    say(f"\nCONFIRMED {n_conf}  PROBED {n_probed}  REVIEW {n_review}  -> {path}")
    # The 16 kHz scratch wav is ~32 kB per second of audio and nothing
    # downstream reads it. Left behind, a full three-edition Bible campaign
    # (277 hours) would strand roughly 32 GB.
    try:
        os.remove(wav)
    except OSError:
        pass
    return out


if __name__ == "__main__":
    sys.exit(main())
