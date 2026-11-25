"""The align supervisor's ceiling and supervision logic, on fake children.

WHY THIS TEST EXISTS. tools/align-supervisor.py is the guard that keeps one
pathological alignment unit from starving a shared machine: it samples the
child's whole process tree, kills it over the ceiling, records the unit, and
relaunches with that unit banned. The parts already covered on main are NOT
re-tested here: test_align_commit.py pins commit_gb() to PrivateUsage, and
test_align_pipeline.py pins after_kill() (a named unit is banned, "?" or an
already-banned unit stops). What was uncovered is the rest of the core:
_children_of, the RSS/commit readers, kill_tree, and main()'s loop.

No real alignment runs here and no live model: every child is a few lines of
Python that prints a unit line and sleeps, and the kill path is driven by a
patched tree_rss_gb so the test does not need a child that really grows.
The RSS/commit readers are checked empirically on Windows only; on anything
else ctypes has no wintypes and the readers return 0.0 by design.
"""
import contextlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "align_supervisor", os.path.join(ROOT, "tools", "align-supervisor.py"))
sup = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sup)

UNIT_RE = r"^([a-z0-9]+:[a-z0-9-]+): [0-9]+ fragments"
UNIT = "two:judgment-of-god"
# Prints its skip list, names its unit, then sleeps so the sampler can kill it.
SLEEPER = ("import os, time; "
           "print('SKIP=' + os.environ.get('ALIGN_SKIP_UNITS', ''), flush=True); "
           f"print('{UNIT}: 3 fragments', flush=True); time.sleep(30)")
DEAD_PID = 2 ** 31 - 1  # no Windows pid ever reaches this; OpenProcess fails


class ChildrenOfWalksTheTree(unittest.TestCase):
    """_children_of is pure: it takes the snapshot, it does not read the system."""

    SNAP = {1: [2, 3], 2: [4], 3: [], 4: []}

    def test_direct_and_nested_descendants(self):
        self.assertCountEqual(sup._children_of(1, self.SNAP), [2, 3, 4])

    def test_a_leaf_has_no_descendants(self):
        self.assertEqual(sup._children_of(4, self.SNAP), [])

    def test_an_unknown_pid_has_no_descendants(self):
        self.assertEqual(sup._children_of(99, self.SNAP), [])


class PidTreeReadsTheSystem(unittest.TestCase):
    """_pid_tree returns a pid -> [child pids] map; empty where ctypes is absent."""

    def test_it_returns_a_map(self):
        tree = sup._pid_tree()
        self.assertIsInstance(tree, dict)
        for parent, kids in tree.items():
            self.assertIsInstance(parent, int)
            for kid in kids:
                self.assertIsInstance(kid, int)

    @unittest.skipUnless(sys.platform == "win32",
                         "_pid_tree reads the live process table on Windows only")
    def test_the_live_tree_contains_this_process(self):
        tree = sup._pid_tree()
        self.assertTrue(tree, "the live tree came back empty")
        self.assertIn(os.getpid(), [c for kids in tree.values() for c in kids])


