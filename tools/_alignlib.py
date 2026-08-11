"""_alignlib — shared core of the VOTReader read-along forced-alignment pipeline.

Importable (underscore name keeps it out of the CLI namespace):

    import _alignlib as al

WHAT LIVES HERE
  normalizers   norm_token / ascii_fold / spoken_words / is_digit_token
  matcher       tok_match + nw_align (global Needleman-Wunsch, bytearray backpointers)
  leg B         WhisperLeg  — faster-whisper large-v3 word timestamps (+ JSON cache)
  leg A         MMSLeg      — torchaudio MMS_FA (wav2vec2 CTC) forced alignment over
                              UNITS (a verse, a sentence, a paragraph) with star tokens
  adjudication  probe() + belt()  — CONFIRMED / PROBED_A / PROBED_B / REVIEW
  registry      SETTINGS_BASE + FAMILIES + settings_for/settings_hash/emit_settings_sheet

TWO DOMAINS, ON PURPOSE
  whisper domain (norm_token): lowercase, curly quotes folded, everything but
    [a-z0-9'] stripped. Apostrophes are KEPT — "lord's" and "lords" are different
    words to the matcher and the transcript spells the apostrophe out.
  MMS domain (spoken_words): the CTC dictionary is a-z + apostrophe only. Hyphens,
    dashes and slashes SPLIT first ("YAHUSHUA-YAHUWAH" is two spoken words, not one
    30-character token the aligner would smear across a breath). Digit-bearing
    tokens survive tokenisation (is_digit_token flags them) but the CTC stream
    renders them as a bare star: the dictionary has no digits, and dropping the word
    outright would slide every following wordTs index off its token.

DETERMINISM CONTRACT
  Transcripts are cached by asset id; MMS forced alignment is a deterministic
  argmax path. settings_hash() stamps outputs so a settings change is visible and
  (in the batch shipper) invalidates belts without invalidating transcripts.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import unicodedata

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
WORK = os.path.join(BASE, "_align-work")

# ------------------------------------------------------------- normalizers --

_CURLY = {"’": "'", "‘": "'", "‛": "'", "ʼ": "'", "´": "'"}
# hyphen-minus, the U+2010..U+2015 dash block, slashes and the soft hyphen: all
# WORD BOUNDARIES for the spoken domain.
_WORD_SPLIT = re.compile(r"[-‐‑‒–—―/\\­]+")


def norm_token(w):
    """Whisper-domain token: lowercase, curly quotes folded, [^a-z0-9'] stripped."""
    w = str(w).lower()
    for a, b in _CURLY.items():
        w = w.replace(a, b)
    return re.sub(r"[^a-z0-9']", "", w)


def _norm_token_legacy(w):
    """Pre-_alignlib letters normalizer — apostrophes stripped as well.

    Kept for one reason: the archived transcript caches under _align-work/tx-hone/
    were written with it, so the byte-stability gate (hone-align.py --legacy) has to
    normalise fragment tokens the same way it normalised those transcripts."""
    return re.sub(r"[^a-z0-9]", "", str(w).lower())


def normalizer(s):
    """The token normalizer this settings dict asks for."""
    return norm_token if s.get("norm_apostrophes", True) else _norm_token_legacy


def match_normalizer(s, words):
    """The normalizer that puts reference tokens in the SAME domain as `words`.

    Both sides of the matcher have to agree on apostrophes or "lord's" never meets
    "lords". A transcript that contains no apostrophe anywhere was produced in the
    apostrophe-free domain (that is how the archived caches were written), so
    reference tokens are folded the same way."""
    if s.get("norm_apostrophes", True) and any("'" in w[0] for w in words):
        return norm_token
    return _norm_token_legacy


def ascii_fold(s):
    """Curly quotes -> straight, dashes/ellipsis -> space, then NFKD to bare ASCII."""
    s = str(s)
    for a, b in _CURLY.items():
        s = s.replace(a, b)
    s = s.replace("“", '"').replace("”", '"')
    s = s.replace("—", " ").replace("–", " ").replace("…", " ")
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def spoken_words(text):
    """MMS-domain spoken tokens: a-z + apostrophe (digit tokens kept, see module doc)."""
    out = []
    for w in ascii_fold(_WORD_SPLIT.sub(" ", str(text))).split():
        t = re.sub(r"[^A-Za-z0-9']", "", w).lower().strip("'")
        if t:
            out.append(t)
    return out


def is_digit_token(tok):
    """True for a spoken token carrying a digit — no CTC dictionary entry exists."""
    return bool(re.search(r"[0-9]", tok or ""))


# ----------------------------------------------------------------- matcher --

def tok_match(a, b):
    """'exact' | 'prefix' | None. Prefix = stem match, guarded against short words."""
    if a == b:
        return "exact"
    if len(a) > 4 and len(b) > 2 and (a.startswith(b) or b.startswith(a)):
        return "prefix"
    return None


def nw_align(words, cols, s):
    """Global Needleman-Wunsch: transcript words (rows) x reference tokens (cols).

    words: [[token, start, end], ...] (WhisperLeg output)
    cols:  [token, ...]              (reference text, same normalizer as `words`)
    Returns {col_index: word_index} for the matched columns of the optimal path.
    Monotone by construction — a short unit anchors off the GLOBAL path, not off
    its own two-word luck."""
    n, m = len(words), len(cols)
    NEG = float("-inf")
    prev = [0.0] + [s["gap_fragment"] * (j + 1) for j in range(m)]
    # backpointers packed as bytes: 0=diag(match) 1=up(skip word) 2=left(skip token)
    bp = [bytearray(m + 1) for _ in range(n + 1)]
    for j in range(1, m + 1):
        bp[0][j] = 2
    for i in range(1, n + 1):
        cur = [prev[0] + s["gap_transcript"]]
        wi = words[i - 1][0]
        row = bp[i]
        row[0] = 1
        for j in range(1, m + 1):
            kind = tok_match(wi, cols[j - 1])
            diag = prev[j - 1] + (s["match_exact"] if kind == "exact"
                                  else s["match_prefix"] if kind == "prefix" else NEG)
            up = prev[j] + s["gap_transcript"]
            left = cur[j - 1] + s["gap_fragment"]
            best = max(diag, up, left)
            cur.append(best)
            row[j] = 0 if best == diag else (1 if best == up else 2)
        prev = cur
    col2word = {}
    i, j = n, m
    while i > 0 or j > 0:
        d = bp[i][j]
        if d == 0 and i > 0 and j > 0:
            col2word[j - 1] = i - 1
            i -= 1
            j -= 1
        elif d == 1 and i > 0:
            i -= 1
        else:
            j -= 1
    return col2word


def nw_rows(words, cols, owners, col2word):
    """Fold an nw_align path into per-owner leg-B rows.

    firstSpoken is the unit-local index of the first token the transcript actually
    contains: leading tokens no reader speaks (a printed speech tag, "Then God
    said,") sit before it and must not drag the unit's start backwards."""
    by_owner = {}
    for c, o in enumerate(owners):
        by_owner.setdefault(o, []).append(c)
    out = {}
    for o, idxs in by_owner.items():
        matched = [c for c in idxs if c in col2word]
        if not matched:
            continue
        first_c = min(matched)
        out[o] = {"t": words[col2word[first_c]][1],
                  "tEnd": words[col2word[max(matched)]][2],
                  "hit": len(matched), "tot": len(idxs),
                  "firstSpoken": idxs.index(first_c)}
    return out


# ------------------------------------------------------------------ audio ---

def to_wav16k(src, dest):
    """ffmpeg -> 16 kHz mono s16le wav (the one shape both legs read)."""
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 44:
        return dest
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                    "-ar", "16000", "-ac", "1", dest], check=True)
    return dest


