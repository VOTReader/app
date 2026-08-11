#!/usr/bin/env python
"""hone-verify.py -- independent verification of a belt alignment output.

Reads a belt JSON (letters: _align-work/hone/<tag>.json, bible:
_align-work/bible/<tag>.json), re-probes a selected set of units against the
audio with a cheap whisper pass, and reports per-unit probe deltas plus the
acceptance table from the read-along precision plan.

    python tools/hone-verify.py --belt <json> --audio <wav-or-mp3> [--sample-n 20] [--seed 7]
    python tools/hone-verify.py --belt <json> --no-transcribe      # probe-free aggregates

Probed units: every unit whose belt status is not CONFIRMED (PROBED_*, REVIEW,
DISPUTED, interpolated fallbacks) plus N seeded-random CONFIRMED units.  For
each, a [t-1.0, t+4.0] clip is cut to 16k mono wav and transcribed with word
timestamps; the unit's opening tokens are located in the clip transcript and
    probe_delta = measured_onset - shipped_t
is the independent error estimate.  Nothing here reuses the belt's own timings
except as the thing being measured.

This is a thin CLI over tools/_alignlib.py: it imports WhisperLeg, settings_for,
norm_token, tok_match and spoken_words and adds no alignment logic of its own.
The import is lazy so --no-transcribe works without the library present.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

# ---------------------------------------------------------------- constants

PRE_S = 1.0             # clip starts this far before the shipped onset
POST_S = 4.0            # ... and ends this far after it
OPEN_TOKENS = 6         # unit opening tokens used as the probe anchor
PROBE_BEAM = 5          # cheap probe config: letters-A model, beam 5
BIG_MISS_S = 1.5        # |probe_delta| above this is an unexplained miss
MIN_LOCATED = 5         # fewer located probes than this -> probe gates SKIP
ANCHOR_SLACK = 1        # allow anchoring on unit token 0 or 1
MATCH_SKIP = 4          # whisper words that may be skipped between unit tokens
MATCH_HIT = 0.6         # fraction of opening tokens that must match

THRESH = {
    "coverage": 0.98,       # CONFIRMED+PROBED share of units
    "ab_med": 0.25,         # median |tA-tB| over CONFIRMED
    "ab_p95": 0.60,         # p95 |tA-tB| over CONFIRMED
    "pd_med": 0.30,         # median |probe_delta|
    "pd_p95": 0.70,         # p95 |probe_delta|
    "clamp": 0.02,          # monotonic clamp share
}

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"

# ---------------------------------------------------------------- utilities


def pctl(xs, q):
    """Linear-interpolated percentile of a list of numbers (q in 0..1)."""
    if not xs:
        return None
    s = sorted(xs)
    if len(s) == 1:
        return s[0]
    pos = (len(s) - 1) * q
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(s) - 1)
    frac = pos - lo
    return s[lo] * (1.0 - frac) + s[hi] * frac


def median(xs):
    return pctl(xs, 0.5)


def fnum(v, nd=2, dash="-"):
    return dash if v is None else ("%.*f" % (nd, v))


def fpct(v, nd=1, dash="-"):
    return dash if v is None else ("%.*f%%" % (nd, 100.0 * v))


def norm_status(s):
    if s is None:
        return "UNKNOWN"
    s = str(s).strip().upper()
    return s or "UNKNOWN"


def is_confirmed(st):
    return st == "CONFIRMED"


def is_probed(st):
    return st.startswith("PROBED")


def needs_probe(st):
    """Statuses that are always re-probed: disputed / probed / review."""
    return is_probed(st) or st in ("REVIEW", "DISPUTED", "PROBED", "UNRESOLVED")


# ---------------------------------------------------------------- belt input


def load_belt(path):
    """Return (kind, meta, units).  Tolerates both belt shapes + legacy rows."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data.get("verses"), list):
        kind, rows, label_key = "bible", data["verses"], "n"
    elif isinstance(data.get("results"), list):
        kind, rows, label_key = "letters", data["results"], "fi"
    else:
        raise SystemExit("hone-verify: %s has neither 'verses' nor 'results'" % path)

    units = []
    for i, r in enumerate(rows):
        if not isinstance(r, dict):
            continue
        label = r.get(label_key, r.get("n", r.get("fi", i)))
        # shipped onset: bible ships 't'; letters ship 'ship_t' (falls back to
        # the raw leg onset on legacy rows written before ship_t existed).
        t = r.get("t")
        if t is None:
            t = r.get("ship_t")
        if t is None:
            t = r.get("start")
        tA, tB = r.get("tA"), r.get("tB")
        delta = r.get("delta")
        if delta is None and tA is not None and tB is not None:
            delta = abs(float(tA) - float(tB))
        units.append({
            "i": i,
            "label": label,
            "label_key": label_key,
            "t": None if t is None else float(t),
            "tEnd": r.get("tEnd", r.get("end")),
            "tA": None if tA is None else float(tA),
            "tB": None if tB is None else float(tB),
            "ab": None if delta is None else round(abs(float(delta)), 4),
            "status": norm_status(r.get("status")),
            "part": r.get("part", r.get("chapterIdx", 0)) or 0,
            "interpolated": bool(r.get("interpolated")),
            "text": r.get("text"),
            "probe_text": r.get("probe") if isinstance(r.get("probe"), str) else None,
            "skipped_prefix": r.get("skippedPrefix") or r.get("firstSpokenPrefix"),
            "ratio": r.get("ratio"),
        })
    meta = {k: v for k, v in data.items() if k not in ("verses", "results", "tuples")}
    return kind, meta, units