class RssAndCommitReads(unittest.TestCase):
    """rss_gb / commit_gb / tree_*_gb: real numbers for live pids, 0.0 for dead ones."""

    def test_a_dead_pid_reads_zero(self):
        self.assertEqual(sup.rss_gb(DEAD_PID), 0.0)
        self.assertEqual(sup.commit_gb(DEAD_PID), 0.0)
        self.assertEqual(sup.tree_rss_gb(DEAD_PID), 0.0)
        self.assertEqual(sup.tree_commit_gb(DEAD_PID), 0.0)

    @unittest.skipUnless(sys.platform == "win32",
                         "the readers are Windows API calls; elsewhere they return 0.0")
    def test_this_process_has_a_resident_set_and_a_commit(self):
        mine = os.getpid()
        self.assertGreater(sup.rss_gb(mine), 0.0)
        self.assertGreater(sup.commit_gb(mine), 0.0)

    @unittest.skipUnless(sys.platform == "win32",
                         "the tree readers walk the live process table on Windows only")
    def test_the_tree_reads_at_least_the_process_itself(self):
        mine = os.getpid()
        # Each reader samples this LIVE process at a different instant, and its working set and commit move
        # between the two calls (28 KB once, landing 2026-11-24), so the two reads get 16 MB of slack: the
        # tree must still hold the process itself, which is the claim; the exact sums are the fake-tree tests'.
        slack = 1 / 64
        self.assertGreaterEqual(sup.tree_rss_gb(mine) + slack, sup.rss_gb(mine))
        self.assertGreater(sup.tree_rss_gb(mine), 0.0)
        self.assertGreaterEqual(sup.tree_commit_gb(mine) + slack, sup.commit_gb(mine))
        self.assertGreater(sup.tree_commit_gb(mine), 0.0)


class KillTreeKillsTheChild(unittest.TestCase):
    """kill_tree ends the child; on a process already gone it does nothing."""

    def test_a_sleeping_child_is_gone_afterwards(self):
        p = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
        try:
            self.assertIsNone(p.poll())
            sup.kill_tree(p)
            self.assertIsNotNone(p.wait(timeout=15))
        finally:
            if p.poll() is None:
                p.kill()

    def test_an_already_dead_child_does_not_raise(self):
        p = subprocess.Popen([sys.executable, "-c", "pass"])
        p.wait(timeout=15)
        sup.kill_tree(p)  # must not raise


