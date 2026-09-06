"""Verse numbering inside every shipped bible edition.

WHY THIS EXISTS. `ship()` writes a timing at `arr[n - 1]` and sizes the array to `max(n)`, where `n`
is the EDITION's own verse number. Both of those are only safe while, inside a chapter, the verse
numbers are strictly increasing and unique: a duplicate silently overwrites a slot that another verse
already owns, and an out-of-order number puts a timing behind an earlier one, while `len(arr)`,
`max(n)` and every other length check in `tools/validate-bible-sync.py` still pass. Nothing else in
the tree looks at that property, so this is where it is pinned.

It is a RULE over whatever is shipped, deliberately not a list of chapters. A list goes stale the day
an edition is added or the corpus is refreshed, and it goes stale silently, which is the worst way.

**Two shapes hold verse rows, and the first version of this file only knew one of them.**

    A  bible-*.js        {book: {chapter: [rows]}}                 9 editions,  8,768 chapters
    B  books.js          {id, title, chapters: [{num, sections: [{verses: [rows]}]}]}
       matthew.js          (matthew.js hangs `verses` off the chapter with no sections)
       matthew-plain.js                                           67 books,    1,217 chapters

Shape B is the app's OWN text and it was missed entirely: `books.js` holds 30,031 rows and
`matthew.js` 1,071, which is 31,102 — the canon verse count exactly. It carries no `bible-` prefix
and is not shaped like an edition, so a walk built around `bible-*.js` never saw it. `test_no_file_
holds_verse_rows_that_neither_reader_covers` is the arm that stops a third shape being missed the
same way. Measured 2026-09-06 on main 7416be36: **0 violations in either shape**, whole suite 2.5 s.

Shape B is checked per WHOLE chapter with its sections joined, because the numbers must be increasing
and unique across the chapter and a section boundary is exactly where a duplicate would sit unseen.

WHAT IT DELIBERATELY DOES NOT ASSERT. Which chapters are sparse. Sparse numbering is normal and it is
NOT a WEB quirk with four instances, which is what a reader of the old comment in
`tools/validate-bible-sync.py` would have concluded:

    bible-kjv.js    1189 chapters   sparse=0     bible-web.js    1189   sparse=4
    bible-lsv.js    1189            sparse=0     bible-hnv.js    1189   sparse=4   (the same four)
    bible-ylt.js    1189            sparse=0     bible-asv.js    1189   sparse=15
    bible-rkjv.js    223            sparse=221   bible-bsb.js    1189   sparse=15
    bible-rnkjv.js   222            sparse=220

The WEB and the HNV drop luke 17:36 and acts 8:37, 15:34, 24:7. The ASV and the BSB drop fifteen each,
including matthew 17, 18, 23 and mark 7, 9, 11. The RKJV and the RNKJV are PARTIAL editions of 26
books and are ~99 % sparse by construction, so a per-chapter verse count means something different
there. Three editions have no gaps at all, which is why a dense-shipper bug never surfaces on the KJV.

Run: python -m unittest test_bible_versification -v
"""

import json
import re
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "app", "src", "main", "assets", "src", "data")


def _payload(path):
    """The first JSON value out of a `var X = ...;` data file.

    Two things this got wrong before, both silent:

    * `raw_decode` rather than a slice to the last brace. Some of these files declare more than one
      value, and slicing to `rindex("}")` reports "Extra data" — a PARSE failure that reads exactly
      like a corrupt file when the file is fine and merely has a second declaration.
    * The value may be an ARRAY. `bible-studies.js` is a top-level array, so seeking `{` walked past
      the array opener into the first element and returned ONE STUDY as if it were the whole payload
      — a fragment that classifies fine and tells you nothing. A parser that silently returns part of
      a file is worse than one that raises.
    """
    with open(path, encoding="utf-8") as fh:           # `with`, not a bare open(): this repo is
        text = fh.read()                               # counting ResourceWarnings, not ignoring them
    # Anchored on the DECLARATION, not on a bracket and not on a bare `=`. These files open with a
    # header comment that contains both: `[appBookId, title]` in one, and
    # `BIBLE_SYNC_BRM_KJV[bookId][chapter] = [cs, cs, ...]` in another — so `[`, and even `= [`,
    # match inside the prose. `var NAME = {` is the only thing that cannot.
    m = re.search(r"\b(?:var|const|let)\s+\w+\s*=\s*[{\[]", text)
    if not m:
        raise ValueError("no `var NAME = {` or `= [` declaration in the file")
    return json.JSONDecoder().raw_decode(text, m.end() - 1)[0]