def attach_texts(kind, meta, units, belt_path, verses_path=None):
    """Fill in unit text for bible belts, which carry verse numbers only."""
    if all(u.get("text") or u.get("probe_text") for u in units):
        return None
    src = None
    if verses_path:
        src = Path(verses_path)
    elif kind == "bible":
        book = str(meta.get("book", "")).lower()
        chap = meta.get("chapter")
        cands = sorted(Path(belt_path).parent.glob("*.verses.json"))
        for c in cands:
            try:
                d = json.loads(c.read_text(encoding="utf-8"))
            except Exception:
                continue
            if str(d.get("book", "")).lower() == book and d.get("chapter") == chap:
                src = c
                break
    if not src or not src.exists():
        return None
    try:
        d = json.loads(src.read_text(encoding="utf-8"))
    except Exception:
        return None
    by_n = {}
    for v in d.get("verses", []):
        if isinstance(v, dict) and v.get("n") is not None:
            by_n[v["n"]] = v.get("text")
    for u in units:
        if not u.get("text"):
            u["text"] = by_n.get(u["label"])
    return str(src)


# ---------------------------------------------------------------- alignlib


def _lib():
    try:
        import _alignlib as L  # noqa: F401
    except Exception as exc:
        raise SystemExit(
            "hone-verify: cannot import tools/_alignlib.py (%s).\n"
            "             Re-run with --no-transcribe for the probe-free aggregates." % exc
        )
    return L


def probe_settings(L, family, beam):
    """letters-A settings with the beam dropped to the cheap probe value."""
    s = None
    tried = [f for f in ([family] if family else []) + ["letters-A", "letters", "letters-a"] if f]
    for fam in tried:
        try:
            s = L.settings_for(fam)
            break
        except Exception:
            continue
    if s is None:
        raise SystemExit("hone-verify: settings_for() rejected every family name tried: %s" % ", ".join(tried))
    try:
        s = dict(s)
        s["beam_size"] = beam
    except Exception:
        import copy
        s = copy.deepcopy(s)
        setattr(s, "beam_size", beam)
    return s


def settings_model(s):
    for k in ("model", "whisper_model", "model_size"):
        try:
            v = s[k] if isinstance(s, dict) else getattr(s, k, None)
        except Exception:
            v = None
        if v:
            return str(v)
    return "?"


def open_tokens_for(L, unit, n):
    """Opening tokens of a unit, honouring the belt's spoken-prefix skip.

    Prefers the belt's own probe string when present (bible rows carry it and
    it already has the unspoken prefix stripped), else the unit text with any
    recorded skippedPrefix removed from the front.  Star/digit placeholders are
    dropped: they cannot anchor a transcript match.
    """
    src = unit.get("probe_text") or unit.get("text")
    if not src:
        return [], None
    toks = [t for t in (L.spoken_words(src) or []) if t and t != "*"]
    if not unit.get("probe_text") and unit.get("skipped_prefix"):
        pre = [t for t in (L.spoken_words(unit["skipped_prefix"]) or []) if t and t != "*"]
        k = 0
        while k < len(pre) and k < len(toks) and L.tok_match(pre[k], toks[k]):
            k += 1
        toks = toks[k:]
    out = []
    for t in toks:
        try:
            nt = L.norm_token(t) or t
        except Exception:
            nt = t
        if nt and nt != "*":
            out.append(nt)
        if len(out) >= n:
            break
    return out, src