class SupervisorMain(unittest.TestCase):
    """main()'s loop, driven by fake children and a patched sampler."""

    def _argv(self, d, extra=(), sample_s="0.5", record=True):
        argv = ["align-supervisor.py", "--ceiling-gb", "6",
                "--unit-re", UNIT_RE, "--log", os.path.join(d, "sup.log")]
        if record:
            argv += ["--record", os.path.join(d, "killed.json")]
        argv += ["--sample-s", sample_s] + list(extra) + ["--",
                                                          sys.executable, "-u", "-c"]
        return argv

    def _run(self, argv, env=None):
        out = io.StringIO()
        patches = [mock.patch.object(sys, "argv", argv)]
        if env is not None:
            patches.append(mock.patch.dict(os.environ, env))
        for p in patches:
            p.start()
        try:
            with contextlib.redirect_stdout(out):
                rc = sup.main()
        finally:
            for p in reversed(patches):
                p.stop()
        return rc, out.getvalue()

    def _read(self, d, name):
        with open(os.path.join(d, name), encoding="utf-8") as f:
            return f.read()

    def test_a_healthy_child_exits_with_its_own_code(self):
        code = ("import sys; print('leg A: first', flush=True); "
                f"print('{UNIT}: 3 fragments', flush=True); "
                "print('leg B: done', flush=True); sys.exit(3)")
        with tempfile.TemporaryDirectory() as d:
            rc, stdout = self._run(self._argv(d) + [code])
            self.assertEqual(rc, 3)
            log = self._read(d, "sup.log")
            self.assertIn("leg A: first", log)
            self.assertIn("leg B: done", log)
            self.assertNotIn("SUPERVISOR", log)
            self.assertFalse(os.path.exists(os.path.join(d, "killed.json")),
                             "no kill means no record file")
            self.assertIn("child exited 3 after 0 restart(s)", stdout)

    def test_no_command_is_an_error(self):
        with tempfile.TemporaryDirectory() as d:
            argv = ["align-supervisor.py", "--unit-re", UNIT_RE,
                    "--log", os.path.join(d, "sup.log")]
            with self.assertRaises(SystemExit) as cm:
                with mock.patch.object(sys, "argv", argv):
                    sup.main()
            self.assertEqual(cm.exception.code, 2)

    def test_inherited_skip_units_are_honoured(self):
        with tempfile.TemporaryDirectory() as d:
            rc, stdout = self._run(
                self._argv(d) + ["import sys; sys.exit(0)"],
                env={"ALIGN_SKIP_UNITS": UNIT})
            self.assertEqual(rc, 0)
            self.assertIn("honouring 1 skip unit(s)", stdout)

    def _fake_sampler(self, quiet_calls, over_gb=99.0, commit_gb=7.5):
        """0.0 for the first `quiet_calls` samples (the child gets to print its
        unit), then `over_gb` forever, so the kill is deterministic."""
        seen = {"n": 0}

        def fake(pid):
            seen["n"] += 1
            return 0.0 if seen["n"] <= quiet_calls else over_gb

        return fake, (lambda pid: commit_gb)

    def test_a_kill_records_the_unit_and_stops_after_the_relaunch(self):
        # sample_s 0.5 gives the child half a second to print its unit line
        # before the first over-ceiling sample can fire, in either run.
        fake_rss, fake_commit = self._fake_sampler(quiet_calls=1)
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(sup, "tree_rss_gb", fake_rss), \
                    mock.patch.object(sup, "tree_commit_gb", fake_commit):
                rc, stdout = self._run(self._argv(d) + [SLEEPER])
            self.assertEqual(rc, 2)
            with open(os.path.join(d, "killed.json"), encoding="utf-8") as f:
                killed = json.load(f)
            # First kill bans the unit and relaunches; the relaunch is killed
            # on the same unit, which is already banned, so it stops.
            self.assertEqual(len(killed), 2)
            for entry in killed:
                self.assertEqual(entry["unit"], UNIT)
                self.assertEqual(entry["rssGb"], 99.0)
                self.assertEqual(entry["commitGb"], 7.5)
                self.assertIn("when", entry)
            log = self._read(d, "sup.log")
            self.assertIn("SUPERVISOR: rss 99.00 GB > 6.0 GB (commit 7.50 GB)", log)
            self.assertIn(f"SKIP={UNIT}", log,
                          "the relaunch must carry the banned unit in ALIGN_SKIP_UNITS")
            self.assertIn("relaunching (resume skips what banked)", stdout)
            self.assertIn("which was already skipped", stdout)

    def test_max_restarts_stops_after_the_first_kill(self):
        fake_rss, fake_commit = self._fake_sampler(quiet_calls=1)
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(sup, "tree_rss_gb", fake_rss), \
                    mock.patch.object(sup, "tree_commit_gb", fake_commit):
                rc, stdout = self._run(
                    self._argv(d, extra=["--max-restarts", "0"]) + [SLEEPER])
            self.assertEqual(rc, 2)
            with open(os.path.join(d, "killed.json"), encoding="utf-8") as f:
                killed = json.load(f)
            self.assertEqual(len(killed), 1)
            self.assertEqual(killed[0]["unit"], UNIT)
            self.assertIn("1 restarts, stopping", stdout)
            self.assertNotIn("relaunching", stdout)

    def test_a_kill_before_any_unit_stops_without_a_relaunch(self):
        sleeper = "import time; time.sleep(30)"  # prints nothing, names no unit
        fake_rss, fake_commit = self._fake_sampler(quiet_calls=0)
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(sup, "tree_rss_gb", fake_rss), \
                    mock.patch.object(sup, "tree_commit_gb", fake_commit):
                rc, stdout = self._run(self._argv(d, sample_s="0.05") + [sleeper])
            self.assertEqual(rc, 2)
            with open(os.path.join(d, "killed.json"), encoding="utf-8") as f:
                killed = json.load(f)
            self.assertEqual(len(killed), 1)
            self.assertEqual(killed[0]["unit"], "?")
            self.assertIn("before the aligner named a unit", stdout)
            self.assertNotIn("relaunching", stdout)


if __name__ == "__main__":
    unittest.main()