def violations(rows):
    """Every way a chapter's verse numbers can break `arr[n - 1]` / `max(n)`, as strings.

    Kept separate from the file walk so the planted-fault cases below exercise the same code the
    real data does. A checker that only ever runs on good input is not a checker.
    """
    nums = [r["n"] for r in rows]
    out = []
    if not nums:
        out.append("no verses")
        return out
    if len(set(nums)) != len(nums):
        dupes = sorted({n for n in nums if nums.count(n) > 1})
        out.append("duplicate verse number(s) %s" % dupes)
    if nums != sorted(nums):
        out.append("verse numbers out of order: %s" % nums[:12])
    if min(nums) < 1:
        out.append("verse number below 1: %s" % min(nums))
    return out


# The files under `bible-*.js` that are NOT verse editions, each with the reason it is exempt. This
# is a LIST on purpose, and it is the right shape here: the open set that grows (editions, and the
# per-edition sync files) is covered by a rule below, and the closed set of one-off exceptions has to
# be justified one at a time. Anything matching neither FAILS by name, which forces the decision onto
# whoever adds the file and still knows what it holds.
NOT_EDITIONS = {
    "bible-audio-manifest.js": "an audio manifest: its object literal is empty in the source and is "
                               "populated by a loop at the bottom of the file",
    "bible-studies.js": "a top-level array of letter studies, not a book -> chapter -> verses map",
}


def _editions(data=None):
    """Classify every `bible-*.js` under `data`. Returns (editions, unknown).

    An allowlist over a growing set of data files fails SILENTLY when somebody adds one, so editions
    are recognised by SHAPE. But a shape test needs somewhere for "matched nothing" to go, and the
    first version of this let it fall out of the loop: a file that parsed to `{}` was neither an
    edition nor an unknown, and the suite passed green over it. Planted and confirmed 2026-09-06 —
    exactly the vacuous pass this gate exists to prevent, in the gate itself. Every branch below now
    ends in a classification.
    """
    data = data or DATA
    editions, unknown = {}, []
    for name in sorted(os.listdir(data)):
        if not name.startswith("bible-") or not name.endswith(".js"):
            continue
        if name in NOT_EDITIONS:
            continue                                   # exempt by name, with its reason recorded above
        path = os.path.join(data, name)
        try:
            payload = _payload(path)
        except Exception as exc:                       # noqa: BLE001 - the filename is the point
            unknown.append("%s (could not parse: %s)" % (name, exc))
            continue
        if not isinstance(payload, dict) or not payload:
            unknown.append("%s (payload is %s, and empty or not an object)" % (name, type(payload).__name__))
            continue
        # The first NON-EMPTY chapter, not chapters[0]: an edition whose first chapter happened to be
        # empty would otherwise read as "not an edition" and be skipped whole.
        sample = next((ch for book in payload.values() if isinstance(book, dict)
                       for ch in book.values() if isinstance(ch, list) and ch), None)
        if sample is None:
            unknown.append("%s (book-shaped but holds no chapter with any rows)" % name)
        elif isinstance(sample[0], dict) and "n" in sample[0]:
            editions[name] = payload                    # rows of {"n": ..., "text": ...}
        elif name.startswith("bible-sync-") and isinstance(sample[0], (int, float)):
            continue                                    # a timing file: chapters are arrays of numbers
        else:
            unknown.append("%s (chapters hold %s, which is neither verse rows nor timings)"
                           % (name, type(sample[0]).__name__))
    return editions, unknown


