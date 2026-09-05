"""The Bible shipper addresses its array by VERSE NUMBER, and must keep doing so.

tools/batch-align-bible.py ships `BIBLE_SYNC_<EDITION>[book][chapter]` as one
array of centiseconds. It writes each belt row at `arr[row["n"] - 1]`, sizes the
array to `max(n)`, and `row["n"]` is the EDITION's own verse number -- which for
some editions is SPARSE. ReadAlongHighlight._bibleRowsFor reads position `i` back
as verse NUMBER `i + 1` and resolves it in the DOM by that number
(`bibleHlKey(book, chapter, n)`), so the two ends agree by verse identity and a
verse either side lacks simply paints nothing.

WHY THIS FILE EXISTS. Two readers concluded on 2026-09-05 that the array was
DENSE -- one slot per row, in row order -- and that it therefore needed a fix to
index it by the app's verse slots. It does not; but the dense reading is the one
that looks right, and writing it would shift every verse after a gap by one for
the rest of the chapter, silently, with every gate in the repo green. Measured
against the real corpus at the time, WEB omits exactly one mid-chapter verse in
each of acts 8 (:37), acts 15 (:34), acts 24 (:7) and luke 17 (:36); today's
shipper places verse 38 of acts 8 at index 37 (CORRECT), a dense shipper places
it at index 36 (WRONG, and so on to the end of the chapter).

The shipped brm-kjv file cannot catch this: KJV is dense in all 1,161 of its
chapters, so `max(n)` and `len(rows)` agree everywhere in it and both shippers
produce identical bytes. The gap is the whole discriminator, so the fixture below
is a real gapped chapter and not a synthetic one.

Not asserted here, deliberately: the array's LENGTH. Padding a short chapter with
trailing zeros is harmless -- an absent slot and a zero slot both paint nothing --
so pinning the length would fail a change that costs the reader nothing. The one
property that must hold is that no index ever carries another verse's time.
"""
import importlib.util
import json
import os
import re
import tempfile
import unittest

ROOT = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "batch_align_bible", os.path.join(ROOT, "tools", "batch-align-bible.py"))
bab = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bab)

# acts 8 as the WEB edition numbers it: verse 37 is absent, and 38-40 keep their
# own numbers rather than closing the gap.
ACTS8_WEB = [n for n in range(1, 41) if n != 37]


def belt(book_id, chapter, verse_numbers):
    """One belt, every verse proven, at a time this test can trace: verse n at
    n.00 seconds, so a slot holding the wrong verse's time is legible as the
    number of the verse it really belongs to rather than as a bare mismatch."""
    return {
        "bookId": book_id,
        "chapter": chapter,
        "settings_hash": "testhash01",
        "verses": [{"n": n, "t": float(n), "status": "CONFIRMED"} for n in verse_numbers],
    }


