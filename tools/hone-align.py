"""hone-align — letter-level forced-alignment lab (dual-leg belt).

  python tools/hone-align.py --key rebuke:the-days-of-the-martyred-prophets-are-at-an-end
  python tools/hone-align.py --key two:three-aspects --asset 1JpNn-RMk0KUOh4K9J8yLsJK9WuigcLGy
  python tools/hone-align.py --key <k> --legacy          # leg B only, pre-campaign settings

A thin CLI over _alignlib. Fragments come from _align-work/fragments-all.json
(Format A sentence/poetry-line fragments, Format B paragraphs); audio comes from
the audio-v1 release. Two independent legs, then the belt:

  leg A  MMS_FA forced alignment over the fragment token stream, fragment index as
         owner. Star tokens at the edges absorb spoken front matter and outros;
         --star-between-blocks adds one at every block boundary for letters whose
         readers ad-lib between sections.
  leg B  faster-whisper word timestamps + global Needleman-Wunsch — the witness
         leg, which is what notices printed text nobody read aloud.

MULTI-PART letters (obey-god, christmas) and multi-asset alternate renditions run
both legs over the REMAINING fragment tail per part; a part consumes fragments up
to the last one leg B cleared, and the next part starts there with fresh star
edges. A fragment that clears the threshold in TWO parts is marked REVIEW —
contested, never a silent pick.

ALTERNATES: --asset aligns one specific rendition asset into its own timeline
(<key>@<assetId>.json), because an alternate reading has its own clock.

--legacy is the byte-stability harness: leg B only, lead_in 0.15, the pre-campaign
apostrophe-free token domain — it reproduces the archived pre-_alignlib output.
Writes _align-work/hone/<key>.<model>.json; shipping stays the batch script's job.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _alignlib as al                                              # noqa: E402

BASE, ROOT, WORK = al.BASE, al.ROOT, al.WORK
AUDIO = os.path.join(WORK, "audio")
HONE = os.path.join(WORK, "hone")
MANIFEST = os.path.join(ROOT, "app", "src", "main", "assets", "src", "data", "audio-manifest.js")
RELEASE = "https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/"

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_JS = {}


def js_object(name):
    """One of audio-manifest.js's top-level objects (they are plain JSON bodies)."""
    if name not in _JS:
        text = open(MANIFEST, encoding="utf-8").read()
        m = re.search(r"var " + name + r" = (\{.*?\n\});", text, re.S)
        _JS[name] = json.loads(m.group(1)) if m else {}
    return _JS[name]


GH = shutil.which("gh") or r"C:\Program Files\GitHub CLI\gh.exe"
REPO, TAG = "VOTReader/votreader-assets", "audio-v1"
_RELEASE = {}


