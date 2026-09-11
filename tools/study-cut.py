"""study-cut — cut points for a study recording that spans MANY chapters, then the cut.

  python tools/study-cut.py points lamb-of-god     # GPU: ONE belt over the whole recording
  python tools/study-cut.py cut lamb-of-god        # ffmpeg -c copy into the mirror staging dir

`points` is the only accepted source of a cut (tools/study-cut-plan.json's own
note, the Architect 2026-09-05): never listening, never estimation. It runs
hone-align's dual-leg belt (MMS forced alignment + whisper large-v3 global
match, star tokens at every block AND chapter boundary so unread headings and
pauses are absorbed) over the concatenated clause fragments of every chapter in
the plan, against the source recording as one track. The belt is written beside
the letters' belts under a `cut:<study>` key that no manifest row ever names.

A chapter's startSec is then a point inside the LONGEST silence between the end
of the previous chapter's speech and this chapter's first fragment onset --
`LEAD_S` before the silence ends, so the asset opens on a short breath and any
decoder wobble at the frame cut lands in silence. The window is bounded by two
things the belt measures reliably: the MMS onset of the next chapter's first
anchored fragment, and the end of the last whisper word matching the previous
chapter's last anchored fragment (its `tEnd` is NOT usable here: at a chapter
boundary MMS runs it over the next chapter's spoken title, 12 of 13 times in
the Lamb of God belt). Inside that window the reader speaks the previous
chapter's tail (its "From The Volumes of Truth ... - Volume N" line, often with
the quoted title skipped, so the belt scores it low), the pause, then the next
chapter's title and heading (unpaintable, never fragments) -- and the chapter
pause is the longest silence in the window: 2.1-2.4 s in 11 of 13 Lamb of God
boundaries against title/heading pauses of at most 1.9 s. The two where it is
not the FIRST silence (1.3 and 1.6 s before a spoken attribution line, then
1.9 and 2.4 s after it) are why "longest" and not "first". The first read
chapter starts at 0.0 (so a spoken study title lands in it); a chapter the
belt finds unread -- fewer than half its fragments cleared the hit threshold --
keeps startSec null and is added to `omitted` with the counts that say why, so
the generator offers nothing for it. A current belt is reused (settings +
fragments hash, as batch-align does); `--force` re-runs the card. Every number
written carries its evidence (speech end, next onset, the silence chosen and
the runner-up, the words spoken on either side of the cut) in the plan beside
it, and the console prints the words on both sides so a reader can see
"...volume 2 | saturday evening at sundown..." without opening anything.

`cut` writes <sourceId>_ch<NN>.mp3 for every chapter with a numeric startSec —
`-c copy`, audio stream only (the cover art is not fifteen copies of itself),
each chapter to the next chapter's start, the last to the end of the file — into
tools/_audio-mirror-staging/, where mirror-audio-release.py picks them up once
the manifest names them. It prints every name and size before and after and
writes {bytes, durationSec} per chapter into the plan.
"""
import importlib.util
import json
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
PLAN = os.path.join(BASE, "study-cut-plan.json")
STAGING = os.path.join(BASE, "_audio-mirror-staging")
WORK = os.path.join(BASE, "_align-work")
LEAD_S = 0.8             # the cut sits this far before the chosen silence ends (or at its midpoint if shorter)
MIN_SILENCE_S = 0.5      # a silence shorter than this is a comma, not a chapter pause
MARGIN_S = 0.35          # fallback only, when the window holds no silence at all: after the speech end
MIN_LEAD_S = 0.20        # fallback only: never cut closer than this to the next chapter's first onset
ANCHORED = ("CONFIRMED", "PROBED_A", "PROBED_B")   # both legs agree, or a probe did; REVIEW onsets are not trusted
NUMBER_WORDS = {"one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7",
                "eight": "8", "nine": "9", "ten": "10", "eleven": "11", "twelve": "12"}   # whisper writes "Volume Two" as "volume 2"

sys.path.insert(0, BASE)
import _alignlib as al                                              # noqa: E402

