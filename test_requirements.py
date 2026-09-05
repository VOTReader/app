"""Every third-party import on the SCHEDULED path must be pinned.

WHY THIS EXISTS (2026-09-04, review finding process-hygiene-6). The weekly Task
Scheduler job (tools/flock-audio-sync.py) runs fetch-drive-audio ->
gen-audio-manifest -> mirror-audio-release with nobody watching. Two of those
scripts import gdown and requests, and requirements-dev.txt declared neither.
An undeclared import raises ModuleNotFoundError at step 1: the run aborts before
the manifest is touched, writes an attention file nobody reads, and audio
ingestion stops indefinitely while the repo stays green. gdown is the fragile
one -- it tracks Drive's undocumented download flow -- so an unpinned upgrade is
a live risk, not a theoretical one.

Declaring the pins fixes it once. This test keeps it fixed: add a new import to
a scheduled-path script without pinning it and this fails. Stdlib only (it runs
beside test_check_balance.py in pre-commit and CI), and it reads imports with
`ast` rather than executing anything.
"""
import ast
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# The scripts the weekly job actually runs, plus the gate that shares their
# dependency (verify-audio-release.py is the mirror's own verifier).
SCHEDULED_PATH = [
    "tools/flock-audio-sync.py",
    "tools/fetch-drive-audio.py",
    "tools/mirror-audio-release.py",
    "tools/verify-audio-release.py",
    "check_balance.py",
]

# The OCR / PDF scripts, which are covered by requirements-ocr.txt instead. Not
# on the scheduled path — they exist here so both the coverage test and the
# DIST_FOR_MODULE completeness test read one list rather than a literal each.
OCR_CONSUMERS = [
    "tools/vot-pdf-extract.py",
    "tools/vot-pdf-render.py",
    "ocr_pipeline.py",
    "render_pdf_pages.py",
]

# Modules that ship with CPython or live in this repo, so they are never pinned.
LOCAL_MODULES = {"_alignlib"}


def stdlib_names():
    """The standard library, from the interpreter rather than a hand-written list."""
    names = set(getattr(sys, "stdlib_module_names", ()))
    return names | {"__future__"}


def top_level_imports(path):
    """Top-level module names imported anywhere in a file, via ast (no execution)."""
    tree = ast.parse(Path(path).read_text(encoding="utf-8"), filename=str(path))
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                found.add(a.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.level == 0 and node.module:
                found.add(node.module.split(".")[0])
    return found


def pinned(req_file):
    """{distribution: version} from a requirements file."""
    out = {}
    for line in (ROOT / req_file).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.fullmatch(r"([A-Za-z0-9._-]+)==([0-9][0-9A-Za-z._-]*)", line)
        assert m, f"{req_file}: {line!r} is not a `name==version` pin"
        out[m.group(1)] = m.group(2)
    return out


# A distribution name is not always the module name: `import fitz` comes from
# PyMuPDF, `import yaml` from PyYAML. Every check below falls back to the module
# name when a module is missing here, which stays CORRECT (an unmapped module is
# not in the requirements file either, so the check still fails) but reports a
# GUESS as the distribution — and the reader then pins the wrong name, or the
# OCR-leak check compares the wrong name and passes. test_every_module_has_a_
# known_distribution keeps the map complete so that fallback is never reached.
DIST_FOR_MODULE = {
    "gdown": "gdown",
    "requests": "requests",
    "esprima": "esprima",
    "fitz": "PyMuPDF",
    "pypdfium2": "pypdfium2",
}


class ScheduledPathIsPinned(unittest.TestCase):
    def test_every_third_party_import_is_pinned(self):
        dev = pinned("requirements-dev.txt")
        std = stdlib_names()
        missing = []
        for rel in SCHEDULED_PATH:
            path = ROOT / rel
            if not path.exists():
                continue
            for mod in sorted(top_level_imports(path)):
                if mod in std or mod in LOCAL_MODULES:
                    continue
                dist = DIST_FOR_MODULE.get(mod, mod)
                if dist not in dev:
                    missing.append(f"{rel} imports {mod!r} (distribution {dist}) — not in requirements-dev.txt")
        self.assertEqual(missing, [], "\n  " + "\n  ".join(missing) if missing else "")

    def test_every_pin_is_an_exact_version(self):
        for f in ("requirements-dev.txt", "requirements-ocr.txt"):
            self.assertTrue(pinned(f), f"{f} declares nothing")

    def test_the_ocr_dependencies_stay_out_of_the_weekly_path(self):
        """The weekly job must not need PyMuPDF or pypdfium2 — they are heavy and
        nothing on the scheduled path imports them. Keeping them in their own
        file is the whole point of requirements-ocr.txt."""
        dev = pinned("requirements-dev.txt")
        ocr = pinned("requirements-ocr.txt")
        self.assertEqual(sorted(set(dev) & set(ocr)), [], "an OCR-only dependency leaked into requirements-dev.txt")
        std = stdlib_names()
        for rel in SCHEDULED_PATH:
            path = ROOT / rel
            if not path.exists():
                continue
            for mod in top_level_imports(path):
                if mod in std or mod in LOCAL_MODULES:
                    continue
                self.assertNotIn(DIST_FOR_MODULE.get(mod, mod), ocr,
                                 f"{rel} imports an OCR-only dependency; move it to requirements-dev.txt")

    def test_the_ocr_consumers_are_covered_by_the_ocr_file(self):
        ocr = pinned("requirements-ocr.txt")
        std = stdlib_names()
        for rel in OCR_CONSUMERS:
            path = ROOT / rel
            if not path.exists():
                continue
            for mod in top_level_imports(path):
                if mod in std or mod in LOCAL_MODULES:
                    continue
                dist = DIST_FOR_MODULE.get(mod, mod)
                if dist in ocr or dist in pinned("requirements-dev.txt"):
                    continue
                self.fail(f"{rel} imports {mod!r} (distribution {dist}) — in neither requirements file")

    def test_every_module_has_a_known_distribution(self):
        """No check in this file may report a guessed distribution name.

        Every check above resolves a module through DIST_FOR_MODULE.get(mod, mod).
        The fallback keeps the pinned/not-pinned answer correct, but it prints a
        name that need not exist on PyPI — pin `yaml` and the weekly job still
        dies, because the distribution is PyYAML. Worse, the OCR-leak check
        COMPARES that guess: a module whose distribution is in
        requirements-ocr.txt under its real name passes as absent. Keeping the
        map complete deletes that branch instead of documenting it.
        """
        std = stdlib_names()
        unmapped = []
        for rel in SCHEDULED_PATH + OCR_CONSUMERS:
            path = ROOT / rel
            if not path.exists():
                continue
            for mod in sorted(top_level_imports(path)):
                if mod in std or mod in LOCAL_MODULES or mod in DIST_FOR_MODULE:
                    continue
                unmapped.append(
                    f"{rel} imports {mod!r} — add it to DIST_FOR_MODULE naming the "
                    f"distribution that provides it (they differ: fitz -> PyMuPDF, "
                    f"yaml -> PyYAML)")
        self.assertEqual(unmapped, [], "\n  " + "\n  ".join(unmapped) if unmapped else "")


if __name__ == "__main__":
    unittest.main()