class ShipIndexesByVerseNumber(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.belts = os.path.join(self.dir.name, "belts")
        os.makedirs(self.belts)
        # ship() writes into DATA -- point it at the temp dir or a test run
        # rewrites the repo's real src/data file.
        self._saved_data = bab.DATA
        bab.DATA = os.path.join(self.dir.name, "data")
        os.makedirs(bab.DATA)
        self.addCleanup(self._restore)

    def _restore(self):
        bab.DATA = self._saved_data

    def _ship(self, *belts):
        for d in belts:
            name = "%s_%03d.json" % (d["bookId"], d["chapter"])
            with open(os.path.join(self.belts, name), "w", encoding="utf-8") as fh:
                json.dump(d, fh)
        bab.ship("web-ebible", self.belts)
        src = open(os.path.join(bab.DATA, "bible-sync-web-ebible.js"), encoding="utf-8").read()
        body = re.search(r"var BIBLE_SYNC_WEB_EBIBLE = (\{.*\});\s*$", src, re.S)
        self.assertTrue(body, "shipper wrote no assignment this test can read")
        return json.loads(body.group(1))

    def test_a_gapped_chapter_keeps_every_verse_at_its_own_number(self):
        arr = self._ship(belt("acts", 8, ACTS8_WEB))["acts"]["8"]
        # The renderer calls index i verse i+1, so this IS the reader's view.
        for n in ACTS8_WEB:
            self.assertEqual(arr[n - 1], n * 100,
                             "index %d should carry verse %d, carries verse %s"
                             % (n - 1, n, arr[n - 1] / 100))
        # The verse this edition does not have paints nothing rather than
        # borrowing its neighbour's onset.
        self.assertEqual(arr[36], 0, "acts 8:37 is absent from WEB and must stay 0")

    def test_a_dense_chapter_is_unaffected(self):
        # The control. Without it the assertion above would also pass on a
        # shipper that had simply stopped writing anything after a gap, and it
        # is the shape every KJV chapter has -- so this is what must not move
        # while the gapped case is being protected.
        arr = self._ship(belt("john", 1, list(range(1, 6))))["john"]["1"]
        self.assertEqual(arr, [100, 200, 300, 400, 500])


class WebNumbersSparselyAndTheAppSlotsAreNkjvs(unittest.TestCase):
    """The corpus half of the same contract, and the reason the shipper is safe.

    The shipper is only correct because WEB PRESERVES verse numbering across its
    omissions -- acts 8 runs 1..36, 38, 39, 40 rather than closing up to 1..39.
    That is a property of `bible-web.js`, so it is checked here against the
    corpus rather than assumed from a design read, and it does not need the
    campaign to have run. `BibleChapterView.renderVerse` takes its slots from
    the books.js (NKJV) skeleton and `translateVerse` only swaps TEXT, keyed by
    `verse.n`, so the on-screen slot set is the same whichever translation the
    reader has chosen -- which is why the app side of the comparison is books.js
    and not the edition the recording is in.

    Measured 2026-09-05 over all 1,189 chapters: WEB diverges from that skeleton
    in exactly six, and KJV in none. The `six` is the positive control -- a
    different number means this is measuring something other than versification.
    """

    # WEB vs the on-screen NKJV skeleton. `absent` are verse numbers the app
    # renders that WEB has no verse for; `extra` are the reverse.
    DIVERGENCES = {
        ("acts", 8):     {"absent": [37], "extra": []},
        ("acts", 15):    {"absent": [34], "extra": []},
        ("acts", 24):    {"absent": [7], "extra": []},
        ("luke", 17):    {"absent": [36], "extra": []},
        ("romans", 14):  {"absent": [], "extra": [24, 25, 26]},
        ("romans", 16):  {"absent": [25, 26, 27], "extra": []},
    }

    @classmethod
    def setUpClass(cls):
        import subprocess
        # One node call, not 1,189: dump both shapes as JSON and compare in
        # Python. books.js is Format C (chapters[].sections[].verses[]) and
        # Matthew lives in matthew-plain.js -- the same two shapes and the same
        # alias tools/extract-bible-verses.mjs owns.
        js = r"""
        const {readFileSync}=require('fs'), {runInNewContext}=require('vm'), {resolve}=require('path');
        const A=resolve('app','src','main','assets','src','data');
        const L=(f,n)=>{const c={};runInNewContext(readFileSync(resolve(A,f),'utf8'),c,{filename:f});return c[n];};
        const app={}; const add=(b,id)=>{for(const ch of b.chapters||[]){const ns=[];
          for(const s of ch.sections||[])for(const v of s.verses||[])ns.push(v.n);
          app[id+'|'+ch.num]=ns.sort((x,y)=>x-y);}};
        const B=L('books.js','BOOKS');
        for(const k of Object.keys(B)){const b=B[k]; if(b&&b.chapters) add(b,b.id||k);}
        add(L('matthew-plain.js','MATTHEW_PLAIN'),'matthew-plain');
        const ed={}; for(const [c,g] of [['web','BIBLE_WEB'],['kjv','BIBLE_KJV']]){
          const d=L('bible-'+c+'.js',g); const o={};
          for(const b of Object.keys(d))for(const ch of Object.keys(d[b]))o[b+'|'+ch]=d[b][ch].map(v=>v.n);
          ed[c]=o;}
        process.stdout.write(JSON.stringify({app,ed}));
        """
        r = subprocess.run(["node", "-e", js], capture_output=True, cwd=ROOT,
                           encoding="utf-8", errors="replace")
        if r.returncode != 0:
            raise unittest.SkipTest("node unavailable or corpus unreadable: "
                                    + (r.stderr or "")[:200])
        cls.corpus = json.loads(r.stdout)

    def _diff(self, code):
        """(book, chapter) -> what this edition lacks / adds vs the app's slots."""
        app, ed = self.corpus["app"], self.corpus["ed"][code]
        out = {}
        for key, ns in ed.items():
            slots = app.get(key)
            if slots is None:
                continue                       # book the reader has no screen for
            have, want = set(ns), set(slots)
            absent, extra = sorted(want - have), sorted(have - want)
            if absent or extra:
                book, ch = key.split("|")
                out[(book, int(ch))] = {"absent": absent, "extra": extra}
        return out

    def test_web_diverges_in_exactly_the_six_known_chapters(self):
        self.assertEqual(self._diff("web"), self.DIVERGENCES)

    def test_an_interior_omission_leaves_a_hole_rather_than_renumbering(self):
        # The property the shipper depends on. An omitted verse in the MIDDLE
        # leaves a hole and the verses after it keep their own numbers, so
        # max(n) is unchanged and ship()'s array already has the app's length
        # with a zero in the hole -- which is why four of the six divergences
        # need no handling at all. If WEB ever closed such a gap, this says so.
        app, web = self.corpus["app"], self.corpus["ed"]["web"]
        checked = []
        for (book, ch), d in self.DIVERGENCES.items():
            key = "%s|%d" % (book, ch)
            interior = [n for n in d["absent"] if n < max(web[key])]
            if not interior:
                continue
            checked.append((book, ch))
            self.assertEqual(max(web[key]), max(app[key]),
                             "%s %d: WEB closed the gap at %s instead of leaving it"
                             % (book, ch, interior))
            self.assertEqual(len(web[key]), len(app[key]) - len(d["absent"]))
        self.assertEqual(sorted(checked), [("acts", 8), ("acts", 15), ("acts", 24), ("luke", 17)])

    def test_a_trailing_omission_shortens_the_range_instead(self):
        # The case the test above deliberately does not cover, named rather than
        # skipped in silence. romans 16 loses its last three verses (the WEB
        # prints that doxology at 14:24-26), so there IS no verse after the
        # omission to keep a number and max(n) legitimately falls short of the
        # app's. The shipper needs nothing for this either: those slots simply
        # get no row and paint nothing, and their audio is in another chapter's
        # file, so there is nothing to point at even in principle.
        app, web = self.corpus["app"], self.corpus["ed"]["web"]
        self.assertEqual(max(web["romans|16"]), 24)
        self.assertEqual(max(app["romans|16"]), 27)
        # ...and its counterpart runs LONGER for the same reason.
        self.assertEqual(max(web["romans|14"]), 26)
        self.assertEqual(max(app["romans|14"]), 23)

    def test_kjv_diverges_nowhere(self):
        # The control. Without it, "six" could be six for any reason the reader
        # of the corpus invented, and this whole comparison would be unfalsified.
        self.assertEqual(self._diff("kjv"), {})


if __name__ == "__main__":
    unittest.main()
