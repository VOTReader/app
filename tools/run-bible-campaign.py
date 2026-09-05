"""run-bible-campaign — drive a whole-edition Bible alignment, banked per book.

  py -3.13 tools/run-bible-campaign.py [--edition brm-kjv] [--chunks 1,2] [--dry]

Runs batch-align-bible.py --no-ship over five book chunks in canonical order,
ONE PROCESS PER CHUNK (so a 1,189-chapter night starts with fresh memory five
times instead of once), appending everything to a single log under
tools/_align-work/reports. Belts bank per chapter and the runner skips current
ones, so re-running this after any interruption resumes where it stopped.

It never ships. The ship is a separate, gated step (see the 2026-09-01 runbook
under D:\\AgentMemory\\Workforce\\sessions): gates, the Verifier's proof, then
`batch-align-bible.py --edition brm-kjv --all` once, which skips every current
belt and writes the data file, then ONE corpus bump.

Markers in tools/_align-work/bible/<edition>/: CAMPAIGN-RUNNING.json while a
chunk runs, CAMPAIGN-DONE.json or CAMPAIGN-FAILED.json at the end.
"""
import argparse
import json
import os
import subprocess
import sys
import time

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
WORK = os.path.join(BASE, "_align-work")
PY = r"C:\Users\corbi\AppData\Local\Programs\Python\Python313\python.exe"

# Canonical order, app book ids (the audio index's keys).
CHUNKS = [
    ["genesis", "exodus", "leviticus", "numbers", "deuteronomy"],
    ["joshua", "judges", "ruth", "1samuel", "2samuel", "1kings", "2kings",
     "1chronicles", "2chronicles", "ezra", "nehemiah", "esther"],
    ["job", "psalms", "proverbs", "ecclesiastes", "songofsolomon"],
    ["isaiah", "jeremiah", "lamentations", "ezekiel", "daniel", "hosea", "joel", "amos",
     "obadiah", "jonah", "micah", "nahum", "habakkuk", "zephaniah", "haggai",
     "zechariah", "malachi"],
    ["matthew", "mark", "luke", "john", "acts", "romans", "1corinthians", "2corinthians",
     "galatians", "ephesians", "philippians", "colossians", "1thessalonians",
     "2thessalonians", "1timothy", "2timothy", "titus", "philemon", "hebrews", "james",
     "1peter", "2peter", "1john", "2john", "3john", "jude", "revelation"],
]


def marker(belts, name, payload):
    for old in ("CAMPAIGN-RUNNING.json", "CAMPAIGN-DONE.json", "CAMPAIGN-FAILED.json"):
        p = os.path.join(belts, old)
        if os.path.exists(p) and old != name:
            os.remove(p)
    json.dump(payload, open(os.path.join(belts, name), "w", encoding="utf-8"), indent=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--edition", default="brm-kjv")
    ap.add_argument("--chunks", help="comma list of chunk numbers (1-based); default all")
    ap.add_argument("--dry", action="store_true", help="print the commands and exit")
    # The ceiling wraps each CHUNK's aligner, never this runner. Wrapping the
    # runner would sample the wrong process: the supervisor reads the resident
    # set of its direct child, and this runner's direct child is a chunk that
    # spawns the aligner -- it would have watched a few megabytes of bookkeeping
    # all night and never seen the process actually growing. Per chunk the
    # aligner IS the direct child, and a kill relaunches only that chunk, which
    # resumes by belt.
    ap.add_argument("--supervise-gb", type=float, default=0.0,
                    help="run each chunk under tools/align-supervisor.py with this RSS ceiling")
    a = ap.parse_args()
    belts = os.path.join(WORK, "bible", a.edition)
    reports = os.path.join(WORK, "reports")
    os.makedirs(belts, exist_ok=True)
    os.makedirs(reports, exist_ok=True)
    want = [int(x) for x in a.chunks.split(",")] if a.chunks else list(range(1, len(CHUNKS) + 1))
    stamp = time.strftime("%Y-%m-%d-%H%M")
    log_path = os.path.join(reports, f"run-bible-{a.edition}-{stamp}.log")
    env = dict(os.environ, PYTHONPATH="", PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
    results = []
    t_all = time.time()
    print(f"campaign {a.edition}: chunks {want}  log {log_path}", flush=True)
    with open(log_path, "a", encoding="utf-8") as log:
        for i in want:
            books = CHUNKS[i - 1]
            cmd = [PY, os.path.join(BASE, "batch-align-bible.py"), "--edition", a.edition,
                   "--books", ",".join(books), "--no-ship"]
            if a.supervise_gb > 0:
                cmd = [PY, "-u", os.path.join(BASE, "align-supervisor.py"),
                       "--ceiling-gb", str(a.supervise_gb),
                       "--unit-re", r"\[[0-9]+/[0-9]+\] ([a-z0-9]+_[0-9]{3})  start",
                       "--log", log_path,
                       "--record", os.path.join(belts, "rss-killed-chapters.json"),
                       "--"] + cmd
            if a.dry:
                print("  " + " ".join(cmd))
                continue
            t0 = time.time()
            marker(belts, "CAMPAIGN-RUNNING.json",
                   {"edition": a.edition, "chunk": i, "books": books, "pid": os.getpid(),
                    "started": time.strftime("%Y-%m-%d %H:%M:%S"), "log": log_path,
                    "chunks_done": results})
            log.write(f"\n===== chunk {i}/{len(CHUNKS)} {books} started {time.strftime('%Y-%m-%d %H:%M:%S')} =====\n")
            log.flush()
            r = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, env=env, cwd=ROOT)
            dt = (time.time() - t0) / 60
            log.write(f"===== chunk {i} exit {r.returncode} after {dt:.1f} min =====\n")
            log.flush()
            results.append({"chunk": i, "exit": r.returncode, "minutes": round(dt, 1)})
            print(f"  chunk {i} exit {r.returncode} after {dt:.1f} min", flush=True)
            if r.returncode not in (0, 1):
                # 0 = clean, 1 = some chapters failed (listed in the log, re-run
                # resumes them). Anything else is a crash or the VRAM preflight.
                marker(belts, "CAMPAIGN-FAILED.json",
                       {"edition": a.edition, "chunk": i, "exit": r.returncode, "log": log_path,
                        "chunks": results, "ended": time.strftime("%Y-%m-%d %H:%M:%S")})
                print(f"campaign STOPPED at chunk {i} (exit {r.returncode}); see {log_path}", flush=True)
                return 2
    if a.dry:
        return 0
    total = (time.time() - t_all) / 3600
    failed_chapters = any(r["exit"] == 1 for r in results)
    marker(belts, "CAMPAIGN-DONE.json",
           {"edition": a.edition, "chunks": results, "hours": round(total, 2), "log": log_path,
            "chapters_failed_somewhere": failed_chapters, "ended": time.strftime("%Y-%m-%d %H:%M:%S")})
    print(f"campaign DONE in {total:.2f} h; chapters failed somewhere: {failed_chapters}; log {log_path}", flush=True)
    return 1 if failed_chapters else 0


if __name__ == "__main__":
    sys.exit(main())