def load_wav_16k(path):
    """Stdlib PCM wav reader. torchaudio 2.11's load() needs torchcodec; every wav
    here is ffmpeg-made 16k mono s16le, so read it directly."""
    import wave
    import numpy as np
    import torch
    with wave.open(path, "rb") as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2, \
            f"expected 16k mono s16le, got {w.getframerate()}/{w.getnchannels()}ch/{w.getsampwidth() * 8}bit"
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    return torch.from_numpy(pcm.astype("float32") / 32768.0).unsqueeze(0), 16000


def cuda_dll_dirs():
    """Windows: cuBLAS/cuDNN ship inside the wheels, not on PATH. ctranslate2 loads
    them with LoadLibrary, so the directories have to be registered first."""
    nv = os.path.join(sys.prefix, "Lib", "site-packages", "nvidia")
    for sub in ("cublas", "cudnn"):
        p = os.path.join(nv, sub, "bin")
        if os.path.isdir(p):
            try:
                os.add_dll_directory(p)
            except (AttributeError, OSError):
                pass
            os.environ["PATH"] = p + os.pathsep + os.environ["PATH"]


# ------------------------------------------------------------------ leg B ---

class WhisperLeg:
    """faster-whisper word timestamps — the WITNESS leg.

    Hears what was actually said (so unspoken printed text and ad-libbed
    front-matter are detectable), drifts under music, and is cached per asset."""

    def __init__(self, settings):
        self.s = settings
        self._model = None

    def model(self):
        if self._model is None:
            cuda_dll_dirs()
            from faster_whisper import WhisperModel
            self._model = WhisperModel(self.s["whisper_model"], device="cuda",
                                       compute_type=self.s["compute_type"])
        return self._model

    def transcribe_words(self, wav_path, cache_path=None):
        """-> {'words': [[token, start, end], ...], 'dur': float}. Cached verbatim."""
        if cache_path and os.path.exists(cache_path):
            return json.load(open(cache_path, encoding="utf-8"))
        s = self.s
        segs, info = self.model().transcribe(
            wav_path, language="en", word_timestamps=True,
            beam_size=s["beam_size"], temperature=s["temperature"],
            condition_on_previous_text=s["condition_on_previous_text"],
            initial_prompt=s["initial_prompt"], vad_filter=s["vad_filter"],
            hallucination_silence_threshold=s["hallucination_silence_threshold"])
        nrm = normalizer(s)
        words = []
        for seg in segs:
            for w in (seg.words or []):
                n = nrm(w.word)
                if n:
                    words.append([n, round(w.start, 2), round(w.end, 2)])
        data = {"words": words, "dur": round(info.duration, 1)}
        if cache_path:
            os.makedirs(os.path.dirname(cache_path), exist_ok=True)
            json.dump(data, open(cache_path, "w", encoding="utf-8"))
        return data

    def transcribe_probe(self, clip_path):
        """Bare transcription of a probe clip — no prompt, no VAD, no word stamps."""
        segs, _ = self.model().transcribe(clip_path, language="en",
                                          beam_size=self.s["probe_beam"],
                                          temperature=0.0,
                                          condition_on_previous_text=False)
        return segs


