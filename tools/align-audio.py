"""align-audio — full-catalog forced alignment for the read-along feature.

  node tools/extract-audio-fragments.mjs        # corpus fragments
  python tools/align-audio.py [--cpu] [--limit N]

Per manifest track: download from the audio-v1 release (cache) -> ffmpeg to
16k mono wav (cache; several 2022-era TTS mp3s truncate in whisper's direct
decode path) -> faster-whisper word timestamps (CUDA medium/fp16/beam5;
--cpu falls back to small/int8) with a per-track transcript cache, so the
run RESUMES from wherever it stopped. Then per letter: greedy monotonic
matching of fragment tokens onto transcript words (bigram anchors; generous
window on a part's first fragment for the spoken front-matter, tight after
— refrain-heavy letters false-anchor; sub-50% fragments dropped rather than
mispainted). Multi-part letters consume fragments across parts in order.

Output:
  app/src/main/assets/src/data/audio-sync.js
      AUDIO_SYNC[key] = [[t, bi, cs, ce, part], ...]   (Format B: cs=ce=-1,
      bi = paragraph index; painted whole-paragraph)
  tools/_align-work/report.txt   per-letter coverage + REVIEW/EXCLUDED lists

QA policy (owner: quality over speed): coverage >= 0.90 ships silently,
0.60-0.90 ships + REVIEW list, < 0.60 is EXCLUDED (no read-along for that
letter — never a wrong highlight) + listed.
"""
import json, os, re, subprocess, sys, time, urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
WORK = os.path.join(BASE, "_align-work")
AUDIO = os.path.join(WORK, "audio")
TX = os.path.join(WORK, "tx")
MANIFEST = os.path.join(ROOT, "app", "src", "main", "assets", "src", "data", "audio-manifest.js")
OUT_JS = os.path.join(ROOT, "app", "src", "main", "assets", "src", "data", "audio-sync.js")
RELEASE = "https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/"

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
norm = lambda w: re.sub(r"[^a-z0-9]", "", w.lower())


def manifest_tracks():
    """key -> [driveId, ...] in part order (skips the __sections compilations)."""
    text = open(MANIFEST, encoding="utf-8").read()
    m = re.search(r"var AUDIO_MANIFEST = \{(.*?)\n\};", text, re.S)
    body = m.group(1)
    out = {}
    for key, arr in re.findall(r'"([a-z0-9:_-]+)":(\[\[.*?\]\])', body):
        out[key] = [t[0] for t in json.loads(arr)]
    return out


def ensure_wav(fid):
    wav = os.path.join(AUDIO, fid + ".wav")
    if os.path.exists(wav) and os.path.getsize(wav) > 44:
        return wav
    mp3 = os.path.join(AUDIO, fid + ".mp3")
    if not (os.path.exists(mp3) and os.path.getsize(mp3) > 0):
        urllib.request.urlretrieve(RELEASE + fid + ".mp3", mp3)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", mp3, "-ar", "16000", "-ac", "1", wav], check=True)
    os.remove(mp3)
    return wav


_model = None
def transcribe(fid, cpu):
    cache = os.path.join(TX, fid + ".json")
    if os.path.exists(cache):
        return json.load(open(cache, encoding="utf-8"))
    global _model
    if _model is None:
        # cuBLAS/cuDNN wheels don't land on PATH by themselves on Windows.
        nv = os.path.join(sys.prefix, "Lib", "site-packages", "nvidia")
        for sub in ("cublas", "cudnn"):
            p = os.path.join(nv, sub, "bin")
            if os.path.isdir(p):
                os.add_dll_directory(p)
                os.environ["PATH"] = p + os.pathsep + os.environ["PATH"]
        from faster_whisper import WhisperModel
        if cpu:
            _model = WhisperModel("small", device="cpu", compute_type="int8")
            print("model: small/int8/cpu")
        else:
            _model = WhisperModel("medium", device="cuda", compute_type="float16")
            print("model: medium/fp16/cuda beam5")
    wav = ensure_wav(fid)
    segs, info = _model.transcribe(wav, language="en", word_timestamps=True,
                                   beam_size=1 if cpu else 5, vad_filter=False)
    words = []
    for s in segs:
        for w in (s.words or []):
            n = norm(w.word)
            if n:
                words.append([n, round(w.start, 2)])
    data = {"words": words, "dur": round(info.duration, 1)}
    json.dump(data, open(cache, "w", encoding="utf-8"))
    return data