# ---------------------------------------------------------------------------------------------
# The SECOND verse-bearing shape. `bible-*.js` is `{book: {chapter: [rows]}}`; the app's primary text
# is not shaped like that at all: `books.js` is 65 books and `matthew.js` / `matthew-plain.js` are one
# book each, every one of them `{id, title, chapters: [{num, sections: [{verses: [rows]}]}]}` — and
# `matthew.js` hangs `verses` straight off the chapter with no sections. That is 32,173 verse rows
# this gate did not look at when it was written, on the files the reader actually reads.
#
# Concatenating the sections per chapter is the whole point of a separate reader: the verse numbers
# have to be increasing and unique across a WHOLE chapter, and a section boundary is exactly where a
# duplicate or a restart would sit unseen if each section were checked alone.

def _is_book(v):
    """A shape-B book. Every chapter must be a dict: `scripture-web-data.js` also has a `chapters`
    key, holding 1,189 LISTS, and it is a chapter index rather than a book."""
    return (isinstance(v, dict) and isinstance(v.get("chapters"), list) and v["chapters"]
            and all(isinstance(c, dict) for c in v["chapters"]))


def _books(payload):
    """(label, book) for a shape-B payload: one book, or a map of them."""
    if _is_book(payload):
        yield payload.get("id") or "book", payload
    elif isinstance(payload, dict):
        for k, v in payload.items():
            if _is_book(v):
                yield k, v


def _chapter_rows(ch):
    """One chapter's verse rows, IN DOCUMENT ORDER, across however many sections it is cut into."""
    if isinstance(ch.get("verses"), list):
        return list(ch["verses"])                      # matthew.js: no sections
    return [r for sec in ch.get("sections", []) if isinstance(sec, dict)
            for r in sec.get("verses", [])]


def _rows_anywhere(node, path, out):
    """Every list of `{"n": ...}` rows at any depth, with the path that reached it. Used only to
    prove the two readers above between them cover every file that holds verse rows — a shape this
    gate has never seen must fail here rather than simply not being walked."""
    if isinstance(node, list):
        if node and isinstance(node[0], dict) and "n" in node[0]:
            out.append(path)
            return
        for i, v in enumerate(node):
            _rows_anywhere(v, "%s[%d]" % (path, i), out)
    elif isinstance(node, dict):
        for k, v in node.items():
            _rows_anywhere(v, "%s/%s" % (path, k), out)


def _uncovered(data):
    """Files under `data` holding verse rows that neither reader claims. Takes a directory so the
    bite can point it at a fixture instead of planting a file beside the shipped corpus."""
    covered, uncovered = set(_editions(data)[0]), []
    payloads = {}
    for name in sorted(os.listdir(data)):
        if not name.endswith(".js"):
            continue
        try:
            payloads[name] = _payload(os.path.join(data, name))
        except Exception:                              # noqa: BLE001 - not every .js here is data
            continue
        if list(_books(payloads[name])):
            covered.add(name)
    for name, payload in payloads.items():
        if name in covered:
            continue
        paths = []
        _rows_anywhere(payload, "", paths)
        if paths:
            uncovered.append("%s (verse rows at %s%s)"
                             % (name, ", ".join(paths[:3]), " …" if len(paths) > 3 else ""))
    return uncovered