# ------------------------------------------------------------------ leg A ---

class MMSLeg:
    """torchaudio MMS_FA forced alignment — the PRECISION anchor.

    The known text is forced onto the audio at 20 ms frames, so it stays stable
    under music beds and dramatised delivery where whisper drifts. It cannot tell
    you a line was never spoken (it will place it anyway) — that is leg B's job.

    align(wav_path, units) where units = [{'tokens': [...], 'owner': int}, ...]
    Optional per-unit key `star_before: True` inserts a star ahead of that unit
    (the letters lab uses it for block boundaries).
    Returns {owner: {'t', 'tEnd', 'score', 'wordTs': [start, ...]}} — wordTs is
    index-aligned with that unit's token list, digit tokens included."""

    def __init__(self, settings):
        self.s = settings
        self._bundle = None
        self._model = None
        self._dict = None
        self._device = None

    def _load(self):
        if self._model is None:
            import torch
            from torchaudio.pipelines import MMS_FA as bundle
            self._device = "cuda" if torch.cuda.is_available() else "cpu"
            self._bundle = bundle
            # The star token is ALWAYS compiled in: star_edges/star_gap decide whether
            # stars are inserted, and long-audio windowing needs one regardless.
            self._model = bundle.get_model(with_star=True).to(self._device)
            self._dict = bundle.get_dict(star="*")
        return self._model

    # -- emission -----------------------------------------------------------
    def _emission(self, wav_path):
        """(1, T, C) log-probs on CPU. Long audio is forwarded in overlapping
        chunks (a 34-minute letter will not fit one wav2vec2 forward pass); the
        overlap halves are trimmed so the frame grid stays global."""
        import torch
        self._load()
        s = self.s
        waveform, sr = load_wav_16k(wav_path)
        n = waveform.shape[1]
        chunk = int(s["mms_chunk_sec"] * sr)
        ov = int(s["mms_chunk_overlap_sec"] * sr) // 320 * 320
        with torch.inference_mode():
            if n <= chunk:
                em, _ = self._model(waveform.to(self._device))
                em = em.cpu()
                if em.dim() == 2:
                    em = em.unsqueeze(0)
                return em, n, sr
            hop = max(320, chunk - ov)
            ov_frames = ov // 320
            pieces = []
            start = 0
            while start < n:
                seg = waveform[:, start:start + chunk]
                if seg.shape[1] < 400:
                    break
                e, _ = self._model(seg.to(self._device))
                e = e.cpu()
                if e.dim() == 2:
                    e = e.unsqueeze(0)
                lo = 0 if start == 0 else ov_frames // 2
                hi = e.shape[1] if start + chunk >= n else e.shape[1] - (ov_frames - ov_frames // 2)
                pieces.append(e[:, lo:hi, :])
                if start + chunk >= n:
                    break
                start += hop
            return torch.cat(pieces, dim=1), n, sr

    # -- forced alignment ---------------------------------------------------
    def _tokenize(self, words):
        """word list -> (ctc token ids, per-word (tokStart, tokEnd) spans).
        A word with no dictionary characters (digits, symbols) becomes one star:
        it keeps its slot so wordTs stays index-aligned with the unit's tokens."""
        d = self._dict
        star = d.get("*", 0)
        tokens, spans = [], []
        for w in words:
            ts = [star] if w == "*" else [d[c] for c in w if c in d]
            if not ts:
                ts = [star]
            spans.append((len(tokens), len(tokens) + len(ts)))
            tokens.extend(ts)
        return tokens, spans

    def _forced(self, emission, tokens):
        import torch
        import torchaudio
        targets = torch.tensor([tokens], dtype=torch.int32)
        alignment, scores = torchaudio.functional.forced_align(emission, targets, blank=0)
        spans = torchaudio.functional.merge_tokens(alignment[0], scores[0])
        return [(int(sp.start), int(sp.end), float(sp.score)) for sp in spans]

    def align(self, wav_path, units):
        s = self.s
        emission, n_samples, sr = self._emission(wav_path)
        n_frames = emission.shape[1]
        frame_dur = (n_samples / sr) / max(1, n_frames)

        words, owner = [], []
        if s["mms_star_edges"]:
            words.append("*")
            owner.append(None)
        for ui, u in enumerate(units):
            if u.get("star_before") and ui:
                words.append("*")
                owner.append(None)
            for w in (u.get("tokens") or []):
                words.append(w)
                owner.append(u["owner"])
            if s["mms_star_gap"] and ui < len(units) - 1:
                words.append("*")
                owner.append(None)
        if s["mms_star_edges"]:
            words.append("*")
            owner.append(None)

        tokens, spans = self._tokenize(words)
        budget = s["mms_trellis_budget"]
        if len(tokens) and n_frames * (2 * len(tokens) + 1) <= budget:
            token_spans = self._forced(emission, tokens)
            word_spans = [token_spans[a:b] for (a, b) in spans]
        else:
            word_spans = self._align_windowed(emission, words, owner, n_frames)
        return self._fold(word_spans, owner, frame_dur)

    def _align_windowed(self, emission, words, owner, n_frames):
        """Sequential windows for audio/text too big for one trellis.

        Each window aligns a bounded slice of the word stream against the audio
        that starts where the previous window's last word ended, with a trailing
        star to swallow whatever of the window the slice does not cover. The
        window is widened and retried if the last word lands against its edge."""
        s = self.s
        total_chars = max(1, sum(len(w) for w in words))
        rate = n_frames / total_chars                     # frames per character
        groups, cur, cur_chars = [], [], 0
        for wi, w in enumerate(words):
            cur.append(wi)
            cur_chars += len(w)
            if cur_chars >= s["mms_window_chars"]:
                groups.append(cur)
                cur, cur_chars = [], 0
        if cur:
            groups.append(cur)

        out = [[] for _ in words]
        cursor = 0
        for g in groups:
            gw = [words[wi] for wi in g]
            chars = sum(len(w) for w in gw)
            want = int(chars * rate * s["mms_window_slack"]) + 200
            real = []
            for _attempt in range(4):
                end = min(n_frames, cursor + max(want, 400))
                if end - cursor < 2:
                    break
                # `words` already carries the stars the settings asked for; every
                # window gets ONE more at the tail to swallow the audio its slice
                # of text does not cover.
                tokens, spans = self._tokenize(gw + ["*"])
                token_spans = self._forced(emission[:, cursor:end, :], tokens)
                real = [token_spans[a:b] for (a, b) in spans[:len(gw)]]
                last_end = max((sp[1] for seg in real for sp in seg), default=0)
                if end >= n_frames or last_end < (end - cursor) - 3:
                    break
                want = int(want * 1.7)                    # window clipped the tail — widen
            for k, wi in enumerate(g):
                out[wi] = [(a + cursor, b + cursor, sc) for (a, b, sc) in (real[k] if k < len(real) else [])]
            spoken = [sp for seg in real for sp in seg]
            if spoken:
                cursor = min(n_frames, cursor + spoken[-1][1])
        return out

    @staticmethod
    def _fold(word_spans, owner, frame_dur):
        acc = {}
        for wi, seg in enumerate(word_spans):
            vi = owner[wi]
            if vi is None or not seg:
                continue
            t0 = seg[0][0] * frame_dur
            t1 = seg[-1][1] * frame_dur
            sc = sum(sp[2] for sp in seg) / len(seg)
            if vi not in acc:
                acc[vi] = [t0, t1, [sc], []]
            else:
                acc[vi][1] = t1
                acc[vi][2].append(sc)
            acc[vi][3].append(round(t0, 2))
        return {vi: {"t": round(v[0], 2), "tEnd": round(v[1], 2),
                     "score": round(sum(v[2]) / len(v[2]), 3), "wordTs": v[3]}
                for vi, v in acc.items()}


# ------------------------------------------------------------------- belt ---

def probe(wav_path, t, expect_text, s, whisper_leg):
    """Transcribe probe_len seconds at t; True if it OPENS with expect_text's words.

    The window is deliberately long: a dramatised reading pauses mid-verse
    ("Then God said," [beat, actor change] "Let there be...") and a short window
    hears only the first half and fails a perfectly good stamp."""
    clip = os.path.join(WORK, "_probe-%d.wav" % os.getpid())
    os.makedirs(WORK, exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(max(0, t - 0.2)),
                    "-t", str(s["probe_len"]), "-i", wav_path,
                    "-ar", "16000", "-ac", "1", clip], check=True)
    nrm = normalizer(s)
    segs = whisper_leg.transcribe_probe(clip)
    heard = [nrm(w) for seg in segs for w in seg.text.split() if nrm(w)]
    # Deut-15 lesson (BRM prior art): scripture is formulaic — an anchor made
    # only of function words matches almost anywhere and false-confirms bad
    # stamps. Extend past probe_tokens until the anchor holds >= 2 CONTENT
    # tokens (len >= 4), and require the content tokens to actually match.
    all_want = [nrm(w) for w in spoken_words(expect_text)]
    take = s["probe_tokens"]
    while take < min(len(all_want), s["probe_tokens"] + 6) and \
            sum(1 for w in all_want[:take] if len(w) >= 4) < 2:
        take += 1
    want = all_want[:take]
    if not want:
        return False, heard[:8]
    hi = matched = content_matched = 0
    for w in want:                       # in-order fuzzy prefix match
        while hi < len(heard) and not tok_match(heard[hi], w):
            hi += 1
        if hi < len(heard):
            matched += 1
            if len(w) >= 4:
                content_matched += 1
            hi += 1
    content_have = sum(1 for w in want if len(w) >= 4)
    content_ok = content_matched >= min(2, content_have) if content_have else True
    return (matched >= max(2, len(want) - 2)) and content_ok, heard[:12]


