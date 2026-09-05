"""align-supervisor — run an alignment under a hard RSS ceiling.

WHY THIS EXISTS (2026-09-04). `batch-align.py` held 2.3-3.0 GB steady across
fifteen letters and then grew to **13.4 GB inside one letter**
(`two:judgment-of-god`) — not a slow leak, a single pathological unit. This
machine is shared: at the same minute, a sibling agent's task was killed for low
memory with two full test suites gating. So the growth is not a private problem
of this lane, and "one letter is never worth starving the machine" is the rule.

Notification is not protection, so this ACTS. It samples the child's resident
set; over the ceiling it kills the child, records the unit that was in flight,
and relaunches. Both aligners are resumable — a unit whose belt already carries
the current settings hash is skipped — so a relaunch re-does nothing that
finished, and the only work lost is the offending unit, which is the trade we
want. A killed unit goes straight onto a skip list (ALIGN_SKIP_UNITS, honoured
by the child) so the relaunch cannot walk back into it and spin.

Skipping is only cheap because the shipper carries an unrun unit forward: a
letter that already ships timings keeps them (batch-align.py's ship(), proven by
test_batch_align_ship.py), so the ceiling costs coverage on nothing but a letter
that had none. Before that fix, one kill DELETED the letter's shipped timings.

  py -3.13 tools/align-supervisor.py --ceiling-gb 6 \
      --unit-re "^([a-z0-9]+:[a-z0-9-]+): [0-9]+ fragments" \
      --log tools/_align-work/reports/letters-pass2.log \
      --record D:/AgentMemory/.../gap-list-rss.json \
      -- <interpreter> -u tools/batch-align.py --volkeys flock

Every killed unit lands in --record with its RSS, so the morning has a list
rather than a mystery.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time

try:
    import ctypes
    from ctypes import wintypes
except ImportError:                                   # pragma: no cover
    ctypes = None


def rss_gb(pid):
    """Resident set of ONE pid, in GB. Windows-native so it needs no psutil
    (the aligners deliberately depend on nothing that is not already pinned)."""
    if ctypes is None:
        return 0.0
    PROCESS_QUERY_LIMITED = 0x1000

    class PMC(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                    ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t)]

    h = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED, False, pid)
    if not h:
        return 0.0
    try:
        c = PMC()
        c.cb = ctypes.sizeof(PMC)
        if not ctypes.windll.psapi.GetProcessMemoryInfo(h, ctypes.byref(c), c.cb):
            return 0.0
        return c.WorkingSetSize / (1024 ** 3)
    finally:
        ctypes.windll.kernel32.CloseHandle(h)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ceiling-gb", type=float, default=6.0)
    ap.add_argument("--unit-re", required=True, help="regex whose group 1 names the unit now in flight")
    ap.add_argument("--log", required=True, help="the child's stdout is tee'd here")
    ap.add_argument("--record", default="", help="JSON file listing every unit killed for memory")
    ap.add_argument("--sample-s", type=float, default=5.0)
    ap.add_argument("--max-restarts", type=int, default=12)
    ap.add_argument("cmd", nargs=argparse.REMAINDER)
    a = ap.parse_args()
    cmd = a.cmd[1:] if a.cmd and a.cmd[0] == "--" else a.cmd
    if not cmd:
        ap.error("give the command after --")

    unit_re = re.compile(a.unit_re)
    killed = []            # [{unit, rssGb, when}]
    banned = set()         # units killed twice — the loop must not spin
    restarts = 0

    while True:
        env = dict(os.environ)
        if banned:
            env["ALIGN_SKIP_UNITS"] = ",".join(sorted(banned))
        with open(a.log, "a", encoding="utf-8") as log:
            log.write(f"\n===== supervisor start (ceiling {a.ceiling_gb} GB"
                      f"{', skipping ' + ','.join(sorted(banned)) if banned else ''}) =====\n")
            log.flush()
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                 env=env, bufsize=1, text=True, encoding="utf-8", errors="replace")
            unit = "?"
            last_sample = 0.0
            over = None
            for line in p.stdout:
                log.write(line)
                log.flush()
                m = unit_re.search(line)
                if m:
                    unit = m.group(1)
                now = time.time()
                if now - last_sample >= a.sample_s:
                    last_sample = now
                    g = rss_gb(p.pid)
                    if g > a.ceiling_gb:
                        over = (unit, g)
                        log.write(f"  SUPERVISOR: rss {g:.2f} GB > {a.ceiling_gb} GB on {unit} "
                                  f"— killing this run and moving on\n")
                        log.flush()
                        p.kill()
                        break
            code = p.wait()

        if over:
            u, g = over
            killed.append({"unit": u, "rssGb": round(g, 2), "when": time.strftime("%Y-%m-%d %H:%M:%S")})
            if u in banned:
                print(f"supervisor: {u} exceeded the ceiling twice — giving up on it", flush=True)
            banned.add(u)
            if a.record:
                with open(a.record, "w", encoding="utf-8") as f:
                    json.dump(killed, f, indent=1)
            restarts += 1
            if restarts > a.max_restarts:
                print(f"supervisor: {restarts} restarts, stopping", flush=True)
                return 2
            print(f"supervisor: killed {u} at {g:.2f} GB; relaunching (resume skips what banked)", flush=True)
            continue

        print(f"supervisor: child exited {code} after {restarts} restart(s); "
              f"{len(killed)} unit(s) killed for memory", flush=True)
        return code


if __name__ == "__main__":
    sys.exit(main())