_spec = importlib.util.spec_from_file_location("hone_align", os.path.join(BASE, "hone-align.py"))
ha = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ha)


def _nt(w):
    w = al.norm_token(w)
    return NUMBER_WORDS.get(w, w)


def speech_end(row, words, limit):
    """(end, hit, tokens): the end of the last whisper word matching the row's
    tokens in order, scanning from its MMS onset, never past `limit` and never
    jumping more than 2.5 s from the previous match (so a skipped quoted title
    cannot pull the match into the next chapter's heading). A row that matches
    nothing ends at its onset -- this is only a LOWER bound for the cut."""
    toks = [NUMBER_WORDS.get(t, t) for t in al.spoken_words(row["text"])]
    i = 0
    while i < len(words) and words[i][1] < row["t"] - 0.3:
        i += 1
    end, hit, cursor = row["t"], 0, row["t"]
    for tok in toks:
        j = i
        while j < len(words) and words[j][1] < limit and words[j][1] <= cursor + 2.5:
            if al.tok_match(tok, _nt(words[j][0])):
                end, hit, cursor, i = words[j][2], hit + 1, words[j][2], j + 1
                break
            j += 1
    return end, hit, len(toks)


STOP = {"the", "and", "with", "from", "into", "that", "this", "who", "his", "her", "for", "of", "in",
        "on", "at", "by", "to", "is", "are", "was", "were", "be", "as", "an", "a", "or", "not", "he", "she"}


def front_matter_tokens(study, chapter_id):
    """Content tokens (4+ letters, no stopwords, no digits) of everything the reader
    may speak between two chapters that is never a fragment: the study's title and
    subtitle, the chapter's title and subtitle, and its heading blocks. The second
    reader of a boundary: the cut must fall before the first of these is spoken."""
    text = open(os.path.join(BASE, "..", "app", "src", "main", "assets", "src", "data", "bible-studies.js"),
                encoding="utf-8").read()
    m = re.search(r"^var BIBLE_STUDIES = (\[.*?\n\]);", text, re.S | re.M)
    for st in json.loads(m.group(1)):
        if st["id"] != study:
            continue
        pieces = [st.get("title", ""), st.get("subtitle", "")]
        for ch in st["chapters"]:
            if ch["id"] == chapter_id:
                pieces += [ch.get("title", ""), ch.get("subtitle", "")]
                pieces += [b.get("text", "") for b in ch.get("blocks", []) if b.get("type") == "heading"]
        toks = set()
        for p in pieces:
            toks.update(t for t in al.spoken_words(p) if len(t) >= 4 and t not in STOP and not al.is_digit_token(t))
        return toks
    raise SystemExit(f"study {study!r} is not in bible-studies.js")


def load_plan():
    return json.load(open(PLAN, encoding="utf-8"))


def save_plan(plan):
    with open(PLAN, "w", encoding="utf-8", newline="\n") as f:
        json.dump(plan, f, indent=1, ensure_ascii=False)
        f.write("\n")


def concatenated_fragments(study, plan):
    """The plan's chapters' clause fragments in reading order, `bi` remapped to
    chapter*1000+bi so every chapter boundary is also a block boundary (a star)
    and the mapping back is arithmetic. Extra keys ride through run_belt."""
    frags_all = json.load(open(os.path.join(WORK, "fragments-all.json"), encoding="utf-8"))
    out = []
    for ci, ch in enumerate(plan["chapters"]):
        key = "study:" + ch["id"]
        if key not in frags_all:
            raise SystemExit(f"no fragments for {key} — run node tools/extract-audio-fragments.mjs first")
        for f in frags_all[key]["fragments"]:
            g = dict(f)
            g["chapter"] = ci
            g["bi"] = ci * 1000 + f["bi"]
            out.append(g)
    return out