def belt(A, B, units, s, probe_fn, snap_fn=None):
    """Adjudicate leg A against leg B, unit by unit.

    A: MMSLeg.align output, B: nw_rows output, both keyed by unit['owner'].
    probe_fn(t, expect_text) -> (ok, heard).
    snap_fn(t) -> t', optional: silence-snap — a start landing inside a detected
    silence interval moves to that interval's end (see silence_intervals /
    make_snap). Counters the CTC first-token smear: forced alignment stretches a
    unit's first word back into a preceding pause, an early bias the 2026-08-10
    verify pass measured at ~0.3 s on pause-heavy poetry and ~0.4 s under WOP
    music beds (where gaps are music, not silence — hence onset_bias_s below).

    CONFIRMED  legs agree within agree_sec. The LATER stamp wins: both legs err
               early (CTC smear; whisper stamps early under music), so within the
               window the later estimate sits closer to the true onset — the
               verify pass's signed probe deltas proved min() early-biased.
    PROBED_A/B legs disagree; an independent transcription at that start heard
               the unit's opening words. A is asked first — it is the precision leg.
    REVIEW     neither candidate survived its probe. The row still carries a t,
               interpolated between its neighbours and flagged `interpolated`, so a
               gap is visible in QA instead of silently painting a guess.
    Ordering: snap_fn, then settings onset_bias_s (per-family empirical shift for
    music-bed editions), then monotonic clamp, then lead_in (defaults 0.0 — data
    ships true onsets; the perceptual lead lives in the app/sample constant)."""
    rows = []
    for u in units:
        o = u["owner"]
        la, lb = A.get(o), B.get(o)
        # Trust the spoken-prefix trim only when leg B's placement is sane — a
        # junk B match (e.g. attracted into a chapter announcement) produces a
        # junk firstSpoken, which then corrupts the probe's expected text and
        # can false-confirm a bad stamp (BRM Psalm 3 v2, 2026-08-10).
        b_ratio = (lb["hit"] / max(1, lb["tot"])) if lb and "hit" in lb else 0.0
        k = (lb or {}).get("firstSpoken", 0) if b_ratio >= 0.5 else 0
        wts = (la or {}).get("wordTs") or []
        tA = wts[k] if (la and k < len(wts)) else (la or {}).get("t")
        tB = (lb or {}).get("t")
        toks = u.get("tokens") or []
        row = dict(u.get("ident") or {})
        row["tA"] = tA
        row["tB"] = tB
        if k:
            row["skippedPrefix"] = " ".join(toks[:k])
        expect = " ".join(toks[k:]) or str(u.get("text") or "")
        if tA is not None and tB is not None and abs(tA - tB) <= s["agree_sec"]:
            # min(): wide-window ground truth (2026-08-10) showed max() adopts
            # whisper's LATE stamps on clean speech; MMS-side min stays on the
            # syllable, and silence-snap already corrects pause smear.
            row.update(t=round(min(tA, tB), 2), status="CONFIRMED",
                       delta=round(abs(tA - tB), 2), tEnd=la["tEnd"])
        else:
            picked = None
            for cand, tag in ((tA, "PROBED_A"), (tB, "PROBED_B")):
                if cand is None:
                    continue
                ok, heard = probe_fn(cand, expect)
                if ok:
                    picked = (cand, tag, heard)
                    break
            if picked:
                row.update(t=round(picked[0], 2), status=picked[1],
                           probe=" ".join(picked[2]), tEnd=(la or lb)["tEnd"])
            else:
                prev_t = next((rows[j]["t"] for j in range(len(rows) - 1, -1, -1)
                               if rows[j].get("t") is not None), None)
                row.update(t=None, status="REVIEW", prevAnchor=prev_t)
        rows.append(row)

    if s.get("interpolate_missing", True):
        for i, r in enumerate(rows):
            if r.get("t") is not None:
                continue
            prev_t = next((rows[j]["t"] for j in range(i - 1, -1, -1)
                           if rows[j].get("t") is not None and not rows[j].get("interpolated")), None)
            nxt_t = next((rows[j]["t"] for j in range(i + 1, len(rows))
                          if rows[j].get("t") is not None), None)
            if prev_t is not None and nxt_t is not None:
                r["t"] = round((prev_t + nxt_t) / 2, 2)
                r["interpolated"] = True
            elif prev_t is not None:
                r["t"] = prev_t
                r["interpolated"] = True

    bias = float(s.get("onset_bias_s", 0.0))
    last = -1.0
    for r in rows:
        if r.get("t") is None:
            continue
        if snap_fn is not None and not r.get("interpolated"):
            snapped = snap_fn(r["t"])
            if snapped != r["t"]:
                r["snapped_from"] = r["t"]
                r["t"] = round(snapped, 2)
        if bias:
            r["t"] = round(r["t"] + bias, 2)
        if r["t"] < last:
            r["t"] = last
            r["clamped"] = True
        last = r["t"]
        r["t"] = max(0.0, round(r["t"] - s["lead_in"], 2))
    return rows


