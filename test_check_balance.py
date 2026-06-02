"""Unit tests for check_balance.py — the front-line data gate (T6).

check_balance.py is the pre-commit/CI gate that catches the black-screen /
white-verse failure classes this project fears most (see CLAUDE.md "Quick
start: app failed to load"): esprima JS parse errors, non-ASCII dashes in
verse ranges, smart-quote JSON delimiters, and brace/bracket/paren imbalance.
It had ZERO tests — so a regression in the gate would SILENTLY stop catching
the very bug class it exists to catch, with nothing to flag the gap.

These pin each detector against known-good + known-bad strings, and drive
main() end-to-end over a TEMP data dir (no real-data pollution) to assert its
exit code: 0 on a clean file, nonzero on a bad one.

Stdlib unittest + unittest.mock ONLY — no new dependency, so the same `python`
that runs the gate in pre-commit/CI runs this test. esprima (the gate's one
real dep, pinned in requirements-dev.txt) is the authoritative JS-syntax check;
the esprima-dependent cases skip cleanly if it is absent.

Run:  python -m unittest test_check_balance        (from repo root)
"""
import contextlib
import io
import os
import sys
import tempfile
import unittest
from unittest import mock

import check_balance as cb

EN = chr(0x2013)   # en dash  –
EM = chr(0x2014)   # em dash  —
LDQ = chr(0x201c)  # left  double smart quote  "
RDQ = chr(0x201d)  # right double smart quote  "


def _esprima_present():
    try:
        import esprima  # noqa: F401
        return True
    except ImportError:
        return False


class CheckBalanceTest(unittest.TestCase):
    """The brace/bracket/paren scanner (string- and escape-aware)."""

    def test_balanced_returns_zeros(self):
        self.assertEqual(cb.check_balance('var x = { a: [1, (2)] };'), (0, 0, 0))

    def test_unbalanced_braces_flagged(self):
        b, _br, _p = cb.check_balance('var x = { a: 1 ;')  # missing }
        self.assertNotEqual(b, 0)

    def test_unbalanced_bracket_and_paren_counts(self):
        self.assertEqual(cb.check_balance('[[]')[1], 1)   # one unclosed [
        self.assertEqual(cb.check_balance('(()')[2], 1)   # one unclosed (

    def test_braces_inside_strings_are_ignored(self):
        # A brace inside a quoted string is content, not structure — the
        # scanner tracks string state, so this is balanced.
        self.assertEqual(cb.check_balance('var x = "a } b { c";'), (0, 0, 0))

    def test_escaped_quote_does_not_close_string(self):
        # The \" stays inside the string; the trailing { } outside balances.
        self.assertEqual(cb.check_balance(r'var x = "a \" b"; { }'), (0, 0, 0))


class DashRangeTest(unittest.TestCase):
    """Non-ASCII dashes between digits break the verse-range parser."""

    def test_en_dash_between_digits_flagged(self):
        self.assertEqual(cb.check_dashes_in_ranges('Exodus 12:18' + EN + '20'), 1)

    def test_em_dash_between_digits_flagged(self):
        self.assertEqual(cb.check_dashes_in_ranges('1' + EM + '2'), 1)

    def test_ascii_hyphen_between_digits_ok(self):
        self.assertEqual(cb.check_dashes_in_ranges('Exodus 12:18-20'), 0)

    def test_dash_as_prose_separator_ok(self):
        # An em dash NOT between digits (prose separator) is legitimate.
        self.assertEqual(cb.check_dashes_in_ranges('verse text ' + EM + ' more'), 0)


class SmartQuoteTest(unittest.TestCase):
    """Smart double-quote opening a JSON line = delimiter contamination."""

    def test_smart_quoted_key_line_flagged(self):
        self.assertEqual(cb.check_smart_quote_json('    ' + LDQ + 't' + RDQ + ': "x",'), 1)

    def test_ascii_quoted_line_ok(self):
        self.assertEqual(cb.check_smart_quote_json('    "t": "text",'), 0)

    def test_smart_quote_inside_value_ok(self):
        # Smart quotes as typographic CONTENT inside a value are allowed; only
        # a smart quote at the start of the (stripped) line is contamination.
        self.assertEqual(cb.check_smart_quote_json('    "t": ' + LDQ + 'text' + RDQ + ','), 0)


class EsprimaTest(unittest.TestCase):
    """esprima — the authoritative JS-validity check."""

    def setUp(self):
        if not _esprima_present():
            self.skipTest('esprima not installed (pinned in requirements-dev.txt)')

    def test_valid_js_returns_none(self):
        self.assertIsNone(cb.esprima_check('var BOOKS = { id: "genesis" };'))

    def test_unescaped_quote_in_value_is_caught(self):
        # The canonical black-screen bug: an unescaped " inside a JSON value.
        # Braces still balance, so ONLY esprima catches it.
        result = cb.esprima_check('var X = { "psalm": ""Hear, O My people"" };')
        self.assertIsNotNone(result)
        self.assertNotIn('esprima not installed', result)


class MainExitCodeTest(unittest.TestCase):
    """Drive main() end-to-end over a temp data dir (no real-data pollution)."""

    def _run_main_over(self, name, contents):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, name + '.js'), 'w', encoding='utf-8') as fh:
                fh.write(contents)
            # Patch the module's data dir + default file list + argv so main()
            # scans ONLY our temp file (argv must be bare or main() treats
            # pytest/unittest args as filenames).
            with mock.patch.object(cb, 'DATA_DIR', d + os.sep), \
                 mock.patch.object(cb, 'DEFAULT_FILES', [name]), \
                 mock.patch.object(sys, 'argv', ['check_balance.py']), \
                 contextlib.redirect_stdout(io.StringIO()), \
                 contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as ctx:
                    cb.main()
                return ctx.exception.code

    def test_clean_file_exits_zero(self):
        self.assertEqual(self._run_main_over('clean', 'var X = { "a": "ok" };\n'), 0)

    def test_en_dash_file_exits_nonzero(self):
        self.assertEqual(
            self._run_main_over('bad', 'var X = { "r": "12:18' + EN + '20" };\n'), 1)

    def test_unescaped_quote_file_exits_nonzero(self):
        # esprima is what catches this class; the brace heuristic alone would
        # pass (balanced), so guard on esprima presence.
        if not _esprima_present():
            self.skipTest('esprima not installed')
        self.assertEqual(
            self._run_main_over('bad', 'var X = { "p": ""bad"" };\n'), 1)


if __name__ == '__main__':
    unittest.main()