def points(study):
    plan_all = load_plan()
    plan = plan_all[study]
    frags = concatenated_fragments(study, plan)
    key = "cut:" + study
    ha._FRAGS_ALL[key] = {"format": "A", "fragments": frags}
    src = plan["sourceId"]
    ha.resolve_tracks = lambda k, asset=None: ([(src, None)], "primary/" + plan.get("reader", "V"))
    s = al.settings_for("letters-A", star_between_blocks=True)
    belt_path = os.path.join(ha.HONE, key.replace(":", "__") + f".{s['whisper_model']}.json")
    want = (al.settings_hash(s), ha.fragments_hash(frags))
    d = None
    if os.path.exists(belt_path) and "--force" not in sys.argv:
        prev = json.load(open(belt_path, encoding="utf-8"))
        if (prev.get("settings_hash"), prev.get("fragmentsHash")) == want:
            d = prev
            print(f"belt current ({want[0]}, fragments {want[1]}): deriving from {belt_path} -- no card time")
    if d is None:
        d = ha.run_belt(key, s)          # the GPU step; the belt lands at belt_path
    wav = ha.ensure_wav(src)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-of", "csv=p=0", wav], capture_output=True, text=True).stdout.strip())
    silences = al.silence_intervals(wav)
    words = json.load(open(ha.tx_cache(src, s), encoding="utf-8"))["words"]   # the belt's own whisper leg, cached

    rows = d["results"]
    by_ch = {}
    for r in rows:
        ci = frags[r["fi"]]["chapter"]
        by_ch.setdefault(ci, []).append(r)
    # A fragment counts as READ when the belt placed it AND it cleared the hit
    # threshold; a chapter is read when at least half its fragments are. The
    # Lamb of God Preface placed 2 of 9 -- its title line (genuinely spoken, it
    # is the study's title) and a 6/29-token echo of that title inside its first
    # sentence -- and the other seven were UNSPOKEN: the reader speaks the title,
    # then chapter 1. Counting "placed" would have cut a 19-second Preface asset.
    def cleared(r):
        return (r.get("t") is not None and r["status"] != "UNSPOKEN"
                and r["tokens"] and r["hit"] / r["tokens"] >= s["min_frag_hit"])

    def anchored(r):
        return r.get("t") is not None and r["status"] in ANCHORED
    placed = {ci: [r for r in rs if cleared(r)] for ci, rs in by_ch.items()}
    omitted = set(plan.get("omitted", []))
    notes = dict(plan.get("omittedNotes", {}))
    prev = None          # (chapter index, its last anchored row) of the previous READ chapter
    disagree = []
    print(f"\n{'chapter':18} {'cleared':>9}  {'first_t':>8} {'spch_end':>8}  startSec  silence            rule")
    for ci, ch in enumerate(plan["chapters"]):
        rs = placed.get(ci, [])
        total = len(by_ch.get(ci, []))
        ev = {"cleared": len(rs), "fragments": total}
        if len(rs) < 0.5 * total:
            ch["startSec"] = None
            ch.pop("cut", None)
            ev["unspoken"] = sum(1 for r in by_ch.get(ci, []) if r["status"] == "UNSPOKEN")
            ch["evidence"] = ev
            omitted.add(ch["id"])
            notes[ch["id"]] = (f"not read: the belt cleared {len(rs)} of {total} fragments "
                               f"({ev['unspoken']} UNSPOKEN); a read chapter clears at least half")
            print(f"{ch['id']:18} {len(rs):4}/{total:<4}  {'-':>8} {'-':>8}  {'null':>8}  UNREAD ({ev['unspoken']} UNSPOKEN) -> omitted")
            continue
        anchors = [r for r in by_ch[ci] if anchored(r)]
        first_t = min(r["t"] for r in anchors)
        ev["firstOnset"] = round(first_t, 2)
        sil_txt = ""
        if prev is None:
            start, rule = 0.0, "first read chapter: file start"
            end = None
        else:
            last = prev[1]
            end, hit, n = speech_end(last, words, first_t)
            cands = [(a, b) for a, b in silences if a >= end - 0.15 and b <= first_t + 0.01 and b - a >= MIN_SILENCE_S]
            ev.update({"prevSpeechEnd": round(end, 2), "prevSpeechEndVia": f"fi{last['fi']} {hit}/{n} {last['text'][:40]}",
                       "window": round(first_t - end, 2)})
            # Second reader, independent of silence length: the first front-matter
            # word (title/subtitle/heading of THIS chapter) spoken after the previous
            # chapter's speech end; the cut must fall in a silence that ends before
            # that word is finished. Whisper's ONSET for a word after a pause is
            # sloppy -- it swallows the pause ("yahushua@181.64-184.88" over a
            # 181.92-184.35 silence) -- so the test is against the word's END, which
            # a silence lying inside the swallowed pause still satisfies.
            fm = front_matter_tokens(study, ch["id"])
            fm_first = next(((s0, e0) for w, s0, e0 in words if end <= s0 < first_t and _nt(w) in fm), None)
            if cands:
                a, b = max(cands, key=lambda ab: (ab[1] - ab[0], -ab[0]))
                start = b - min(LEAD_S, (b - a) / 2)
                others = sorted((y - x for x, y in cands if (x, y) != (a, b)), reverse=True)
                rule = f"longest of {len(cands)} silences in the window"
                sil_txt = f"[{a:.2f}-{b:.2f} {b - a:.2f}s]"
                ev.update({"silence": [round(a, 2), round(b, 2)], "silenceSec": round(b - a, 2),
                           "runnerUpSec": round(others[0], 2) if others else None})
                # the latest silence that ends before the first front-matter word does
                fm_pick = max((ab for ab in cands if fm_first is None or ab[1] <= fm_first[1] + 0.05), default=None)
                agrees = fm_pick == (a, b)
            else:
                start = max(end, min(end + MARGIN_S, first_t - MIN_LEAD_S))
                rule = f"NO silence >= {MIN_SILENCE_S}s in the window: speech end + margin, clamped before the first onset"
                ev.update({"silence": None})
                agrees = fm_first is None or start < fm_first[1]
            ev.update({"frontMatterFirst": [round(fm_first[0], 2), round(fm_first[1], 2)] if fm_first else None,
                       "frontMatterAgrees": agrees})
            if fm_first is None:
                rule += " (no front-matter word heard: second reader silent)"
            if not agrees:
                rule = "DISAGREE (longest silence vs first front-matter word) " + rule
                disagree.append(ch["id"])
            before = [w for w, _, e in words if end - 4 < e <= start]
            after = [w for w, s0, _ in words if start <= s0 < first_t + 0.5]
            ev.update({"wordsBefore": " ".join(before[-8:]), "wordsAfter": " ".join(after[:8])})
            rule += f"   ...{' '.join(before[-5:])} | {' '.join(after[:6])}..."
        ch["startSec"] = round(start, 2)
        ev["rule"] = rule
        ch["evidence"] = ev
        omitted.discard(ch["id"])
        notes.pop(ch["id"], None)
        print(f"{ch['id']:18} {len(rs):4}/{total:<4}  {first_t:8.2f} {(end if end is not None else 0):8.2f}  {start:8.2f}  {sil_txt:18} {rule}")
        prev = (ci, anchors[-1])
    plan["omitted"] = sorted(omitted)
    if notes:
        plan["omittedNotes"] = notes
    tail_end = speech_end(prev[1], words, dur)[0] if prev else None
    if prev:
        # The last read chapter runs to EOF: say what the tail holds, so the reader
        # can decide whether it is an outro worth keeping (sound spans between the
        # silences after the last word; whisper heard no words there by definition).
        after = [(a, b) for a, b in silences if b > tail_end]
        edges = [tail_end] + [x for ab in after for x in ab] + [dur]
        sound = [[round(edges[i], 2), round(edges[i + 1], 2)] for i in range(0, len(edges) - 1, 2)
                 if edges[i + 1] - edges[i] >= 0.5]
        plan["chapters"][prev[0]]["evidence"]["tail"] = {
            "lastSpeechEnd": round(tail_end, 2), "eof": round(dur, 2), "soundAfterSpeech": sound,
            "kept": "to EOF; see tailNote"}
    plan["pointsEvidence"] = {
        "belt": os.path.relpath(os.path.join(ha.HONE, key.replace(":", "__") + f".{s['whisper_model']}.json"), BASE).replace("\\", "/"),
        "settingsHash": al.settings_hash(s), "starBetweenBlocks": True,
        "coverage": d["coverage"], "confirmed": d["confirmed"], "probed": d["probed"], "review": d["review"],
        "fragments": d["fragments"], "shipped": d["shipped"], "sourceDurationSec": round(dur, 2),
        "lastSpeechEnd": round(tail_end, 2) if tail_end is not None else None,
        "leadS": LEAD_S, "minSilenceS": MIN_SILENCE_S,
        "rule": (f"each cut sits {LEAD_S} s before the end of the longest silence (>= {MIN_SILENCE_S} s) between the "
                 "previous chapter's last spoken word and this chapter's first fragment onset, so every asset opens on "
                 f"a {LEAD_S} s breath before its spoken title; a second reader (the latest silence ending before the "
                 "chapter's first spoken title/heading word) must name the same silence or `cut` refuses"),
    }
    save_plan(plan_all)
    print(f"\nsource {src}: {dur:.1f}s; belt coverage {d['coverage']} C{d['confirmed']} P{d['probed']} R{d['review']} "
          f"shipped {d['shipped']}/{d['fragments']}; last speech end {tail_end}")
    print(f"wrote {PLAN}")
    if disagree:
        print(f"DISAGREE on {len(disagree)} boundaries ({', '.join(disagree)}): the two readers name different "
              f"silences; read the words on both sides above. `cut` refuses until this is resolved.")
        return 2
    return 0