def silence_intervals(wav, noise_db=-32, min_d=0.25):
    """[(start, end), ...] from ffmpeg silencedetect, cached beside the wav.
    Calibration note: WOP's continuous music bed yields NO intervals — by design
    (its gaps are music; onset_bias_s handles that family instead)."""
    import subprocess
    cache = wav + ".sil.json"
    if os.path.exists(cache):
        return json.load(open(cache, encoding="utf-8"))
    r = subprocess.run(["ffmpeg", "-i", wav, "-af",
                        f"silencedetect=noise={noise_db}dB:d={min_d}", "-f", "null", "-"],
                       capture_output=True, text=True)
    starts = [float(m) for m in re.findall(r"silence_start: ([0-9.]+)", r.stderr)]
    ends = [float(m) for m in re.findall(r"silence_end: ([0-9.]+)", r.stderr)]
    ivals = [[s0, e0] for s0, e0 in zip(starts, ends) if e0 > s0]
    json.dump(ivals, open(cache, "w", encoding="utf-8"))
    return ivals


def make_snap(intervals, back_off=0.05, max_snap=1.5):
    """snap_fn for belt(): a start inside a silence interval moves to the
    interval's end minus back_off (the voice onset), never more than max_snap."""
    def snap(t):
        for s0, e0 in intervals:
            if s0 <= t < e0:
                target = max(t, e0 - back_off)
                if target - t <= max_snap:
                    return target
                return t
        return t
    return snap