def _list_release():
    rid = subprocess.run([GH, "api", f"repos/{REPO}/releases/tags/{TAG}", "--jq", ".id"],
                         capture_output=True, text=True, timeout=120)
    if rid.returncode != 0 or not (rid.stdout or "").strip():
        raise RuntimeError(f"cannot read release {TAG}: {(rid.stderr or '').strip()[:160]}")
    r = subprocess.run([GH, "api", "--paginate", f"repos/{REPO}/releases/{rid.stdout.strip()}/assets?per_page=100",
                        "--jq", '.[] | [.name, .size, (.digest // "")] | @tsv'],
                       capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError(f"cannot list release {TAG}: {(r.stderr or '').strip()[:160]}")
    for line in r.stdout.splitlines():
        name, size, digest = (line.split("\t") + ["", ""])[:3]
        if name.endswith(".mp3") and digest.startswith("sha256:"):
            _RELEASE[name[:-4]] = {"size": int(size), "sha256": digest[len("sha256:"):]}


def release_asset(fid):
    """{"size", "sha256"} of audio-v1's <fid>.mp3 -- GitHub's own digest of its
    bytes, read from one listing of the release per process (again only for an
    id that listing lacked). The digest is the identity every per-asset cache
    here is stamped with. An asset can be REPLACED under its own name (the align
    lane's re-upload chain deletes and re-uploads it), and these caches were
    keyed by the name alone, so a re-time after a replace read the old mp3, wav
    and transcript back and timed the new recording with the old one's clock
    (W22, sweep 2026-10-13). A byte size was not enough: a same-length re-encode
    keeps it (refuter r1)."""
    if fid not in _RELEASE:
        _list_release()
    if fid not in _RELEASE:
        raise RuntimeError(f"{fid}.mp3 is not on {TAG} with a digest: nothing vouches for its bytes")
    return _RELEASE[fid]


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_wav(fid):
    """16k mono wav for a release asset id, downloading the mp3 if we lack it.

    Whole files only (W22): the mp3 downloads to a .part and is renamed only when
    it hashes to the release's digest, and to_wav16k does the same for the wav.
    They used to write the final paths, and anything over 0 / 44 bytes was reused
    on every later run -- an interrupted download aligned that letter against
    cut-off audio for good, its tail dark. The wav (and its silence map) is
    trusted only beside <fid>.src.json naming the digest of the mp3 it was made
    from, so a replaced release asset rebuilds every cache made from the old bytes."""
    os.makedirs(AUDIO, exist_ok=True)
    want = release_asset(fid)
    mp3 = os.path.join(AUDIO, fid + ".mp3")
    wav = os.path.join(AUDIO, fid + ".wav")
    src = os.path.join(AUDIO, fid + ".src.json")
    if (al.load_json(src) or {}).get("sha256") == want["sha256"] and al.wav_complete(wav):
        return wav
    if not (os.path.exists(mp3) and os.path.getsize(mp3) == want["size"] and _sha256(mp3) == want["sha256"]):
        print(f"  downloading {fid}.mp3 ...")
        part = mp3 + ".part"
        try:
            urllib.request.urlretrieve(RELEASE + fid + ".mp3", part)   # ContentTooShortError on a short read
            got = os.path.getsize(part)
            if got != want["size"] or _sha256(part) != want["sha256"]:
                raise RuntimeError(f"{fid}.mp3: downloaded {got} B that do not hash to the release digest")
            os.replace(part, mp3)
        finally:
            if os.path.exists(part):
                os.remove(part)
    for stale in (src, wav + ".sil.json"):
        if os.path.exists(stale):
            os.remove(stale)
    al.to_wav16k(mp3, wav, rebuild=True)
    al.dump_json(src, {"sha256": want["sha256"], "size": want["size"]})
    return wav


# What whisper decodes with (WhisperLeg.transcribe_words). --beam and --no-prompt change these, and the cache was keyed on
# model + file id alone, so such a run read back the default transcript (sweep 2026-10-13, low; al5).
TX_KNOBS = ("beam_size", "temperature", "condition_on_previous_text", "initial_prompt", "vad_filter",
            "hallucination_silence_threshold")


def tx_cache(fid, s):
    """The family's own decode knobs keep the original path (every cache on disk stays valid); any other set gets
    a folder named for it."""
    d = os.path.join(WORK, "tx-hone", s["whisper_model"])
    knobs = {k: s.get(k) for k in TX_KNOBS}
    base = al.settings_for(s["family"], whisper_model=s["whisper_model"])
    if knobs != {k: base.get(k) for k in TX_KNOBS}:
        d = os.path.join(d, "knobs-" + al.sha10(json.dumps(knobs, sort_keys=True, default=str)))
    return os.path.join(d, fid + ".json")


_FRAGS_ALL = {}


def fragments_for(key):
    """Fragments for one key, with the 1.9 MB index parsed ONCE per process.

    batch-align asks for this twice per key -- once to fingerprint the belt's
    inputs, once inside run_belt -- so a 352-entry run re-read and re-parsed the
    whole file about seven hundred times. Correct, and pure waste: the file does
    not change while a batch runs, and re-extracting it is a deliberate step.
    """
    if not _FRAGS_ALL:
        _FRAGS_ALL.update(json.load(open(os.path.join(WORK, "fragments-all.json"), encoding="utf-8")))
    if key not in _FRAGS_ALL:
        raise SystemExit(f"no fragments for key {key!r}")
    e = _FRAGS_ALL[key]
    return e["fragments"], e["format"]


def fragments_hash(frags):
    """Fingerprint of THIS letter's fragment domain (offsets + text).

    Belt caches were keyed on settings_hash alone, so re-extracting fragments
    (a corpus edit, or the 2026-08-12 DOM-offset fix) left every belt looking
    'current' and a re-run silently replayed timings addressed to the OLD
    offsets. The cache key must cover every INPUT, and the fragments are one."""
    payload = json.dumps([[f.get("bi", f.get("pi")), f.get("cs"), f.get("ce"), f["text"]]
                          for f in frags], ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:10]


def resolve_tracks(key, asset=None):
    """-> ([(assetId, partLabel), ...], renditionLabel).

    Without --asset: the primary recording's parts. With --asset: the alternate
    rendition that asset belongs to, in full (a part-labelled alternate is one
    rendition split across assets, so its parts align as parts)."""
    rows = js_object("AUDIO_MANIFEST").get(key)
    if not rows:
        raise SystemExit(f"no audio manifest row for {key!r}")
    primary = [(r[0], r[2] if len(r) > 2 else None) for r in rows]
    if not asset:
        return primary, "primary/" + (rows[0][1] if len(rows[0]) > 1 else "?")
    if any(r[0] == asset for r in rows):
        return primary, "primary/" + (rows[0][1] if len(rows[0]) > 1 else "?")
    for reader, assets in js_object("AUDIO_ALTERNATES").get(key, []):
        if any(x[0] == asset for x in assets):
            return [(x[0], x[1] if len(x) > 1 else None) for x in assets], "alt/" + reader
    print(f"  ! {asset} is not a listed rendition of {key} — aligning it standalone")
    return [(asset, None)], "alt/unlisted"


# ------------------------------------------------------- legacy (gate) leg ---

def align_greedy(words, frags, nrm, first_window=260):
    """The retired batch algorithm (align-audio.py align_part), kept as the legacy
    report's shadow column: it shows what the greedy windowed matcher would have
    done on the very same transcript."""
    wi, out, last_matched = 0, [], -1
    for fi, f in enumerate(frags):
        toks = [t for t in (nrm(x) for x in f["text"].split()) if t]
        if not toks:
            out.append(None)
            continue
        window = first_window if last_matched < 0 else 45
        start_w = None
        if len(toks) >= 2:
            j, limit = wi, min(len(words) - 1, wi + window)
            while j < limit:
                if al.tok_match(words[j][0], toks[0]) and (
                    al.tok_match(words[j + 1][0], toks[1])
                    or (j + 2 < len(words) and al.tok_match(words[j + 2][0], toks[1]))
                ):
                    start_w = j
                    break
                j += 1
        if start_w is None:
            j, limit = wi, min(len(words), wi + window)
            while j < limit:
                if al.tok_match(words[j][0], toks[0]):
                    start_w = j
                    break
                j += 1
        if start_w is None:
            out.append(None)
            continue
        j, hits, last_hit = start_w, 0, start_w
        for tok in toks:
            k, limit = j, min(len(words), j + 8)
            while k < limit:
                if al.tok_match(words[k][0], tok):
                    hits += 1
                    last_hit = k
                    j = k + 1
                    break
                k += 1
        if hits < max(1, len(toks) // 2):
            out.append(None)
            continue
        out.append(words[start_w][1])
        wi = last_hit + 1
        last_matched = fi
    return out


_MMS = {}
_WL = {}


def _legs(s):
    """ONE whisper leg and ONE MMS leg per settings hash, for the whole process.

    run_belt used to build both per letter. Nothing reloads them explicitly, but
    ctranslate2's WhisperModel and torchaudio's wav2vec2 hold native memory that
    CPython does not free promptly, so a batch accumulated a fresh ~4 GB of
    models every letter: the 2026-08-26 overnight run grew from 7.8 GB to 15.3 GB
    resident over ~20 letters and then stopped completing anything at all --
    one core pinned, no belt written for 45 minutes. The letter it was stuck on
    finishes in 87 seconds in a fresh process.

    hone-bible.py has had this since it was written; batch-align is the caller
    that made it matter here.
    """
    h = al.settings_hash(s)
    return (_WL.setdefault(h, al.WhisperLeg(s)), _MMS.setdefault(h, al.MMSLeg(s)))


def run_legacy(key, s):
    """Leg B only, exactly as the pre-_alignlib lab ran it — the archived-output
    byte-stability harness. New work uses run_belt()."""
    frags, fmt = fragments_for(key)
    tracks, _rend = resolve_tracks(key)
    whisper, _mms = _legs(s)
    print(f"{key}: {len(frags)} fragments, {len(tracks)} part(s), format {fmt}  [LEGACY leg-B]")

    results, tuples = [], []
    for part, (fid, _label) in enumerate(tracks):
        wav = ensure_wav(fid)
        tx = whisper.transcribe_words(wav, tx_cache(fid, s), stamp=release_asset(fid)["sha256"])
        words = tx["words"]
        nrm = al.match_normalizer(s, words)
        cols, owner = [], []
        for fi, f in enumerate(frags):
            for t in (nrm(x) for x in f["text"].split()):
                if t:
                    cols.append(t)
                    owner.append(fi)
        col2word = al.nw_align(words, cols, s)
        greedy_ts = align_greedy(words, frags, nrm)
        for fi, f in enumerate(frags):
            idxs = [c for c in range(len(cols)) if owner[c] == fi]
            hits = [col2word[c] for c in idxs if c in col2word]
            tot = len(idxs)
            results.append({"fi": fi, "bi": f.get("bi", f.get("pi")), "text": f["text"],
                            "tokens": tot, "hit": len(hits),
                            "ratio": round(len(hits) / max(1, tot), 3),
                            "start": words[min(hits)][1] if hits else None,
                            "end": words[max(hits)][2] if hits else None,
                            "part": part, "greedy_t": greedy_ts[fi]})
        break                       # legacy honed single-part letters only

    last_t = -1.0
    for i, r in enumerate(results):
        ok = r["ratio"] >= s["min_frag_hit"] and r["start"] is not None
        t = r["start"]
        if not ok and s["interpolate_missing"]:
            prev_t = next((results[j]["start"] for j in range(i - 1, -1, -1)
                           if results[j]["start"] is not None
                           and results[j]["ratio"] >= s["min_frag_hit"]), None)
            nxt_t = next((results[j]["start"] for j in range(i + 1, len(results))
                          if results[j]["start"] is not None
                          and results[j]["ratio"] >= s["min_frag_hit"]), None)
            if prev_t is not None and nxt_t is not None:
                t, ok = round((prev_t + nxt_t) / 2, 2), True
                r["interpolated"] = True
        if ok and t is not None:
            t = max(0.0, round(t - s["lead_in"], 2))
            if t >= last_t:
                f = frags[r["fi"]]
                r["ship_t"] = t
                # LEGACY PATH ONLY (see the docstring: byte-stability harness
                # for the retired align-audio.py output). It still emits the
                # -1/-1 whole-paragraph sentinel because that is what the data
                # it reproduces contained; run_belt below is what ships, and it
                # emits real Format B offsets. Do not "fix" this to match --
                # the point of this path is that its output does not move.
                tuples.append([t, f["bi"], f["cs"], f["ce"], r["part"]] if fmt == "A"
                              else [t, f["pi"], -1, -1, r["part"]])
                last_t = t

    tok_tot = sum(r["tokens"] for r in results)
    cov = sum(r["hit"] for r in results) / max(1, tok_tot)
    out = {"key": key, "legacy": True, "model": s["whisper_model"],
           "settings_hash": al.settings_hash(s), "settings": s,
           "coverage": round(cov, 3), "fragments": len(frags),
           "shipped": len(tuples), "results": results, "tuples": tuples}
    path = os.path.join(HONE, key.replace(":", "__") + f".{s['whisper_model']}.legacy.json")
    os.makedirs(HONE, exist_ok=True)
    json.dump(out, open(path, "w", encoding="utf-8"), indent=1)
    print(f"coverage {cov:.3f}  fragments shipped {len(tuples)}/{len(frags)}  -> {path}")
    g_drop = sum(1 for r in results if r["greedy_t"] is None)
    print(f"\n(greedy/batch matcher would drop {g_drop}/{len(results)} fragments on this transcript)")
    return out


# --------------------------------------------------------------- dual leg ---

def run_belt(key, s, asset=None):
    frags, fmt = fragments_for(key)
    tracks, rend = resolve_tracks(key, asset)
    n = len(frags)
    toks = [al.spoken_words(f["text"]) for f in frags]
    whisper, mms = _legs(s)
    print(f"{key}: {len(frags)} fragments, {len(tracks)} part(s), format {fmt}, {rend}")
    print(f"family {s['family']}  settings {al.settings_hash(s)}  lead_in {s['lead_in']}")

    assigned, cleared, part_rows = {}, {}, []
    tx_truncated = []                    # parts whose transcript stopped early (W23)
    cursor = 0
    for part, (fid, label) in enumerate(tracks):
        if cursor >= n:
            break
        wav = ensure_wav(fid)
        units, prev_bi = [], None
        for fi in range(cursor, n):
            if not toks[fi]:
                continue
            u = {"owner": fi, "tokens": toks[fi], "text": frags[fi]["text"], "ident": {"fi": fi}}
            bi = frags[fi].get("bi")
            if s["star_between_blocks"] and prev_bi is not None and bi != prev_bi:
                u["star_before"] = True
            prev_bi = bi
            units.append(u)
        if not units:
            break
        print(f"part {part} [{fid}{(' · ' + label) if label else ''}]: fragments {cursor}..{n - 1}")
        print("  leg A: MMS_FA forced alignment ...")
        A = mms.align(wav, units)
        print(f"    {len(A)}/{len(units)} placed")
        print(f"  leg B: {s['whisper_model']} + global match ...")
        stamp = release_asset(fid)["sha256"]   # the caches answer for THIS release's bytes (W22)
        tx = whisper.transcribe_words(wav, tx_cache(fid, s), stamp=stamp)
        nrm = al.match_normalizer(s, tx["words"])
        cols, owners = [], []
        for u in units:
            for t in u["tokens"]:
                cols.append(nrm(t))
                owners.append(u["owner"])
        B = al.nw_rows(tx["words"], cols, owners, al.nw_align(tx["words"], cols, s))
        print(f"    {len(B)}/{len(units)} placed  (transcript {len(tx['words'])} words, {tx['dur']}s)")
        if tx.get("truncated"):
            tx_truncated.append(part)
            print(f"    leg B TRUNCATED at {tx.get('cut')}s: what lies past it is REVIEW, and the belt "
                  "is not current, so the next run hears the whole recording")

        snap = al.make_snap(al.silence_intervals(wav, stamp=stamp))
        rows = al.belt(A, B, units, s, lambda t, txt: al.probe(wav, t, txt, s, whisper),
                       snap_fn=snap, end_t=tx.get("dur"),
                       tx_cut=tx.get("cut") if tx.get("truncated") else None)
        ratio = {}
        for u in units:
            b = B.get(u["owner"])
            ratio[u["owner"]] = (b["hit"] / max(1, b["tot"])) if b else 0.0
        hit_here = [u["owner"] for u in units if ratio[u["owner"]] >= s["min_frag_hit"]]
        for fi in hit_here:
            cleared.setdefault(fi, []).append(part)
        # Consumption boundary = end of the last DENSE run (3 consecutive
        # clearing fragments), not the last stray match: clause-level fragments
        # are short enough to spuriously clear against echoed text, and one
        # stray after the true boundary drags every fragment in between into
        # the wrong part's audio (obey-god lost fi 61-74 to exactly this).
        hit_set = set(hit_here)
        dense = [fi for fi in hit_here if fi - 1 in hit_set and fi - 2 in hit_set]
        last_ok = max(dense) if dense else (max(hit_here) if hit_here else None)
        is_last = part == len(tracks) - 1
        limit = (n - 1) if is_last else (last_ok if last_ok is not None else cursor - 1)
        for row, u in zip(rows, units):
            fi = u["owner"]
            if fi > limit:
                continue
            b = B.get(fi) or {}
            row["part"] = part
            row["hit"] = b.get("hit", 0)
            row["tokens"] = b.get("tot", len(u["tokens"]))
            row["ratio"] = round(ratio[fi], 3)
            row["score"] = (A.get(fi) or {}).get("score")
            assigned[fi] = row
        part_rows.append({"part": part, "asset": fid, "label": label,
                          "from": cursor, "to": limit, "cleared": len(hit_here)})
        print(f"    consumed fragments {cursor}..{limit}  ({len(hit_here)} cleared threshold)")
        cursor = limit + 1

    # Contested fragments (cleared threshold in 2+ parts — an Addendum re-reading
    # the letter's opening lines does this). NEIGHBORHOOD VOTE before REVIEW:
    # a fragment whose two uncontested neighbours shipped in the same part it was
    # assigned to belongs there — the repeat elsewhere is the echo, not the home.
    # Neighbours disagreeing (a true boundary straddle) stays REVIEW.
    contested_set = {fi for fi, p in cleared.items() if len(p) >= 2}
    for fi in sorted(contested_set):
        if fi not in assigned:
            continue
        p = assigned[fi].get("part")
        nb = [assigned[j].get("part") for j in (fi - 1, fi + 1)
              if j in assigned and j not in contested_set]
        if len(nb) == 2 and nb[0] == nb[1] == p:
            assigned[fi]["contested"] = cleared[fi]
            assigned[fi]["contestResolved"] = "neighborhood"
        else:
            assigned[fi]["status"] = "REVIEW"
            assigned[fi]["contested"] = cleared[fi]

    results, tuples = [], []
    last_t, last_part = -1.0, None       # PER PART: every part is its own recording
    for fi, f in enumerate(frags):
        r = assigned.get(fi)
        row = {"fi": fi, "bi": f.get("bi", f.get("pi")), "text": f["text"],
               "tokens": len(toks[fi]), "hit": 0, "ratio": 0.0,
               "status": "UNREAD" if toks[fi] else "EMPTY",
               "tA": None, "tB": None, "t": None, "tEnd": None,
               "score": None, "part": None}
        if r:
            for k in ("hit", "tokens", "ratio", "status", "tA", "tB", "t", "tEnd",
                      "score", "part", "delta", "probe", "prevAnchor", "skippedPrefix",
                      "interpolated", "clamped", "contested", "contestResolved",
                      "probeMisses", "snapped_from", "pastTxCut"):
                if k in r:
                    row[k] = r[k]
        if row["t"] is not None and toks[fi]:
            if row["part"] != last_part:              # new part = new clock, no carry-over
                last_t, last_part = -1.0, row["part"]
            t = row["t"]
            if t < last_t:                            # monotonic repair inside the part
                t = last_t
                row["clamped"] = True
            row["ship_t"] = t
            last_t = t
            # Interpolated rows DO ship (owner directive 2026-08-26). The old
            # rule — paint only belt-proven onsets — meant an unproven clause
            # went dark and the wash jumped over it, which reads as the feature
            # being broken. An onset spread across the gap by _interpolate_runs
            # is a little loose but always in the right passage, and that is the
            # trade the owner asked for. UNSPOKEN rows are still never shipped:
            # those words are provably absent from the recording, so painting
            # them would wash text the voice is not reading. They carry no t at
            # all and never reach here.
            # Format B now carries REAL offsets too, in the corpus domain --
            # the app projects them onto the rendered text at paint time
            # (utils/format-b-dom-text.js). The old -1/-1 sentinel meant "paint
            # the whole paragraph", which on the longest WTLB entry was 3,785
            # characters of motionless gold.
            tuples.append([t, f["bi"], f["cs"], f["ce"], row["part"]] if fmt == "A"
                          else [t, f["pi"], f["cs"], f["ce"], row["part"]])
        results.append(row)

    # COVERAGE MEASURES THE ALIGNMENT, NOT THE PAGE. Units proven absent from
    # the recording (UNSPOKEN — internal Addendum headers, renditions that skip
    # a line) leave the denominator: counting printed-but-unspoken text against
    # the aligner sank a perfect Volume One letter to 0.894. `unspokenShare`
    # rides along so a degenerate run (bad transcript ⇒ everything "unspoken"
    # ⇒ coverage 1.0) is visible instead of flattering.
    tok_all = sum(r["tokens"] for r in results)
    tok_unspoken = sum(r["tokens"] for r in results if r["status"] == "UNSPOKEN")
    tok_tot = tok_all - tok_unspoken
    cov = sum(r["hit"] for r in results) / max(1, tok_tot)
    cov_all = sum(r["hit"] for r in results) / max(1, tok_all)
    unspoken_share = round(tok_unspoken / max(1, tok_all), 3)
    n_conf = sum(1 for r in results if r["status"] == "CONFIRMED")
    n_probed = sum(1 for r in results if str(r["status"]).startswith("PROBED"))
    n_review = sum(1 for r in results if r["status"] == "REVIEW")
    safe = key.replace(":", "__")
    name = (safe + "@" + tracks[0][0] + ".json") if asset else (safe + f".{s['whisper_model']}.json")
    out = {"key": key, "asset": (tracks[0][0] if asset else None), "rendition": rend,
           "family": s["family"], "model": s["whisper_model"],
           "settings_hash": al.settings_hash(s), "settings": s,
           "fragmentsHash": fragments_hash(frags),
           "coverage": round(cov, 3), "coverageAll": round(cov_all, 3),
           "unspokenShare": unspoken_share, "fragments": n, "shipped": len(tuples),
           "confirmed": n_conf, "probed": n_probed, "review": n_review,
           # every track resolved, in part order -- `parts` stops at the last one
           # consumed; batch-align.is_current compares this to the manifest (W21)
           "tracks": [fid for fid, _label in tracks],
           "parts": part_rows, "results": results, "tuples": tuples}
    if tx_truncated:
        out["txTruncated"] = tx_truncated    # batch-align.is_current: never current (W23)
    os.makedirs(HONE, exist_ok=True)
    path = os.path.join(HONE, name)
    json.dump(out, open(path, "w", encoding="utf-8"), indent=1)
    print(f"\nCONFIRMED {n_conf}  PROBED {n_probed}  REVIEW {n_review}  "
          f"coverage {cov:.3f}  shipped {len(tuples)}/{n}  -> {path}")
    print(f"\n{'t':>8} {'A':>8} {'B':>8}  {'hit':>7}  status      text")
    for r in results:
        f = lambda x: f"{x:8.2f}" if x is not None else "       —"          # noqa: E731
        mark = "~" if r.get("interpolated") else ("^" if r.get("clamped") else " ")
        print(f"{f(r.get('ship_t'))}{mark}{f(r.get('tA'))} {f(r.get('tB'))}  "
              f"{r['hit']:>3}/{r['tokens']:<3}  {str(r['status']):<11} {r['text'][:74]}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key")
    ap.add_argument("--model")
    ap.add_argument("--beam", type=int)
    ap.add_argument("--no-prompt", action="store_true")
    ap.add_argument("--asset", help="align one alternate-rendition asset into its own timeline")
    ap.add_argument("--family", help="override the settings family (letters-A / letters-B)")
    ap.add_argument("--lead-in", type=float, help="seconds subtracted from every start")
    ap.add_argument("--star-between-blocks", action="store_true",
                    help="MMS star token at every block boundary (per-key opt-in)")
    ap.add_argument("--legacy", action="store_true",
                    help="leg B only at pre-campaign settings (archived-output gate)")
    ap.add_argument("--settings-sheet", action="store_true",
                    help="write _align-work/SETTINGS-SHEET.md and exit")
    a = ap.parse_args()
    if a.settings_sheet:
        print("wrote " + al.emit_settings_sheet())
        return 0
    if not a.key:
        ap.error("--key is required")

    _frags, fmt = fragments_for(a.key)
    family = a.family or ("letters-B" if fmt == "B" else "letters-A")
    s = al.settings_for(family, whisper_model=a.model, beam_size=a.beam, lead_in=a.lead_in)
    if a.no_prompt:
        s["initial_prompt"] = None
    if a.star_between_blocks:
        s["star_between_blocks"] = True
    if a.legacy:
        # the pre-_alignlib letters lab: leg B alone, 0.15 s lead baked into the
        # data, and the apostrophe-free token domain its transcript caches carry.
        s["lead_in"] = 0.15 if a.lead_in is None else a.lead_in
        s["norm_apostrophes"] = False
        run_legacy(a.key, s)
    else:
        run_belt(a.key, s, a.asset)
    return 0


if __name__ == "__main__":
    sys.exit(main())