def tok_match(a, b):
    if not a or not b:
        return False
    if a == b:
        return True
    return len(a) > 4 and (a.startswith(b) or b.startswith(a))


def align_part(words, frags, first_window):
    """Greedy monotonic alignment. Returns (aligned list parallel to frags —
    entries are startSec or None, hit_tokens, total_tokens, consumed_count).
    consumed_count = index AFTER the last matched fragment (for multi-part)."""
    wi = 0
    out, hit, tot = [], 0, 0
    last_matched_idx = -1
    for fi, f in enumerate(frags):
        toks = [t for t in (norm(x) for x in f["text"].split()) if t]
        tot += len(toks)
        if not toks:
            out.append(None)
            continue
        window = first_window if last_matched_idx < 0 else 45
        start_w = None
        if len(toks) >= 2:
            j = wi
            limit = min(len(words) - 1, wi + window)
            while j < limit:
                if tok_match(words[j][0], toks[0]) and (
                    tok_match(words[j + 1][0], toks[1])
                    or (j + 2 < len(words) and tok_match(words[j + 2][0], toks[1]))
                ):
                    start_w = j
                    break
                j += 1
        if start_w is None:
            j = wi
            limit = min(len(words), wi + window)
            while j < limit:
                if tok_match(words[j][0], toks[0]):
                    start_w = j
                    break
                j += 1
        if start_w is None:
            out.append(None)
            continue
        j = start_w
        hits = 0
        last_hit = start_w
        for tok in toks:
            k = j
            limit = min(len(words), j + 8)
            while k < limit:
                if tok_match(words[k][0], tok):
                    hits += 1
                    last_hit = k
                    j = k + 1
                    break
                k += 1
        hit_ok = hits >= max(1, len(toks) // 2)
        if not hit_ok:
            out.append(None)
            continue
        hit += hits
        out.append(words[start_w][1])
        wi = last_hit + 1
        last_matched_idx = fi
    return out, hit, tot, (last_matched_idx + 1)


def main():
    cpu = "--cpu" in sys.argv
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 0
    only = None  # --volkeys one,two,…  (owner: volume-by-volume, QA each step)
    if "--volkeys" in sys.argv:
        only = set(sys.argv[sys.argv.index("--volkeys") + 1].split(","))
    os.makedirs(AUDIO, exist_ok=True)
    os.makedirs(TX, exist_ok=True)
    frag_all = json.load(open(os.path.join(WORK, "fragments-all.json"), encoding="utf-8"))
    tracks = manifest_tracks()
    keys = [k for k in tracks if k in frag_all]
    if only:
        keys = [k for k in keys if k.split(":", 1)[0] in only]
    if limit:
        keys = keys[:limit]
    print(f"letters: {len(keys)} (manifest {len(tracks)}, fragments {len(frag_all)})")

    # Volume-by-volume order (owner directive: QA checkpoint per volume) +
    # MERGE with any already-shipped sync data so sequential nights accumulate.
    VOL_ORDER = {v: i for i, v in enumerate(
        ["one", "two", "three", "four", "five", "six", "seven",
         "rebuke", "flock", "timothy", "holydays", "wtlb1", "wtlb2", "blessed"])}
    keys.sort(key=lambda k: (VOL_ORDER.get(k.split(":", 1)[0], 99), k))
    sync = {}
    if os.path.exists(OUT_JS):
        prev = open(OUT_JS, encoding="utf-8").read()
        pm = re.search(r"var AUDIO_SYNC = (\{.*\});", prev, re.S)
        if pm:
            try:
                sync = json.loads(pm.group(1))
                print(f"merging over existing sync data: {len(sync)} letters")
            except ValueError:
                pass
    report = []
    vol_stats = {}
    t_run = time.time()
    cur_vol = None
    for n, key in enumerate(keys, 1):
        vk = key.split(":", 1)[0]
        if vk != cur_vol:
            if cur_vol and cur_vol in vol_stats:
                s = vol_stats[cur_vol]
                print(f"VOLUME CHECKPOINT {cur_vol}: {s['ok']} OK / {s['rev']} REVIEW / {s['exc']} EXCLUDED of {s['n']}")
            cur_vol = vk
            vol_stats[vk] = {"n": 0, "ok": 0, "rev": 0, "exc": 0}
        entry = frag_all[key]
        frags = entry["fragments"]
        fmt = entry["format"]
        remaining = list(range(len(frags)))
        tuples, hit_sum, tot_sum = [], 0, 0
        try:
            for part, fid in enumerate(tracks[key]):
                tx = transcribe(fid, cpu)
                sub = [frags[i] for i in remaining]
                aligned, hit, tot, consumed = align_part(tx["words"], sub, first_window=260)
                hit_sum += hit
                tot_sum += tot
                for local_i, t0 in enumerate(aligned):
                    if t0 is None:
                        continue
                    f = sub[local_i]
                    if fmt == "A":
                        tuples.append([t0, f["bi"], f["cs"], f["ce"], part])
                    else:
                        tuples.append([t0, f["pi"], -1, -1, part])
                remaining = remaining[consumed:] if consumed > 0 else remaining
                if not remaining:
                    break
        except Exception as e:
            report.append((key, -1.0, f"ERROR {str(e).splitlines()[0][:110]}"))
            continue
        cov = round(hit_sum / max(1, tot_sum), 3)
        # monotonic per part
        clean = []
        last = {}
        for tup in tuples:
            p = tup[4]
            if tup[0] >= last.get(p, -1):
                clean.append(tup)
                last[p] = tup[0]
        if cov >= 0.60 and clean:
            sync[key] = clean
        tag = "OK" if cov >= 0.90 else ("REVIEW" if cov >= 0.60 else "EXCLUDED")
        report.append((key, cov, tag))
        vs = vol_stats[vk]
        vs["n"] += 1
        vs["ok" if tag == "OK" else "rev" if tag == "REVIEW" else "exc"] += 1
        if n % 20 == 0 or n == len(keys):
            el = time.time() - t_run
            print(f"  [{n}/{len(keys)}] {el/60:.1f} min elapsed — last: {key} cov={cov} {tag}")
    if cur_vol and cur_vol in vol_stats:
        s = vol_stats[cur_vol]
        print(f"VOLUME CHECKPOINT {cur_vol}: {s['ok']} OK / {s['rev']} REVIEW / {s['exc']} EXCLUDED of {s['n']}")

    lines = [json.dumps(k) + ":" + json.dumps(sync[k]) for k in sorted(sync)]
    body = ("/* AUDIO SYNC — read-along sentence timings, generated by tools/align-audio.py.\n"
            "   DO NOT EDIT. AUDIO_SYNC[\"volKey:letterId\"] = [[startSec, blockIndex,\n"
            "   charStart, charEnd, partIndex], ...]. Format-B entries use charStart =\n"
            "   charEnd = -1 (whole-paragraph paint; blockIndex is the paragraph index).\n"
            "   Offsets live in the block's DOM textContent domain. */\n"
            "var AUDIO_SYNC = {\n" + ",\n".join(lines) + "\n};\n")
    open(OUT_JS, "w", encoding="utf-8", newline="\n").write(body)

    ok = sum(1 for _, c, t in report if t == "OK")
    rev = [(k, c) for k, c, t in report if t == "REVIEW"]
    exc = [(k, c, t) for k, c, t in report if t in ("EXCLUDED",) or c < 0]
    with open(os.path.join(WORK, "report.txt"), "w", encoding="utf-8") as f:
        f.write(f"aligned letters shipped: {len(sync)}/{len(keys)}  (OK {ok}, REVIEW {len(rev)}, EXCLUDED/ERROR {len(exc)})\n\n")
        f.write("REVIEW (shipped, eyeball these):\n")
        for k, c in sorted(rev, key=lambda x: x[1]):
            f.write(f"  {c:.3f}  {k}\n")
        f.write("\nEXCLUDED / ERROR (no read-along shipped):\n")
        for k, c, t in exc:
            f.write(f"  {c:.3f}  {k}  {t}\n")
        f.write("\nFull scores:\n")
        for k, c, t in sorted(report, key=lambda x: x[1]):
            f.write(f"  {c:.3f}  {t:8s} {k}\n")
    print(f"BATCH DONE — shipped {len(sync)}/{len(keys)} (OK {ok}, REVIEW {len(rev)}, EXCLUDED {len(exc)}) in {(time.time()-t_run)/60:.1f} min")
    return 0


if __name__ == "__main__":
    sys.exit(main())