# --------------------------------------------------------------- registry ---

LETTERS_PROMPT = (
    "A reading from The Volumes of Truth. Thus says The Lord: YahuShua HaMashiach, "
    "YAHUWAH, Immanu El, the God of Abraham, Isaac and Jacob, spoken to Timothy. "
    "Selah. Amen."
)

SETTINGS_BASE = {
    # -- leg B: transcription (faster-whisper) --
    "whisper_model": "large-v3",
    "compute_type": "float16",
    "beam_size": 10,
    "temperature": 0.0,
    "condition_on_previous_text": False,
    "initial_prompt": None,
    "vad_filter": False,
    "hallucination_silence_threshold": 2.0,
    "norm_apostrophes": True,
    # -- matcher (Needleman-Wunsch) --
    "match_exact": 2.0,
    "match_prefix": 1.4,
    "gap_transcript": -0.35,
    "gap_fragment": -0.55,
    "min_frag_hit": 0.5,
    "interpolate_missing": True,
    # -- leg A: MMS_FA forced alignment --
    "mms_star_edges": True,
    "mms_star_gap": False,
    "star_between_blocks": False,
    "mms_chunk_sec": 480.0,
    "mms_chunk_overlap_sec": 2.0,
    "mms_trellis_budget": 600000000,
    "mms_window_chars": 4000,
    "mms_window_slack": 2.2,
    # -- belt --
    "agree_sec": 0.6,
    "probe_len": 7.0,
    "probe_tokens": 6,
    "probe_beam": 5,
    "lead_in": 0.0,
    # -- editorial policy carried for downstream consumers (no behaviour here) --
    "psalm_superscription": None,
    "unit": None,
}