class VerseNumbering(unittest.TestCase):

    def test_every_chapter_is_strictly_increasing_and_unique(self):
        editions, unknown = _editions()
        self.assertEqual(unknown, [], "unrecognised bible-*.js file(s); classify them here rather "
                                      "than letting the walk skip them silently")
        self.assertTrue(editions, "no editions found — DATA path wrong, which would pass vacuously")

        bad, chapters = [], 0
        for name, payload in editions.items():
            # Anti-vacuity, per edition and RELATIONAL rather than a number in prose: an edition that
            # parsed to something with no books, or a book with no chapters, has to fail here and not
            # quietly contribute nothing to a global total. The Data Builder's note on the first
            # version was right — a floor like "> 8,000 chapters" fails in the direction that blames
            # the data the day the corpus legitimately shrinks, and it would not have caught a single
            # empty edition sitting beside eight full ones anyway.
            self.assertTrue(payload, "%s has no books" % name)
            for book, chs in payload.items():
                self.assertTrue(chs, "%s %s has no chapters" % (name, book))
                for ch, rows in chs.items():
                    chapters += 1
                    for problem in violations(rows):
                        bad.append("%s %s %s: %s" % (name, book, ch, problem))
        self.assertEqual(bad, [], "verse numbering broken in %d place(s)" % len(bad))
        print("\n  %d editions, %d chapters checked" % (len(editions), chapters))

    def test_the_sectioned_books_hold_the_same_rule_across_a_whole_chapter(self):
        """`books.js` (65 books, 1,161 chapters) plus `matthew.js` and `matthew-plain.js` (28 each).
        That is 32,173 rows, and together with `matthew.js`'s 1,071 it is the app's own Bible text:
        30,031 + 1,071 = 31,102, the canon verse count. Checked per WHOLE chapter, sections joined."""
        bad, chapters, rows_seen, files = [], 0, 0, []
        for name in sorted(os.listdir(DATA)):
            if not name.endswith(".js"):
                continue
            try:
                payload = _payload(os.path.join(DATA, name))
            except Exception:                          # noqa: BLE001 - not every .js here is data
                continue
            books = list(_books(payload))
            if not books:
                continue
            files.append(name)
            for label, book in books:
                for ch in book["chapters"]:
                    rows = _chapter_rows(ch)
                    chapters += 1
                    rows_seen += len(rows)
                    for problem in violations(rows):
                        bad.append("%s %s ch%s: %s" % (name, label, ch.get("num"), problem))
        self.assertEqual(bad, [], "verse numbering broken in %d place(s)" % len(bad))
        self.assertTrue(files, "no sectioned books found — the reader stopped matching, and a walk "
                               "that matches nothing reports no violations")
        print("\n  %s: %d chapters, %d rows" % (", ".join(files), chapters, rows_seen))

    def test_no_file_holds_verse_rows_that_neither_reader_covers(self):
        """The coverage arm, and the reason this gate is not just two hand-picked walks.

        `bible-*.js` was the whole of it when it was written, and it missed `books.js` — the app's
        primary text, 30,031 rows — because that file is shaped differently and does not carry the
        prefix. A third shape would be missed the same way. So: find every list of `{"n": ...}` rows
        anywhere under the data folder, and require that each file holding one is claimed by a reader.
        """
        self.assertEqual(_uncovered(DATA), [], "these files hold verse rows that no reader walks")

    def test_the_coverage_arm_and_the_section_join_both_go_red(self):
        """Bites for the two arms added last: neither had been seen to fail.

        The section-join case is the one that matters. Each section alone is clean — 1,2 then 2,3 —
        and only the CONCATENATION shows the duplicate. A reader that checked sections separately
        would report this chapter green, which is precisely the hole the join exists to close.
        """
        import shutil
        import tempfile

        per_section = [[{"n": 1}, {"n": 2}], [{"n": 2}, {"n": 3}]]
        for sec in per_section:
            self.assertEqual(violations(sec), [], "each section alone is clean — the control")
        chapter = {"num": 1, "sections": [{"verses": s} for s in per_section]}
        self.assertTrue(any("duplicate" in v for v in violations(_chapter_rows(chapter))),
                        "the join across sections did not surface the duplicate")

        # And the coverage arm: a file holding verse rows in a shape neither reader claims must fail.
        tmp = tempfile.mkdtemp(prefix="versenum-cov-")
        try:
            with open(os.path.join(tmp, "novel-shape.js"), "w", encoding="utf-8") as fh:
                fh.write('var X = {"deep":{"er":{"still":[{"n":1,"text":"a"}]}}};')
            uncovered = _uncovered(tmp)
            self.assertTrue(any("novel-shape.js" in u for u in uncovered),
                            "a new verse-row shape was not reported: %s" % uncovered)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_the_kjv_is_dense(self):
        """`tools/validate-bible-sync.py` and ci.yml both rest on this: because the KJV numbers every
        chapter 1..len, a dense shipper and a sparse shipper emit identical bytes for brm-kjv, so that
        file cannot catch the indexing bug. If the KJV ever stops being dense, that reasoning changes
        and the comments must change with it."""
        payload = _payload(os.path.join(DATA, "bible-kjv.js"))
        sparse = [
            "%s %s" % (book, ch)
            for book, chs in payload.items()
            for ch, rows in chs.items()
            if [r["n"] for r in rows] != list(range(1, len(rows) + 1))
        ]
        self.assertEqual(sparse, [], "the KJV is no longer dense")

    # --- the planted faults: the checker must go red on each, or it proves nothing above ---

    def test_a_duplicate_verse_number_is_caught(self):
        rows = [{"n": 1}, {"n": 2}, {"n": 2}, {"n": 3}]
        self.assertTrue(any("duplicate" in v for v in violations(rows)), violations(rows))

    def test_an_out_of_order_verse_number_is_caught(self):
        rows = [{"n": 1}, {"n": 3}, {"n": 2}, {"n": 4}]
        self.assertTrue(any("out of order" in v for v in violations(rows)), violations(rows))

    def test_a_real_chapter_with_a_planted_fault_goes_red(self):
        """The same two faults again, but planted into a copy of a REAL chapter — so the case that
        goes red is the shape the walk actually reads, not a four-element hand-made list."""
        payload = _payload(os.path.join(DATA, "bible-web.js"))
        rows = payload["acts"]["8"]                      # the gapped chapter: 1..36, 38..40
        self.assertEqual(violations(rows), [], "the unmodified chapter must be clean — the control")

        duped = [dict(r) for r in rows]
        duped[10]["n"] = duped[9]["n"]
        self.assertTrue(any("duplicate" in v for v in violations(duped)))

        swapped = [dict(r) for r in rows]
        swapped[10]["n"], swapped[11]["n"] = swapped[11]["n"], swapped[10]["n"]
        self.assertTrue(any("out of order" in v for v in violations(swapped)))

    def test_the_classifier_fails_on_anything_it_does_not_recognise(self):
        """The bite for the classifier, which is the half a checker usually forgets to test.

        The first version of `_editions()` let "matched no shape" fall out of the loop, so a data file
        that parsed to `{}` was neither an edition nor an unknown and the whole suite passed green
        over it — the vacuous pass this gate exists to prevent, sitting in the gate. These fixtures
        are written to a temp directory rather than into the real data folder: a test that plants a
        file beside the shipped corpus is one crash away from leaving it there.
        """
        import shutil
        import tempfile

        tmp = tempfile.mkdtemp(prefix="versenum-")
        try:
            def write(n, s):
                with open(os.path.join(tmp, n), "w", encoding="utf-8") as fh:
                    fh.write(s)

            write("bible-good.js", 'var A = {"genesis":{"1":[{"n":1,"text":"x"},{"n":2,"text":"y"}]}};')
            write("bible-sync-good.js", 'var B = {"genesis":{"1":[0,120,240]}};')
            write("bible-empty.js", "var C = {};")
            write("bible-books-no-chapters.js", 'var D = {"genesis":{}};')
            write("bible-wrong-rows.js", 'var E = {"genesis":{"1":["just a string"]}};')
            write("bible-broken.js", "var F = not json at all;")

            editions, unknown = _editions(tmp)
            self.assertEqual(sorted(editions), ["bible-good.js"], "only the real edition is an edition")
            named = " | ".join(unknown)
            for expected in ("bible-empty.js", "bible-books-no-chapters.js",
                             "bible-wrong-rows.js", "bible-broken.js"):
                self.assertIn(expected, named, "%s was skipped silently instead of failing" % expected)
            self.assertNotIn("bible-sync-good.js", named, "a timing file is a known non-edition")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_a_gap_is_not_a_violation(self):
        """The control in the other direction: sparse numbering is legal and must stay legal, or this
        gate would block the WEB, the HNV, the ASV, the BSB and both partial editions."""
        self.assertEqual(violations([{"n": 1}, {"n": 2}, {"n": 4}]), [])


if __name__ == "__main__":
    unittest.main()