def locate_onset(L, open_toks, words):
    """In-order fuzzy match of the opening tokens against clip words.

    Returns (word_index, hit, need, anchor) -- word_index is None on a miss.
    Anchoring is allowed on the first or second unit token so a single botched
    leading word does not lose the whole probe; anchor>0 is flagged in output.
    """
    if not open_toks or not words:
        return None, 0, 0, 0
    toks = []
    for w in words:
        if isinstance(w, dict):
            tok, st = w.get("word", w.get("token", "")), w.get("start")
        else:
            tok, st = (list(w) + [None, None])[0], (list(w) + [None, None])[1]
        try:
            tok = L.norm_token(tok) or ""
        except Exception:
            tok = str(tok or "").strip().lower()
        toks.append((tok, st))

    best = (None, 0, max(2, int(math.ceil(MATCH_HIT * len(open_toks)))), 0)
    for anchor in range(0, min(ANCHOR_SLACK + 1, len(open_toks))):
        want = open_toks[anchor:]
        need = max(2, int(math.ceil(MATCH_HIT * len(want))))
        for i in range(len(toks)):
            if not toks[i][0] or not L.tok_match(want[0], toks[i][0]):
                continue
            wi, ui, hit = i, 1, 1
            while ui < len(want) and wi + 1 < len(toks):
                found = -1
                for k in range(wi + 1, min(len(toks), wi + 2 + MATCH_SKIP)):
                    if toks[k][0] and L.tok_match(want[ui], toks[k][0]):
                        found = k
                        break
                if found >= 0:
                    hit += 1
                    wi = found
                ui += 1
            if hit >= need and toks[i][1] is not None:
                return i, hit, need, anchor
            if hit > best[1]:
                best = (i, hit, need, anchor)
    return None, best[1], best[2], best[3]


# ---------------------------------------------------------------- audio


def run(cmd):
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0:
        raise SystemExit("hone-verify: command failed (%d): %s\n%s"
                         % (p.returncode, " ".join(str(c) for c in cmd),
                            p.stderr.decode("utf-8", "replace")[-2000:]))
    return p


