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
import threading
import time

try:
    import ctypes
    from ctypes import wintypes
except ImportError:                                   # pragma: no cover
    ctypes = None


def _children_of(pid, snapshot):
    """Every descendant pid of `pid`, from a pid -> [child pids] map."""
    out, stack = [], [pid]
    while stack:
        for c in snapshot.get(stack.pop(), ()):
            out.append(c)
            stack.append(c)
    return out


def _pid_tree():
    """pid -> [child pids] for the whole system, via CreateToolhelp32Snapshot.
    stdlib ctypes only: the aligners depend on nothing that is not already
    pinned, and psutil is not."""
    if ctypes is None:
        return {}
    TH32CS_SNAPPROCESS = 0x2

    class ENTRY(ctypes.Structure):
        _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD),
                    ("th32ProcessID", wintypes.DWORD),
                    ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
                    ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
                    ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", ctypes.c_long),
                    ("dwFlags", wintypes.DWORD), ("szExeFile", ctypes.c_char * 260)]

    k = ctypes.windll.kernel32
    k.CreateToolhelp32Snapshot.restype = ctypes.c_void_p
    snap = k.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if not snap or snap == ctypes.c_void_p(-1).value:
        return {}
    try:
        e = ENTRY()
        e.dwSize = ctypes.sizeof(ENTRY)
        tree = {}
        ok = k.Process32First(ctypes.c_void_p(snap), ctypes.byref(e))
        while ok:
            tree.setdefault(e.th32ParentProcessID, []).append(e.th32ProcessID)
            ok = k.Process32Next(ctypes.c_void_p(snap), ctypes.byref(e))
        return tree
    finally:
        k.CloseHandle(ctypes.c_void_p(snap))


def tree_rss_gb(pid):
    """Resident set of `pid` AND every descendant, in GB.

    The direct child is not reliably the process that grows. Two ways it is
    not, both hit for real: `py -3.13` is a LAUNCHER that spawns the real
    python.exe one level down, so a ceiling watching it samples 20 MB of
    bookkeeping forever; and run-bible-campaign.py spawns one aligner per book
    chunk, so the same ceiling would have watched the runner all night. A
    supervisor whose correctness depends on how its command line happened to be
    written is not a supervisor -- so it sums the tree and the invocation stops
    mattering."""
    tree = _pid_tree()
    return sum(rss_gb(p) for p in [pid] + _children_of(pid, tree))


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


def kill_tree(p):
    """Kill the child AND its descendants. Killing only the direct child is how
    an orphan survives its parent and keeps running unwatched -- 2026-09-04, two
    aligners ran the same 109 letters for seven minutes because a launcher
    believed dead fired when its parent was killed. taskkill /T walks the tree
    the same way the sampler does; p.kill() is the fallback if it is missing."""
    try:
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(p.pid)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
    except Exception:                                             # noqa: BLE001
        pass
    if p.poll() is None:
        p.kill()


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
            # The sampler is a THREAD on a real clock, not a check inside the
            # read loop. It was the latter until 2026-09-04 23:50, which made the
            # ceiling blind at exactly the wrong moment: the aligner prints
            # "leg A: MMS_FA forced alignment ..." and then says nothing at all
            # until the leg finishes, and that silent stretch IS the allocation.
            # Measured live -- the child sat at 12.63 GB resident against a 6 GB
            # ceiling with the supervisor healthy and the machine down to 2.4 GB
            # of commit headroom, because no line had arrived to trigger a
            # sample. A watchdog that only wakes when the thing it watches
            # speaks is not a watchdog. (Same shape as the Charter's e2e:read
            # hang: when a wait has no ceiling, ask what happens when nothing
            # happens.)
            state = {"unit": "?", "over": None}
            stop = threading.Event()

            def watch():
                while not stop.wait(a.sample_s):
                    g = tree_rss_gb(p.pid)
                    if g > a.ceiling_gb:
                        state["over"] = (state["unit"], g)
                        log.write(f"  SUPERVISOR: rss {g:.2f} GB > {a.ceiling_gb} GB on "
                                  f"{state['unit']} — killing this run and moving on\n")
                        log.flush()
                        kill_tree(p)
                        return

            t = threading.Thread(target=watch, daemon=True)
            t.start()
            for line in p.stdout:
                log.write(line)
                log.flush()
                m = unit_re.search(line)
                if m:
                    state["unit"] = m.group(1)
            code = p.wait()
            stop.set()
            t.join(timeout=a.sample_s + 5)
            over = state["over"]

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
