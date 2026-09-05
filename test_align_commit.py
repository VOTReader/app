"""The alignment runners' commit-charge reader must read the COMMIT CHARGE.

WHY THIS TEST EXISTS. On 2026-09-05 the per-unit progress line printed 10.02 GB
for the letters aligner while Machine Ops, measuring the same PID from outside,
read 17.29 GB. The reader was taking `PagefileUsage` out of the BASE
`PROCESS_MEMORY_COUNTERS`; the commit charge is `PrivateUsage`, which only
exists in `PROCESS_MEMORY_COUNTERS_EX`. Every number was self-consistent and
wrong by 40%.

A zero would have been obvious. A plausible number is not, and this one was
about to be written into 1,189 rows of a memory series that another agent was
using to size a ceiling. Only a second instrument watching the same process
caught it.

TWO HALVES, ON PURPOSE. CI runs ubuntu-latest and `_self_mem` returns 0.0 on
anything but Windows, so a runtime assertion would SKIP in CI and gate nothing.
The first class therefore checks the shape of the code, which runs everywhere
and fails on exactly the revert that caused the defect. The second class is the
empirical check — the second instrument — and runs only where it can.

THE HOLE THIS DOES NOT CLOSE, stated rather than implied: on a quiescent test
process `PagefileUsage` and `PrivateUsage` often agree, so the external
comparison alone would NOT have caught the original bug. The two fields diverged
on the aligner because of the CUDA/WDDM backing reserve. The shape assertions
are what carry the regression weight; the external comparison proves the reader
returns a real number rather than a plausible constant.
"""
import ast
import importlib.util
import inspect
import os
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "alignlib", os.path.join(ROOT, "tools", "_alignlib.py"))
al = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(al)

# The supervisor keeps its OWN reader, because it measures a process it did not
# start from inside — OpenProcess by pid rather than GetCurrentProcess. Two
# copies of a struct is two places to get the field wrong, and the supervisor's
# number is the one that decides whether a unit gets KILLED.
_sspec = importlib.util.spec_from_file_location(
    "align_supervisor", os.path.join(ROOT, "tools", "align-supervisor.py"))
sup = importlib.util.module_from_spec(_sspec)
_sspec.loader.exec_module(sup)


class CommitChargeReadsTheRightField(unittest.TestCase):
    """Shape only, so this half runs on CI's ubuntu runner as well as Windows."""

    def test_struct_is_the_EX_layout(self):
        src = inspect.getsource(al._self_mem)
        self.assertIn(
            '"PrivateUsage"', src,
            "_self_mem's struct lost PrivateUsage. Without that field the "
            "getattr raises, the except swallows it, and commit_gb() reports "
            "0.0 forever — which reads like good news.")
        # Field ORDER is the ABI. PrivateUsage is the _EX struct's tail; putting
        # it anywhere else silently reads a different field's bytes.
        self.assertLess(
            src.index('"PeakPagefileUsage"'), src.index('"PrivateUsage"'),
            "PrivateUsage must come after PeakPagefileUsage — that ordering is "
            "the PROCESS_MEMORY_COUNTERS_EX layout, not a style choice.")

    def test_commit_gb_reads_private_usage(self):
        src = inspect.getsource(al.commit_gb)
        self.assertIn(
            '_self_mem("PrivateUsage")', src,
            "commit_gb() must read PrivateUsage — the commit charge.")
        self.assertNotIn(
            "PagefileUsage", src,
            "commit_gb() is reading PagefileUsage again. That is the near-miss "
            "field: measured 10.02 GB where the truth was 17.29 GB.")

    def test_rss_still_reads_the_working_set(self):
        """The control. This reader must NOT move under a commit-charge fix."""
        self.assertIn('_self_mem("WorkingSetSize")', inspect.getsource(al.rss_gb))

    def test_supervisor_reader_reads_private_usage_too(self):
        """The supervisor's copy decides KILLS, so it must not drift from this one."""
        src = inspect.getsource(sup.commit_gb)
        self.assertIn(
            '"PrivateUsage"', src,
            "align-supervisor.py's struct lost PrivateUsage.")
        self.assertIn(
            "c.PrivateUsage", src,
            "align-supervisor.py's commit_gb() must return PrivateUsage. This "
            "is the number a kill decision and its recorded figure are made "
            "from; under-reading it hides the unit that starved the machine.")


@unittest.skipUnless(sys.platform == "win32",
                     "_self_mem is a Windows API read; it returns 0.0 elsewhere")