FAMILIES = {
    "letters-A": {
        "initial_prompt": LETTERS_PROMPT,
        "unit": "sentence",
    },
    "letters-B": {
        "initial_prompt": LETTERS_PROMPT,
        "unit": "paragraph",
        "min_frag_hit": 0.4,
    },
    "bible-brm-kjv": {
        "initial_prompt": ("The Holy Bible, King James Version, read aloud. "
                           "Thus saith the LORD God of Israel. Selah."),
        "unit": "verse",
        "psalm_superscription": "unprinted",
    },
    "bible-wop-nkjv": {
        "initial_prompt": ("The Word of Promise, a dramatized reading of the Holy Bible, "
                           "New King James Version."),
        "unit": "verse",
        "psalm_superscription": "folded-v1",
        # Continuous music bed: gaps between verses are music, so silence-snap
        # never fires here. onset_bias_s stays 0.0 — a +0.35 "correction" was
        # briefly dialed against hone-verify's clip-boundary deltas, then wide-
        # window ground truth proved the original stamps right and the ruler
        # bent (whisper clip stamps carry a ~±0.3 s floor). The knob remains
        # for any edition where ground truth ever shows a real constant bias.
        "onset_bias_s": 0.0,
    },
    "bible-web": {
        "initial_prompt": ("The World English Bible, a public domain reading of the Holy "
                           "Scriptures. Yahweh, the God of Israel. Selah."),
        "unit": "verse",
        "psalm_superscription": "folded-v1",
    },
}