def cut(study):
    plan_all = load_plan()
    plan = plan_all[study]
    src_mp3 = os.path.join(WORK, "audio", plan["sourceId"] + ".mp3")
    if not os.path.exists(src_mp3):
        ha.ensure_wav(plan["sourceId"])   # downloads the mp3 from the release mirror
    os.makedirs(STAGING, exist_ok=True)
    chapters = [(i, ch) for i, ch in enumerate(plan["chapters"]) if isinstance(ch.get("startSec"), (int, float))]
    if not chapters:
        raise SystemExit("no chapter has a startSec — run `points` first")
    bad = [ch["id"] for _, ch in chapters if ch.get("evidence", {}).get("frontMatterAgrees") is False]
    if bad:
        raise SystemExit(f"refusing to cut: `points` left {len(bad)} boundaries where its two readers disagree "
                         f"({', '.join(bad)}); resolve them in the plan's evidence first")
    names = [f"{plan['sourceId']}_ch{i:02d}.mp3" for i, _ in chapters]
    print("BEFORE:")
    for n in names:
        p = os.path.join(STAGING, n)
        print(f"  {n}  {os.path.getsize(p) if os.path.exists(p) else 'absent'}")
    for idx, (i, ch) in enumerate(chapters):
        start = ch["startSec"]
        end = chapters[idx + 1][1]["startSec"] if idx + 1 < len(chapters) else None
        out = os.path.join(STAGING, names[idx])
        cmd = ["ffmpeg", "-y", "-v", "error", "-i", src_mp3, "-ss", f"{start:.2f}"]
        if end is not None:
            cmd += ["-to", f"{end:.2f}"]
        cmd += ["-map", "0:a", "-c:a", "copy", "-avoid_negative_ts", "make_zero", out]
        subprocess.run(cmd, check=True)
        d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
                                 capture_output=True, text=True).stdout.strip())
        ch["cut"] = {"asset": names[idx][:-4], "bytes": os.path.getsize(out), "durationSec": round(d, 2),
                     "endSec": end}
    save_plan(plan_all)
    print("AFTER:")
    total_b = total_d = 0
    for idx, (i, ch) in enumerate(chapters):
        c = ch["cut"]
        total_b += c["bytes"]
        total_d += c["durationSec"]
        print(f"  {names[idx]}  {c['bytes']}  {c['durationSec']}s")
    print(f"  {len(chapters)} files, {total_b} bytes, {total_d:.1f}s of audio")
    print(f"wrote {PLAN}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("points", "cut"):
        sys.exit(__doc__)
    sys.exit(points(sys.argv[2]) if sys.argv[1] == "points" else cut(sys.argv[2]))