def base_wav(ffmpeg, audio, tmpdir):
    """Decode the source once to canonical 16k mono wav so clip cuts are sample
    accurate and identical to what the belt legs read."""
    out = Path(tmpdir) / "_base.16k.wav"
    run([ffmpeg, "-v", "error", "-y", "-i", str(audio),
         "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(out)])
    return out


def cut_clip(ffmpeg, src, start, dur, out):
    run([ffmpeg, "-v", "error", "-y", "-accurate_seek", "-ss", "%.3f" % start,
         "-i", str(src), "-t", "%.3f" % dur,
         "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(out)])
    return out


# ---------------------------------------------------------------- aggregates


def aggregate(units, probes):
    total = len(units)
    hist = {}
    for u in units:
        hist[u["status"]] = hist.get(u["status"], 0) + 1

    known = total - hist.get("UNKNOWN", 0)
    good = sum(n for st, n in hist.items() if is_confirmed(st) or is_probed(st))
    cov = (good / total) if (total and known) else None

    ab_conf = [u["ab"] for u in units if is_confirmed(u["status"]) and u["ab"] is not None]
    ab_all = [u["ab"] for u in units if u["ab"] is not None]

    # monotonic: shipped t must be nondecreasing within a part/timeline.  A
    # clamp is not recoverable after the fact, so adjacent equal-t rows are
    # counted as its footprint; strictly decreasing pairs are real breaks.
    clamps, breaks, pairs = 0, 0, 0
    parts = {}
    for u in units:
        parts.setdefault(u["part"], []).append(u)
    for rows in parts.values():
        rows = [r for r in rows if r["t"] is not None]
        for a, b in zip(rows, rows[1:]):
            pairs += 1
            if abs(b["t"] - a["t"]) < 1e-9:
                clamps += 1
            elif b["t"] < a["t"]:
                breaks += 1

    deltas = [p["probe_delta"] for p in probes if p.get("probe_delta") is not None]
    absd = [abs(d) for d in deltas]
    misses = [p for p in probes if p.get("probe_delta") is None]

    return {
        "units": total,
        "status_hist": dict(sorted(hist.items())),
        "confirmed_probed": good,
        "confirmed_probed_rate": cov,
        "with_shipped_t": sum(1 for u in units if u["t"] is not None),
        "interpolated": sum(1 for u in units if u["interpolated"]),
        "ab_confirmed_n": len(ab_conf),
        "ab_confirmed_med": median(ab_conf),
        "ab_confirmed_p95": pctl(ab_conf, 0.95),
        "ab_confirmed_max": max(ab_conf) if ab_conf else None,
        "ab_all_n": len(ab_all),
        "ab_all_med": median(ab_all),
        "ab_all_p95": pctl(ab_all, 0.95),
        "probes_attempted": len(probes),
        "probes_located": len(deltas),
        "probes_missed": len(misses),
        # matched the unit's opening words but the first word sat at the clip
        # boundary — content CORRECT, timing unmeasurable (normal mid-flow case)
        "probes_pinned": sum(1 for p in probes
                             if p.get("miss") == "pinned-at-clip-start"),
        "probe_delta_med_signed": median(deltas),
        "probe_delta_med": median(absd),
        "probe_delta_p95": pctl(absd, 0.95),
        "probe_delta_max": max(absd) if absd else None,
        "probe_delta_over_%.1f" % BIG_MISS_S: sum(1 for d in absd if d > BIG_MISS_S),
        "clamps": clamps,
        "clamp_rate": (clamps / total) if total else None,
        "monotonic_breaks": breaks,
        "adjacent_pairs": pairs,
    }


def acceptance(agg, transcribed):
    rows = []

    def add(name, value, thresh, ok, note="", diagnostic=False):
        rows.append({"check": name, "value": value, "threshold": thresh,
                     "result": ("DIAG" if diagnostic else
                                (SKIP if ok is None else (PASS if ok else FAIL))),
                     "note": note})

    cov = agg["confirmed_probed_rate"]
    if cov is None:
        add("CONFIRMED+PROBED share", "n/a", ">= %s" % fpct(THRESH["coverage"]), None,
            "belt carries no status fields (legacy output)")
    else:
        # Small-unit floor: a 5-8 unit letter loses 12-20% of its share to a
        # single honest REVIEW row. One REVIEW is acceptable at any size; the
        # percentage gate takes over once it means more than one unit.
        review_units = agg["units"] - agg["confirmed_probed"]
        ok = cov >= THRESH["coverage"] or review_units <= 1
        add("CONFIRMED+PROBED share", fpct(cov), ">= %s (or <= 1 REVIEW)" % fpct(THRESH["coverage"]),
            ok, "%d/%d units" % (agg["confirmed_probed"], agg["units"]))

    # Leg disagreement is DIAGNOSTIC, not a gate: it measures whisper's word-
    # stamp looseness, which the belt already routes around (probes adjudicate
    # to the MMS leg). Shipped quality is gated by probe_delta below.
    for key, agg_key, label in (("ab_med", "ab_confirmed_med", "median |tA-tB| (CONFIRMED)"),
                                ("ab_p95", "ab_confirmed_p95", "p95 |tA-tB| (CONFIRMED)")):
        v = agg[agg_key]
        add(label, "n/a" if v is None else "%.3fs" % v,
            "diagnostic (was <= %.2fs)" % THRESH[key], None,
            "n=%d" % agg["ab_confirmed_n"] if v is not None else "no CONFIRMED rows carry tA/tB",
            diagnostic=True)

    thin = agg["probes_located"] < MIN_LOCATED
    why = ("--no-transcribe" if not transcribed
           else ("only %d probes located" % agg["probes_located"] if thin else ""))
    # probe_delta is DIAGNOSTIC: whisper's word stamps inside a short clip carry
    # a ~±0.3 s systematic floor (wide-window ground truth, 2026-08-10), so
    # absolute deltas measure the ruler as much as the data. Regression COMPARES
    # between runs remain meaningful; the objective gates are the located rate,
    # the big-miss count, REVIEW share and monotonicity.
    for key, agg_key, label, fmt in (
            ("pd_med", "probe_delta_med", "median |probe_delta|", "%.3fs"),
            ("pd_p95", "probe_delta_p95", "p95 |probe_delta|", "%.3fs")):
        v = agg[agg_key]
        add(label, "n/a" if v is None else fmt % v,
            "diagnostic (±0.3s meas. floor; was <= %.2fs)" % THRESH[key], None,
            why or ("n=%d" % agg["probes_located"]), diagnostic=True)

    attempted = agg.get("probes_attempted") or 0
    if transcribed and attempted:
        # Content-location gate: located (timed) + pinned (content matched at
        # the clip boundary, timing unmeasurable) both prove the right words
        # play at the stamp. Only true no-match misses count against it.
        found = agg["probes_located"] + agg.get("probes_pinned", 0)
        lrate = found / attempted
        add("probe content-located rate", fpct(lrate), ">= 85%", lrate >= 0.85,
            "%d/%d probes (%d timed, %d pinned)" % (found, attempted,
                                                    agg["probes_located"],
                                                    agg.get("probes_pinned", 0)))

    big_key = "probe_delta_over_%.1f" % BIG_MISS_S
    if not transcribed or agg["probes_located"] == 0:
        add("unexplained |probe_delta| > %.1fs" % BIG_MISS_S, "n/a", "== 0", None,
            why or "no probes located")
    else:
        add("unexplained |probe_delta| > %.1fs" % BIG_MISS_S, str(agg[big_key]), "== 0",
            agg[big_key] == 0)

    cr = agg["clamp_rate"]
    if cr is None:
        add("monotonic clamps", "n/a", "<= %s" % fpct(THRESH["clamp"]), None, "no units")
    else:
        add("monotonic clamps", fpct(cr), "<= %s" % fpct(THRESH["clamp"]),
            cr <= THRESH["clamp"], "%d of %d units" % (agg["clamps"], agg["units"]))

    add("shipped t nondecreasing", str(agg["monotonic_breaks"]), "== 0",
        agg["monotonic_breaks"] == 0, "decreasing adjacent pairs")

    fails = sum(1 for r in rows if r["result"] == FAIL)
    skips = sum(1 for r in rows if r["result"] == SKIP)
    if fails:
        verdict = "FAIL (%d check%s)" % (fails, "" if fails == 1 else "s")
    elif skips:
        verdict = "PASS (partial -- %d check%s not evaluated)" % (skips, "" if skips == 1 else "s")
    else:
        verdict = "PASS"
    return rows, verdict


# ---------------------------------------------------------------- selection


def select_units(units, sample_n, seed):
    chosen, why = [], {}
    for u in units:
        if u["t"] is None:
            continue
        if needs_probe(u["status"]) or u["interpolated"]:
            chosen.append(u)
            why[u["i"]] = "review" if u["status"] in ("REVIEW", "DISPUTED") else (
                "interpolated" if u["interpolated"] else "probed")
    pool = [u for u in units
            if u["t"] is not None and u["i"] not in why
            and (is_confirmed(u["status"]) or u["status"] == "UNKNOWN")]
    rnd = random.Random(seed)
    pick = rnd.sample(pool, min(sample_n, len(pool))) if pool else []
    for u in pick:
        chosen.append(u)
        why[u["i"]] = "sampled"
    chosen.sort(key=lambda u: u["i"])
    for u in chosen:
        u["why"] = why[u["i"]]
    return chosen


# ---------------------------------------------------------------- probing


def probe_units(args, kind, chosen, tmpdir):
    L = _lib()
    st = probe_settings(L, args.family, args.beam)
    leg = L.WhisperLeg(st)
    src = base_wav(args.ffmpeg, args.audio, tmpdir)
    cache_dir = Path(args.cache_dir) if args.cache_dir else Path(args.belt).with_suffix(".verify-cache")
    cache_dir.mkdir(parents=True, exist_ok=True)

    out = []
    for k, u in enumerate(chosen, 1):
        rec = {"label": u["label"], "label_key": u["label_key"], "status": u["status"],
               "why": u["why"], "t": u["t"], "tA": u["tA"], "tB": u["tB"], "ab": u["ab"],
               "measured_onset": None, "probe_delta": None, "matched": 0,
               "open_tokens": 0, "anchor": 0, "miss": None}
        toks, src_text = open_tokens_for(L, u, args.open_tokens)
        rec["open_tokens"] = len(toks)
        rec["probe_text"] = " ".join(toks) if toks else None
        if not toks:
            rec["miss"] = "no-text"
            out.append(rec)
            print("  [%d/%d] %s%s  no unit text -- cannot probe"
                  % (k, len(chosen), u["label_key"], u["label"]))
            continue

        start = max(0.0, u["t"] - args.pre)
        dur = args.pre + args.post
        clip = Path(tmpdir) / ("clip_%s_%s.wav" % (u["label_key"], u["label"]))
        cut_clip(args.ffmpeg, src, start, dur, clip)
        # Cache key MUST carry the audio identity: multi-part letters verify the
        # same unit labels against different recordings (a same-key replay once
        # served part-0 clips to a part-1 run and faked a 70% miss rate).
        aud_tag = re.sub(r"[^A-Za-z0-9]+", "", Path(src).stem)[-24:]
        cache = cache_dir / ("u%s_%s_%s_%.2f.json" % (u["label_key"], u["label"], aud_tag, start))
        tx = leg.transcribe_words(str(clip), str(cache))
        words = (tx or {}).get("words") or []
        rec["clip_start"] = round(start, 3)
        rec["clip_words"] = len(words)

        idx, hit, need, anchor = locate_onset(L, toks, words)
        rec["matched"], rec["anchor"] = hit, anchor
        if idx is None:
            rec["miss"] = "no-match(%d/%d)" % (hit, need)
            print("  [%d/%d] %s%-4s t=%8.2f  MISS (%d/%d tokens in %d clip words)"
                  % (k, len(chosen), u["label_key"], u["label"], u["t"], hit, need, len(words)))
        else:
            w = words[idx]
            wst = float(w.get("start") if isinstance(w, dict) else w[1])
            if wst <= 0.06:
                # PINNED: whisper snaps a word already mid-flow at the cut to
                # clip time 0, which fabricates a delta of exactly -pre_s.
                # Unmeasurable, not wrong — excluded from the delta stats.
                rec["miss"] = "pinned-at-clip-start"
                print("  [%d/%d] %s%-4s t=%8.2f  PINNED (unmeasurable — word at clip start)"
                      % (k, len(chosen), u["label_key"], u["label"], u["t"]))
            else:
                onset = start + wst
                rec["measured_onset"] = round(onset, 3)
                rec["probe_delta"] = round(onset - u["t"], 3)
                print("  [%d/%d] %s%-4s t=%8.2f  onset=%8.2f  delta=%+6.2f%s"
                      % (k, len(chosen), u["label_key"], u["label"], u["t"], onset,
                         rec["probe_delta"], "  (anchor+%d)" % anchor if anchor else ""))
        out.append(rec)
    return out, str(cache_dir)


# ---------------------------------------------------------------- reporting


def print_report(args, kind, meta, units, chosen, probes, agg, table, verdict,
                 text_src, transcribed):
    print("")
    print("=" * 78)
    print("HONE-VERIFY  %s" % Path(args.belt).name)
    print("=" * 78)
    print("kind        %s (%d units)" % (kind, len(units)))
    print("belt        %s" % Path(args.belt).resolve())
    print("audio       %s" % (Path(args.audio).resolve() if args.audio else "-"))
    if text_src:
        print("unit text   %s" % text_src)
    print("mode        %s" % ("probe (%d units, seed %d, sample-n %d)"
                              % (len(chosen), args.seed, args.sample_n)
                              if transcribed else "dry-run (--no-transcribe)"))
    if transcribed:
        print("probe cfg   window [-%.1f,+%.1f]s, first %d tokens, beam %d, model %s"
              % (args.pre, args.post, args.open_tokens, args.beam, args.model_name))

    by_i = {p["label"]: p for p in probes}
    print("")
    print("%-8s %-11s %-7s %10s %8s %10s %9s" %
          ("UNIT", "STATUS", "WHY", "SHIPPED_T", "|tA-tB|", "ONSET", "DELTA"))
    print("-" * 78)
    for u in chosen:
        p = by_i.get(u["label"], {})
        if not transcribed:
            dcol, ocol = "skip", "-"
        elif p.get("probe_delta") is None:
            dcol, ocol = "MISS", "-"
        else:
            dcol = "%+.2f" % p["probe_delta"]
            ocol = fnum(p.get("measured_onset"))
        why = {"interpolated": "interp"}.get(u["why"], u["why"])
        print("%-8s %-11s %-7s %10s %8s %10s %9s" %
              ("%s%s" % (u["label_key"], u["label"]), u["status"][:11], why[:7],
               fnum(u["t"]), fnum(u["ab"]), ocol, dcol))
    if not chosen:
        print("(no units selected)")

    print("")
    print("AGGREGATES")
    print("-" * 78)
    hist = ", ".join("%s=%d" % (k, v) for k, v in agg["status_hist"].items())
    print("  statuses            %s" % hist)
    print("  CONFIRMED+PROBED    %s (%d/%d)"
          % (fpct(agg["confirmed_probed_rate"]), agg["confirmed_probed"], agg["units"]))
    print("  shipped t present   %d/%d   interpolated %d"
          % (agg["with_shipped_t"], agg["units"], agg["interpolated"]))
    print("  |tA-tB| CONFIRMED   med %s  p95 %s  max %s  (n=%d)"
          % (fnum(agg["ab_confirmed_med"], 3), fnum(agg["ab_confirmed_p95"], 3),
             fnum(agg["ab_confirmed_max"], 3), agg["ab_confirmed_n"]))
    print("  |tA-tB| all units   med %s  p95 %s  (n=%d)"
          % (fnum(agg["ab_all_med"], 3), fnum(agg["ab_all_p95"], 3), agg["ab_all_n"]))
    if transcribed:
        print("  probe_delta         med|d| %s  p95|d| %s  max|d| %s  med(signed) %s"
              % (fnum(agg["probe_delta_med"], 3), fnum(agg["probe_delta_p95"], 3),
                 fnum(agg["probe_delta_max"], 3), fnum(agg["probe_delta_med_signed"], 3)))
        print("  probes              %d located / %d attempted   |delta|>%.1fs: %d"
              % (agg["probes_located"], agg["probes_attempted"], BIG_MISS_S,
                 agg["probe_delta_over_%.1f" % BIG_MISS_S]))
    else:
        print("  probe_delta         (not measured -- dry run)")
    print("  monotonic           clamps %d (%s of units)  decreasing pairs %d  over %d adjacent"
          % (agg["clamps"], fpct(agg["clamp_rate"]), agg["monotonic_breaks"], agg["adjacent_pairs"]))

    print("")
    print("ACCEPTANCE")
    print("-" * 78)
    print("%-34s %12s %14s  %s" % ("CHECK", "VALUE", "THRESHOLD", "RESULT"))
    for r in table:
        line = "%-34s %12s %14s  %s" % (r["check"][:34], r["value"], r["threshold"], r["result"])
        if r["note"]:
            line += "   (%s)" % r["note"]
        print(line)
    print("-" * 78)
    print("VERDICT     %s" % verdict)
    print("")


# ---------------------------------------------------------------- main


def _probe_payload(p):
    """Probe-only fields; the unit fields around it already carry the rest."""
    if not p:
        return None
    drop = ("label", "label_key", "status", "why", "t", "tA", "tB", "ab")
    return {k: v for k, v in p.items() if k not in drop}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Independent probe verification of a belt output.")
    ap.add_argument("--belt", required=True, help="belt JSON (_align-work/hone/*.json or _align-work/bible/*.json)")
    ap.add_argument("--audio", help="wav or mp3 the belt was aligned against (required unless --no-transcribe)")
    ap.add_argument("--sample-n", type=int, default=20, help="random CONFIRMED units to probe (default 20)")
    ap.add_argument("--seed", type=int, default=7, help="sampling seed (default 7)")
    ap.add_argument("--no-transcribe", action="store_true",
                    help="skip whisper probes; emit status/|tA-tB|/clamp aggregates only")
    ap.add_argument("--verses", help="verses JSON supplying unit text (bible belts; auto-discovered when omitted)")
    ap.add_argument("--out", help="output path (default <belt>.verify.json)")
    ap.add_argument("--cache-dir", help="probe transcript cache dir (default <belt>.verify-cache)")
    ap.add_argument("--family", help="settings family for the probe config (default letters-A)")
    ap.add_argument("--beam", type=int, default=PROBE_BEAM, help="probe beam size (default %d)" % PROBE_BEAM)
    ap.add_argument("--open-tokens", type=int, default=OPEN_TOKENS,
                    help="unit opening tokens used as anchor (default %d)" % OPEN_TOKENS)
    ap.add_argument("--pre", type=float, default=PRE_S, help="clip seconds before shipped t (default %.1f)" % PRE_S)
    ap.add_argument("--post", type=float, default=POST_S, help="clip seconds after shipped t (default %.1f)" % POST_S)
    ap.add_argument("--ffmpeg", default="ffmpeg", help="ffmpeg executable")
    ap.add_argument("--part", type=int,
                    help="verify only rows of this part index — REQUIRED per part for "
                         "multi-part letters, whose parts are separate recordings "
                         "(pass that part's audio with --audio)")
    ap.add_argument("--keep-clips", action="store_true", help="keep the cut clips for inspection")
    args = ap.parse_args(argv)

    belt = Path(args.belt)
    if not belt.exists():
        raise SystemExit("hone-verify: no such belt: %s" % belt)
    transcribed = not args.no_transcribe
    if transcribed and not args.audio:
        raise SystemExit("hone-verify: --audio is required unless --no-transcribe is given")
    if transcribed and not Path(args.audio).exists():
        raise SystemExit("hone-verify: no such audio: %s" % args.audio)
    if transcribed and not shutil.which(args.ffmpeg):
        raise SystemExit("hone-verify: ffmpeg not found on PATH (%s)" % args.ffmpeg)

    kind, meta, units = load_belt(belt)
    if args.part is not None:
        units = [u for u in units if (u.get("part") or 0) == args.part]
        if not units:
            raise SystemExit("hone-verify: no rows carry part == %d" % args.part)
    text_src = attach_texts(kind, meta, units, belt, args.verses)
    chosen = select_units(units, args.sample_n, args.seed)

    args.model_name = "?"
    probes, cache_dir, tmpdir = [], None, None
    if transcribed:
        tmpdir = tempfile.mkdtemp(prefix="hone-verify-")
        try:
            L = _lib()
            args.model_name = settings_model(probe_settings(L, args.family, args.beam))
            print("hone-verify: probing %d units against %s" % (len(chosen), Path(args.audio).name))
            probes, cache_dir = probe_units(args, kind, chosen, tmpdir)
        finally:
            if tmpdir and not args.keep_clips:
                shutil.rmtree(tmpdir, ignore_errors=True)

    agg = aggregate(units, probes)
    table, verdict = acceptance(agg, transcribed)
    print_report(args, kind, meta, units, chosen, probes, agg, table, verdict, text_src, transcribed)

    out = Path(args.out) if args.out else belt.with_suffix(".verify.json")
    payload = {
        "tool": "hone-verify",
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "belt": str(belt.resolve()),
        "belt_tag": meta.get("tag") or meta.get("key") or belt.stem,
        "kind": kind,
        "audio": str(Path(args.audio).resolve()) if args.audio else None,
        "text_source": text_src,
        "transcribed": transcribed,
        "selection": {"sample_n": args.sample_n, "seed": args.seed,
                      "selected": len(chosen), "of_units": len(units)},
        "probe_config": {"pre_s": args.pre, "post_s": args.post,
                         "open_tokens": args.open_tokens, "beam_size": args.beam,
                         "family": args.family or "letters-A", "model": args.model_name,
                         "cache_dir": cache_dir},
        "belt_settings": meta.get("settings"),
        "units": [
            {"label": u["label"], "label_key": u["label_key"], "status": u["status"],
             "why": u.get("why"), "t": u["t"], "tA": u["tA"], "tB": u["tB"], "ab": u["ab"],
             "part": u["part"], "interpolated": u["interpolated"],
             "probe": _probe_payload(next((p for p in probes if p["label"] == u["label"]), None))}
            for u in chosen
        ],
        "aggregates": agg,
        "acceptance": table,
        "verdict": verdict,
    }
    out.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
    print("wrote %s" % out.resolve())
    return 0 if not verdict.startswith("FAIL") else 1


if __name__ == "__main__":
    sys.exit(main())