RATIONALE = {
    "whisper_model": "large-v3 is the quality ceiling this GPU runs in real time; medium drops short lines.",
    "compute_type": "float16 — the accuracy/VRAM point large-v3 fits at on a 16 GB card.",
    "beam_size": "10 (batch shipper used 5): the extra beams recover mangled sacred names.",
    "temperature": "0.0 with no fallback ladder — reruns must be reproducible.",
    "condition_on_previous_text": "False kills repetition-loop hallucinations on refrain-heavy letters.",
    "initial_prompt": "Vocabulary bias for the names/register this corpus uses and the model otherwise mangles.",
    "vad_filter": "False — continuous readings; VAD eats quiet openings and whole soft verses.",
    "hallucination_silence_threshold": "2.0 s — words 'heard' inside long silences are dropped.",
    "norm_apostrophes": "Apostrophes kept in the whisper domain; only --legacy strips them (archived caches).",
    "match_exact": "NW reward for an identical token.",
    "match_prefix": "NW reward for a stem match (len>4 / len>2, one a prefix of the other).",
    "gap_transcript": "Cheap: unmatched spoken words are normal (front matter, ad-libs, cites).",
    "gap_fragment": "Costlier: an unmatched printed token usually means a real miss, not a skip.",
    "min_frag_hit": "Share of a unit's tokens leg B must match for the unit to count as cleared.",
    "interpolate_missing": "A unit neither leg can prove still gets a neighbour-interpolated t, flagged.",
    "mms_star_edges": "Star before the first and after the last unit absorbs announcements, music, outros.",
    "mms_star_gap": "Star between every unit — only for editions with heavy inter-unit ad-lib.",
    "star_between_blocks": "Letters: star at block boundaries (headings/spoken asides). Per-key opt-in.",
    "mms_chunk_sec": "wav2vec2 forward-pass window; below it a chapter is one pass (byte-stable).",
    "mms_chunk_overlap_sec": "Overlap trimmed in half at each seam so the frame grid stays global.",
    "mms_trellis_budget": "Frames x tokens ceiling before forced alignment switches to sequential windows.",
    "mms_window_chars": "Characters per windowed forced-alignment group.",
    "mms_window_slack": "Audio widening factor per group; the window retries wider if the tail is clipped.",
    "agree_sec": "Leg gap at or under this = the legs confirm each other, no probe spent.",
    "probe_len": "7 s: dramatized readings pause mid-unit; a short probe fails good stamps.",
    "probe_tokens": "Opening tokens the probe must hit in order (threshold max(2, want-2)).",
    "probe_beam": "Probes are short clips — beam 5 is enough and keeps arbitration cheap.",
    "lead_in": "0.0 — shipped data carries TRUE onsets; the perceptual lead lives in the app constant.",
    "psalm_superscription": "Edition convention for Psalm superscriptions (carried; no behaviour yet).",
    "unit": "What one alignment row means in this family.",
}


def settings_for(family, **overrides):
    """Effective settings for a family: SETTINGS_BASE + family overrides + kwargs."""
    if family not in FAMILIES:
        raise KeyError(f"unknown family {family!r}; known: {', '.join(sorted(FAMILIES))}")
    s = dict(SETTINGS_BASE)
    s.update(FAMILIES[family])
    s["family"] = family
    s.update({k: v for k, v in overrides.items() if v is not None})
    return s


def settings_hash(sdict):
    """10-char sha1 of the effective settings — stamped into every output."""
    blob = json.dumps(sdict, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()[:10]


def emit_settings_sheet(path=None):
    """Write the human-readable registry: every family's effective settings + why."""
    path = path or os.path.join(WORK, "SETTINGS-SHEET.md")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fams = sorted(FAMILIES)
    L = ["# Alignment settings sheet",
         "",
         "Generated by `_alignlib.emit_settings_sheet()`. One row per knob, one column "
         "per family; the hash under each family name is what outputs are stamped with.",
         ""]
    eff = {f: settings_for(f) for f in fams}
    L.append("| setting | " + " | ".join(fams) + " | why |")
    L.append("|---|" + "---|" * (len(fams) + 1))

    def cell(v):
        if v is None:
            return "—"
        if isinstance(v, bool):
            return "yes" if v else "no"
        if isinstance(v, str) and len(v) > 60:
            return "`" + v[:57].replace("|", "\\|") + "…`"
        if isinstance(v, str):
            return "`" + v.replace("|", "\\|") + "`"
        return f"`{v}`"

    for k in list(SETTINGS_BASE):
        L.append("| `" + k + "` | " + " | ".join(cell(eff[f][k]) for f in fams)
                 + " | " + RATIONALE.get(k, "") + " |")
    L.append("| **settings_hash** | " + " | ".join("`" + settings_hash(eff[f]) + "`" for f in fams)
             + " | Identity of the whole dict; a change here invalidates belts, not transcripts. |")
    L += ["", "## Full initial prompts", ""]
    for f in fams:
        L.append(f"- **{f}** — `{eff[f]['initial_prompt']}`")
    L += ["", "## Notes", "",
          "- `lead_in` is 0.0 for every family: alignment ships TRUE onsets and the single "
          "perceptual lead is applied once, at paint time, by the app (and mirrored in the "
          "sample pages). Passing `--lead-in 0.15` reproduces the pre-campaign archives.",
          "- `psalm_superscription` records the edition's convention — KJV prints no "
          "superscription the reader speaks (`unprinted`, the star absorbs it), WOP/WEB fold "
          "it into verse 1 (`folded-v1`). Carried in settings for downstream use; no "
          "behaviour is attached to it here.",
          ""]
    open(path, "w", encoding="utf-8").write("\n".join(L))
    return path


if __name__ == "__main__":
    print("wrote " + emit_settings_sheet())