class CommitChargeAgreesWithAnExternalInstrument(unittest.TestCase):
    """The second instrument, on this very process."""

    def test_matches_win32_process(self):
        mine = al.commit_gb()
        self.assertGreater(
            mine, 0.0,
            "commit_gb() returned 0.0 on Windows — the API call failed and the "
            "except swallowed it.")
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             f"(Get-CimInstance Win32_Process -Filter 'ProcessId={os.getpid()}')"
             ".PrivatePageCount"],
            capture_output=True, text=True, timeout=120)
        if out.returncode != 0 or not out.stdout.strip().isdigit():
            self.skipTest(f"no external instrument available: {out.stderr.strip()[:120]}")
        theirs = int(out.stdout.strip()) / (1024 ** 3)
        # 10% or 50 MB, whichever is larger: the two reads are moments apart and
        # this process is allocating nothing. The bug it must catch was 40% off.
        self.assertAlmostEqual(
            mine, theirs, delta=max(0.05, theirs * 0.10),
            msg=f"in-process commit_gb() {mine:.3f} GB disagrees with "
                f"Win32_Process PrivatePageCount {theirs:.3f} GB")

        # And the supervisor's reader, pointed at this same process, must agree
        # with both. It takes a pid rather than reading itself, so it is a third
        # code path to the same truth.
        theirs_sup = sup.commit_gb(os.getpid())
        self.assertAlmostEqual(
            theirs_sup, theirs, delta=max(0.05, theirs * 0.10),
            msg=f"align-supervisor.py commit_gb(pid) {theirs_sup:.3f} GB "
                f"disagrees with Win32_Process {theirs:.3f} GB")


class CommitIsSampledBeforeTheAllocatorIsReleased(unittest.TestCase):
    """WHERE the reader is called is part of the number it returns.

    Both runners hand torch's allocator cache back with al.release_caches()
    right before printing their per-unit progress line, and both used to sample
    commit AFTER that call. Every figure either of them has ever logged is
    therefore a post-release TROUGH: a unit that climbed to 30 GB and gave it
    back logs the same idle number as one that never grew, which is precisely
    the unit the column exists to find. Measured 2026-09-05 on the Bible runner:
    a logged 10.00 GB against 19.06 GB for the same pid at the same moment, the
    whole gap being sampling PHASE, not a bad field or a stale build.

    An external per-minute sampler does not rescue this — chapters run 36-120 s,
    so a short one peaks and releases entirely between two samples.

    Source-order assertion rather than a live run: the defect is a line's
    position, the runners need a GPU and hours, and a position is exactly what
    a reviewer moves back by accident.
    """

    RUNNERS = {
        "tools/batch-align-bible.py": "peak_commit",
        "tools/batch-align.py": "window_peak",
    }

    def _tree(self, rel):
        with open(os.path.join(ROOT, *rel.split("/")), encoding="utf-8") as f:
            return ast.parse(f.read(), filename=rel)

    def test_a_commit_read_precedes_release_caches(self):
        for rel, peak_var in self.RUNNERS.items():
            with self.subTest(runner=rel):
                tree = self._tree(rel)
                releases, samples = [], []
                for node in ast.walk(tree):
                    if not isinstance(node, ast.Call):
                        continue
                    fn = node.func
                    if not isinstance(fn, ast.Attribute):
                        continue
                    if fn.attr == "release_caches":
                        releases.append(node.lineno)
                    elif fn.attr == "commit_gb":
                        samples.append(node.lineno)
                # Positive control: an assertion about ordering is vacuous if
                # neither call is there any more. A runner that stopped
                # releasing, or stopped reading commit, is its own finding.
                self.assertEqual(
                    len(releases), 1,
                    f"{rel}: expected exactly one al.release_caches() call, "
                    f"found {len(releases)} on lines {releases}")
                self.assertTrue(
                    samples, f"{rel}: no al.commit_gb() call at all")
                self.assertTrue(
                    any(s < releases[0] for s in samples),
                    f"{rel}: every al.commit_gb() call (lines {samples}) is "
                    f"BELOW al.release_caches() on line {releases[0]}, so the "
                    f"commit column is a post-release trough and cannot show a "
                    f"unit that peaked and released.")

    def test_the_progress_line_prints_the_peak(self):
        """Sampling early is worthless if the print still shows only the trough."""
        for rel, peak_var in self.RUNNERS.items():
            with self.subTest(runner=rel):
                tree = self._tree(rel)
                printed = [
                    node for node in ast.walk(tree)
                    if isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Name) and node.func.id == "print"
                ]
                commit_lines = [
                    node for node in printed
                    if "commit " in "".join(
                        v.value for a in node.args
                        for v in ast.walk(a) if isinstance(v, ast.Constant)
                        and isinstance(v.value, str))
                ]
                self.assertTrue(
                    commit_lines,
                    f"{rel}: no print() emits a 'commit ' column any more")
                names = {
                    v.id for node in commit_lines
                    for v in ast.walk(node) if isinstance(v, ast.Name)
                }
                self.assertIn(
                    peak_var, names,
                    f"{rel}: the commit progress line does not reference "
                    f"{peak_var!r}, so it prints the post-release trough only")


if __name__ == "__main__":
    unittest.main()
