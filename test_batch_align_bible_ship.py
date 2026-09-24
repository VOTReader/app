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

The shipped brm-kjv file cannot catch this: KJV is dense in all 1,189 of its
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

    def _ship(self, *belts, idx=None):
        for d in belts:
            name = "%s_%03d.json" % (d["bookId"], d["chapter"])
            with open(os.path.join(self.belts, name), "w", encoding="utf-8") as fh:
                json.dump(d, fh)
        # idx is the audio index; the existing cases pass none (no audio leg, no
        # whole-book leg), the partial-book case passes one built on empty files.
        bab.ship("web-ebible", self.belts, idx=idx)
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

    def test_a_half_aligned_book_ships_whole_or_not_at_all(self):
        # 2026-09-13: the 07:45 deadline stopped chunk 2 at Joshua 10 of 24. A book
        # that ships half-way meets the reader with read-along on ten chapters and
        # silence on fourteen, so ship() holds a PARTIAL book back (by the audio
        # index's chapter list) and names it, while a complete book beside it
        # ships. Bitten by deleting the partial_books() filter: joshua ships.
        # The audio index names every chapter's recording; ship() compares each
        # belt's audioSize with the file on disk, so the fixture has real (empty)
        # files and belts stamped audioSize 0.
        idx = {}
        for book, n in (("joshua", 24), ("ruth", 4)):
            for ch in range(1, n + 1):
                p = os.path.join(self.dir.name, "%s_%03d.mp3" % (book, ch))
                open(p, "wb").close()
                idx[(book, ch)] = (p, "id")
        belts = [belt("joshua", ch, [1, 2, 3]) for ch in range(1, 11)] +                 [belt("ruth", ch, [1, 2]) for ch in range(1, 5)]
        for d in belts:
            d["audioSize"] = 0
        table = self._ship(*belts, idx=idx)
        self.assertNotIn("joshua", table, "10 of 24 Joshua chapters must not ship")
        self.assertEqual(sorted(table.get("ruth", {})), ["1", "2", "3", "4"], "the complete book beside it ships")
        self.assertEqual(bab.partial_books({"joshua": set(range(1, 11)), "ruth": {1, 2, 3, 4}}, idx),
                         {"joshua": (10, 24)})

    def test_a_pinned_chapter_ships_its_proven_rows_below_the_gate_and_only_by_name(self):
        # 2026-09-20: Nehemiah 10 is a seal-list of names the whisper witness is
        # deaf to (19 of 39 proven). The ruling ships the proven rows with the
        # rest dark rather than losing the book; the pin is BY NAME (edition,
        # book, chapter) with a reason, so the same share in any other chapter
        # still ships nothing (the control).
        low = {**belt("nehemiah", 10, [1, 2, 29, 30]), "verseCount": 39, "confirmed": 4, "probed": 0}
        low["verses"] += [{"n": n, "t": None, "status": "UNSPOKEN"} for n in (3, 4, 5)]
        twin = {**belt("ezra", 2, [1, 2, 3, 4]), "verseCount": 39, "confirmed": 4, "probed": 0}
        twin["verses"] += [{"n": n, "t": None, "status": "UNSPOKEN"} for n in (5, 6, 7)]   # the same 4 of 7
        self._saved_pins = dict(bab.GATE_PINS)
        self.addCleanup(lambda: (bab.GATE_PINS.clear(), bab.GATE_PINS.update(self._saved_pins)))
        bab.GATE_PINS.clear()
        bab.GATE_PINS[("web-ebible", "nehemiah", 10)] = "test pin"
        table = self._ship(low, twin)
        self.assertEqual(table["nehemiah"]["10"][:5], [100, 200, 0, 0, 0], "proven rows ship, the unspoken stay 0")
        self.assertEqual(table["nehemiah"]["10"][28:30], [2900, 3000])
        self.assertNotIn("ezra", table, "the same share unpinned ships nothing")
        self.assertIsNone(bab.gate_pin("brm-kjv", low), "a pin names its edition too")

    def test_a_proven_verse_the_recording_opens_on_ships_as_one_centisecond_not_zero(self):
        # 2 Samuel 20:1 in the WOP belts is CONFIRMED at t = 0.00 (the only such
        # row in four editions, 2026-09-13). A 0 slot is what the renderer reads
        # as "unproven" (`if (cs[i] > 0)`), so shipping 0 there is a proven verse
        # that never paints. The pre-registered identity check caught it: 44 zero
        # slots against 43 untimed rows, one name too many.
        d = belt("2samuel", 20, [1, 2, 3])
        d["verses"][0]["t"] = 0.0
        arr = self._ship(d)["2samuel"]["20"]
        self.assertEqual(arr, [1, 200, 300], "verse 1 at the very start ships as 1 cs, never 0")

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



class TheNameTolerantWitnessIsOptInAndNameGuarded(unittest.TestCase):
    """2026-09-22: the strict witness read 20 of Nehemiah 10's 39 verses UNSPOKEN
    with the recording plainly speaking the names ("pashur amariah malkijah" for
    "Pashhur, Amariah, Malchijah"). The tolerant witness lets a proper noun match a
    near hearing -- and ONLY a proper noun: scripture's formulaic lines would
    false-confirm on "there"/"three". It is a per-chapter witness mode outside
    settings_hash (the shipper keys every belt on the family hash), so the belt's
    own `witness` field is what the resume key compares."""

    def setUp(self):
        self.al = bab.al

    def test_only_a_capitalised_name_earns_the_tolerant_match(self):
        al = self.al
        names = al.name_tokens("Pashhur, Amariah, Malchijah, Hattush, Shebaniah, Malluch. "
                               "There were three. Then The Lord said unto Baruch:")
        self.assertEqual(names, {"pashhur", "amariah", "malchijah", "hattush", "shebaniah", "malluch", "baruch"},
                         "short names, sentence openers and the stoplist stay out")
        for heard, want in (("pashur", "pashhur"), ("malak", "malluch"), ("hattish", "hattush"),
                            ("beyrouk", "baruch"), ("miramoth", "meremoth")):
            self.assertEqual(al.tok_match(heard, want, names | {"meremoth"}), "name", (heard, want))
            self.assertIsNone(al.tok_match(heard, want), "strict stays strict")
        self.assertTrue(al.name_alike("there", "three"), "the sounds alike -- which is exactly the danger")
        self.assertIsNone(al.tok_match("there", "three", names), "not a name: no tolerance")
        self.assertIsNone(al.tok_match("zechariah", "zaccur", names | {"zaccur"}), "a real mishearing stays a miss")
        self.assertEqual(al.tok_match("amariah", "amariah", names), "exact", "the strict kinds come first")

    def test_an_iah_name_heard_ending_ia_is_a_near_hearing(self):
        """2026-09-24: Ezra 10:35-36 (WOP) stayed dark under the tolerant witness. Whisper heard "binaya
        bidia" for "Benaiah, Bedeiah" and "venaya" for "Vaniah": the heard -ia ending lacks the name's final
        h, so the skeletons differed ("bn"/"bnh") and the spellings fell under 0.8. Tolerance 2: when the
        NAME ends -iah, a heard -ia gets the h and the consonant skeletons must then agree. Dropping the h
        instead would have made "zechariah" and "zaccur" one skeleton ("zkr")."""
        al = self.al
        names = al.name_tokens("Benaiah, Bedeiah, Cheluh, Vaniah, Meremoth, Eliashib, Zaccur, Zechariah")
        for heard, want in (("binaya", "benaiah"), ("bidia", "bedeiah"), ("venaya", "vaniah")):
            self.assertEqual(al.tok_match(heard, want, names), "name", (heard, want))
            self.assertIsNone(al.tok_match(heard, want, names, iah=False), "tolerance 1 did not hear it")
            self.assertIsNone(al.tok_match(heard, want), "strict stays strict")
        self.assertIsNone(al.tok_match("binaya", "bedeiah", names), "the next name in the list stays apart")
        self.assertIsNone(al.tok_match("zechariah", "zaccur", names), "a real mishearing stays a miss")
        self.assertIsNone(al.tok_match("bunni", "benaiah", names | {"bunni"}), "the -iah ending is not dropped")

    def test_the_iah_rule_never_touches_a_name_without_the_h(self):
        """Codex refuter, 2026-09-24, against the first tolerance 2 (it wrote EVERY final -ia as -iah):
        whisper's "binia" (WOP 1 Chr 8:37, cached) stopped hearing "Binea" -- the h it was given made
        the skeletons differ -- and "uriah" started hearing "Uzzia" (1 Chr 11:41/44, two men) because
        "uziah"/"uriah" reach the 0.8 ratio. The h now goes only to a heard form set against an -iah
        name, and then only an exact skeleton counts."""
        al = self.al
        names = al.name_tokens("Binea, Rapha, Uzzia, Uriah, Ashterathite, Nogah, Nepheg, Japhia")
        self.assertEqual(al.tok_match("binia", "binea", names), "name", "tolerance 1's hearing is kept")
        self.assertIsNone(al.tok_match("uriah", "uzzia", names), "Uriah is not Uzzia")
        self.assertIsNone(al.tok_match("uzzia", "uriah", names), "nor the other way")
        self.assertEqual(al.tok_match("jephiah", "japhia", names), "name",
                         "the other direction: WEB 1 Chr 3:7 heard 'jephiah' for 'Japhia' (cached)")
        self.assertIsNone(al.tok_match("jephiah", "japhia", names, iah=False))
        self.assertTrue(al.probe_ok("binea rapha".split(), "binia rapha".split(), names, tolerant=True))
        self.assertFalse(al.probe_ok("the son of uzzia".split(), "the son of uriah".split(), names, tolerant=True))

    def test_the_tolerance_is_stamped_and_an_older_one_is_not_current(self):
        """How the tolerant witness matches is an input of its belts, so the resume key covers it: a
        tolerant belt from an older version (no stamp = 1, c61; or 2) re-aligns on the next
        --name-tolerant run. Strict belts never use it and carry no stamp."""
        al = self.al
        self.assertEqual(al.witness_stamp(al.settings_for("bible-wop-nkjv")), {"witness": "strict"})
        self.assertEqual(al.witness_stamp(al.settings_for("bible-wop-nkjv", name_tolerant=True)),
                         {"witness": "name-tolerant", "tolerance": al.TOLERANCE})
        self.assertEqual(al.TOLERANCE, 3)
        with tempfile.TemporaryDirectory() as td:
            audio = os.path.join(td, "a.mp3")
            open(audio, "wb").write(b"x" * 10)
            verses = os.path.join(td, "v.json")
            json.dump({"verses": [{"n": 1, "text": "Benaiah, Bedeiah, Cheluh,"}]}, open(verses, "w"))
            want = al.settings_hash(al.settings_for("bible-wop-nkjv"))
            vh = al.sha10(json.dumps([[1, "Benaiah, Bedeiah, Cheluh,"]], ensure_ascii=False, separators=(",", ":")))
            belt_path = os.path.join(td, "b.json")
            base = {"settings_hash": want, "audioSize": 10, "versesHash": vh, "verses": [{"n": 1, "t": 0.5}]}
            json.dump({**base, "witness": "name-tolerant"}, open(belt_path, "w"))
            self.assertFalse(bab.is_current(belt_path, want, verses, audio, "name-tolerant"), "c61's re-aligns")
            json.dump({**base, "witness": "name-tolerant", "tolerance": 2}, open(belt_path, "w"))
            self.assertFalse(bab.is_current(belt_path, want, verses, audio, "name-tolerant"), "so does 2's")
            json.dump({**base, "witness": "name-tolerant", "tolerance": al.TOLERANCE}, open(belt_path, "w"))
            self.assertTrue(bab.is_current(belt_path, want, verses, audio, "name-tolerant"))
            json.dump({**base, "witness": "strict"}, open(belt_path, "w"))
            self.assertTrue(bab.is_current(belt_path, want, verses, audio), "a strict belt needs no stamp")

    def test_the_mode_lives_in_the_belt_not_the_settings_hash(self):
        al = self.al
        strict = al.settings_for("bible-wop-nkjv")
        tolerant = al.settings_for("bible-wop-nkjv", name_tolerant=True)
        self.assertEqual(al.settings_hash(strict), al.settings_hash(tolerant),
                         "one family hash: the shipper must keep taking the other 1,188 belts")
        with tempfile.TemporaryDirectory() as td:
            audio = os.path.join(td, "a.mp3")
            open(audio, "wb").write(b"x" * 10)
            verses = os.path.join(td, "v.json")
            json.dump({"verses": [{"n": 1, "text": "In the beginning"}]}, open(verses, "w"))
            want = al.settings_hash(strict)
            vh = al.sha10(json.dumps([[1, "In the beginning"]], ensure_ascii=False, separators=(",", ":")))
            belt_path = os.path.join(td, "b.json")
            base = {"settings_hash": want, "audioSize": 10, "versesHash": vh, "verses": [{"n": 1, "t": 0.5}]}
            json.dump(base, open(belt_path, "w"))
            self.assertTrue(bab.is_current(belt_path, want, verses, audio), "a belt before the field is strict")
            self.assertFalse(bab.is_current(belt_path, want, verses, audio, "name-tolerant"),
                             "asking for the tolerant witness re-aligns a strict belt")
            json.dump({**base, **al.witness_stamp(tolerant)}, open(belt_path, "w"))
            self.assertTrue(bab.is_current(belt_path, want, verses, audio, "name-tolerant"))
            self.assertFalse(bab.is_current(belt_path, want, verses, audio),
                             "and a strict run does not keep a tolerant belt")


def _v1_fold(w):
    w = w.replace("ch", "k").replace("ck", "k").replace("ph", "f").replace("c", "k")
    w = w.replace("y", "i").replace("j", "i")
    return re.sub(r"(.)\1+", r"\1", w)


def _v1_skel(w):
    f = _v1_fold(w)
    return f[0] + re.sub(r"[aeiou']", "", f[1:])


def _v1_tok_match(a, b, names=None):
    """tok_match as tolerance 1 (c61, be364ece) shipped it, frozen here so no later edit to
    _alignlib can move the oracle along with the code it judges."""
    import difflib
    if a == b:
        return "exact"
    if len(a) > 4 and len(b) > 2 and (a.startswith(b) or b.startswith(a)):
        return "prefix"
    if names and b in names and len(a) >= 5 and len(b) >= 5 and (
            _v1_skel(a) == _v1_skel(b) or difflib.SequenceMatcher(None, _v1_fold(a), _v1_fold(b)).ratio() >= 0.8):
        return "name"
    return None


def _v1_probe(want, heard, names=None):
    """The probe's scan before tolerance 3, copied verbatim, on tolerance 1's hearing."""
    hi = matched = content_matched = 0
    for w in want:
        j = hi
        while j < len(heard) and not _v1_tok_match(heard[j], w, names):
            j += 1
        if j < len(heard):
            matched += 1
            if len(w) >= 4:
                content_matched += 1
            hi = j + 1
    content_have = sum(1 for w in want if len(w) >= 4)
    content_ok = content_matched >= min(2, content_have) if content_have else True
    return (matched >= max(2, len(want) - 2)) and content_ok


class TheTolerantWitnessAsksASecondQuestionWithBetterEars(unittest.TestCase):
    """Tolerance 3 (2026-09-24). When no leg passes the probe's question, the name-tolerant witness asks a
    second: the same greedy scan, hearing a name -ia for -iah (name_alike's iah rule) and a KJV spelling
    the modern way ("labouring"/"laboring", "shewed"/"showed"). Tolerant runs only: the strict witness,
    and every strict belt, keep the old scan byte for byte.

    The first tolerance 3 took the most words any in-order matching found instead. Two refuters (Codex,
    then Opus) broke it in exactly the chapters this witness serves: a king list's neighbour verse,
    another man's name by the 0.8 ratio, a leg a word late beating the right one, a trimmed opening lit
    2 s late. Each of their inputs is a test here."""

    def setUp(self):
        self.al = bab.al

    def test_a_kjv_spelling_and_its_modern_twin_fold_together(self):
        al = self.al
        for kjv, modern in (("labouring", "laboring"), ("neighbour", "neighbor"), ("honour", "honor"),
                            ("favour", "favor"), ("labourers", "laborers"), ("honourable", "honorable"),
                            ("saviour", "savior"), ("savour", "savor"), ("dishonour", "dishonor"),
                            ("armourbearer", "armorbearer"), ("sheweth", "showeth"), ("shewed", "showed"),
                            ("fulness", "fullness"), ("brake", "break"), ("aught", "ought")):
            self.assertEqual(al.spelling_fold(kjv), al.spelling_fold(modern), (kjv, modern))
        for w in ("our", "ours", "your", "yours", "four", "hour", "pour", "the", "lord", "word",
                  "devour", "devoured", "scour", "scoured", "flour"):
            self.assertEqual(al.spelling_fold(w), w, "an ordinary word is never folded")

    def test_two_different_words_never_fold_together(self):
        """Codex refuter, 2026-09-24: a rule on every -our made "scoured" "scored", and a verse
        heard as "and he scored all the land" passed for "And he scoured all the land"."""
        al = self.al
        self.assertNotEqual(al.spelling_fold("scoured"), al.spelling_fold("scored"))
        self.assertFalse(al.probe_ok("and he scoured all the land".split(),
                                     "and he scored all the land".split(), tolerant=True))

    def test_a_neighbour_verse_of_the_same_formula_is_not_the_verse(self):
        """The refuters' neighbour windows (1 Chronicles, real hearings). "And when Bela was dead, Jobab
        ..." then "And when Jobab was dead, Husham ...": probed at v44's start for v45, a most-words
        matching takes and/when/was/dead and leaves both names out. The scan's order says no: it spends
        a word on its later mention and runs out of window. Same for "the sons of simeon were" heard for
        "And the sons of Shimon were" (another man, one 0.8 ratio away) and for Lotan heard in the
        previous verse's list."""
        al = self.al
        names = al.name_tokens("And when Bela was dead, Jobab the son of Zerah of Bozrah reigned in his stead. "
                               "And when Jobab was dead, Husham of the land of the Temanites reigned in his stead. "
                               "And when Husham was dead, Hadad the son of Bedad reigned in his stead. "
                               "The sons of Simeon were Nemuel and Jamin, Jarib. The sons of Shimon were Amnon. "
                               "The sons of Seir; Lotan, and Shobal, and Zibeon. And the sons of Lotan; Hori.")
        v44 = "and when bela was dead jobab the son of zerah".split()
        v45 = "and when jobab was dead husham of the land of the temanites".split()
        for want, heard in (("and when jobab was dead husham", v44),
                            ("and when husham was dead hadad", v45),
                            ("and when baal hanan was dead", "and when samlah was dead shaul of rehoboth by the "
                             "river reigned in his stead and when shaul was dead baal".split()),
                            ("and the sons of shimon were", "the sons of simeon were nemuel and jamin jerib".split()),
                            ("and the sons of lotan hori", "the sons of seir lotan and shobel and zibion".split())):
            self.assertFalse(al.probe_ok(want.split(), heard, names, tolerant=True), want)
        self.assertTrue(al.probe_ok("and when jobab was dead husham".split(), v45, names, tolerant=True),
                        "at its own start the verse still passes")
        rows = self.belt({100.0: v44, 130.0: "reigned in his stead and when husham".split()},
                         "And when Jobab was dead, Husham of the land", names)
        self.assertEqual(rows[0]["status"], "REVIEW", "dark, not v44's start")

    def belt(self, heard_at, text, names, tA=100.0, tB=130.0, first_spoken=0, wts=None):
        """One verse through al.belt with legs at tA / tB (disagreeing), the probe answering from
        heard_at[t] as probe() does: (ok, heard, second question), `want` from the text belt hands it."""
        al = self.al
        s = al.settings_for("bible-wop-nkjv", name_tolerant=True)
        nrm = al.normalizer(s)

        def probe_fn(t, expect):
            want, h = [nrm(w) for w in al.spoken_words(expect)][:6], heard_at[t]
            ok = al.probe_ok(want, h, names)
            return ok, h, not ok and al.second_chance(want, h, names)

        units = [{"owner": 0, "tokens": al.spoken_words(text), "text": text, "ident": {"n": 1}}]
        A = {0: {"t": tA, "tEnd": tA + 4, "score": 0.9, "wordTs": wts or [tA]}}
        B = {0: {"t": tB, "tEnd": tB + 4, "hit": 9, "tot": 9, "firstSpoken": first_spoken}}
        return al.belt(A, B, units, s, probe_fn)

    def test_the_second_question_never_moves_a_stamp_the_first_proves(self):
        """A leg that passes only the second question must not beat a leg the first one proves: asked in
        one breath with A first, the first tolerance 3 moved 6 of the 19 PROBED_B verses of the tolerant
        belts to a leg A a word late (WOP Exodus 36:1: "bezalel and aholiab" for "And Bezalel and
        Aholiab"). The belt asks both legs the first question, then the second."""
        al = self.al
        text = "Benaiah, Bedeiah, Cheluh,"
        names = al.name_tokens(text + " Vaniah")
        ears = "binaya bidia kela vinaya".split()
        rows = self.belt({100.0: ears, 130.0: "benaiah bedeiah cheluh vaniah".split()}, text, names)
        self.assertEqual((rows[0]["status"], rows[0]["t"]), ("PROBED_B", 130.0))
        self.assertNotIn("secondChance", rows[0])
        self.assertTrue(al.second_chance("benaiah bedeiah cheluh".split(), ears, names),
                        "A does pass the second question: only the order keeps it out")

    def test_a_verse_neither_leg_proves_takes_the_second_question(self):
        al = self.al
        text = "And he shewed me Joshua the high priest standing before the angel of the LORD,"
        rows = self.belt({1.76: "and he showed me joshua the high priest standing before the angel".split(),
                          8.0: "standing before the angel of the lord and satan standing".split()},
                         text, al.name_tokens(text), tA=1.76, tB=8.0)
        self.assertEqual((rows[0]["status"], rows[0]["t"], rows[0].get("secondChance")), ("PROBED_A", 1.76, True))

    def test_a_trimmed_opening_gets_no_second_question(self):
        """Opus refuter, 2026-09-24: whisper's transcript of WEB Ezekiel 36 misses 0-30 s, so leg B took
        v3's spoken "prophesy and say" for unspoken (firstSpoken 5) and the looser matcher lit v3 at "the
        Lord Yahweh", 2.1 s late, where it had painted 0.7 s early by interpolation. A trimmed opening
        can be junk (the belt says so of BRM Psalm 3 v2): no second question on it."""
        al = self.al
        text = "The sleep of a labouring man is sweet, whether he eat little or much"
        heard = {9.5: "the sleep of a laboring man is sweet whether he eat little".split(),
                 10.0: "sleep of a laboring man is sweet whether he eat little or".split(),
                 20.0: "but the abundance of the rich will not suffer him to sleep".split()}
        rows = self.belt(heard, text, None, tA=9.5, tB=20.0, first_spoken=1, wts=[9.5, 10.0])
        self.assertEqual(rows[0]["status"], "REVIEW")
        rows = self.belt(heard, text, None, tA=9.5, tB=20.0, first_spoken=0, wts=[9.5, 10.0])
        self.assertEqual((rows[0]["status"], rows[0]["t"], rows[0].get("secondChance")), ("PROBED_A", 9.5, True))

    def test_the_residue_verses_it_can_hear_now_pass_tolerant_only(self):
        al = self.al
        ezra = al.name_tokens("Benaiah, Bedeiah, Cheluh, Vaniah, Meremoth, Eliashib, Mattaniah, Mattenai, Jaasai")
        chron = al.name_tokens("Nogah, Nepheg, Japhia, Elishama, Eliada, Eliphelet")
        for ref, want, heard, names in (
                ("BRM Eccl 5:12", "the sleep of a labouring man", "the sleep of a laboring man is sweet whether he eat little", None),
                ("BRM Job 12:4", "i am as one mocked of his neighbour", "i am as one mocked of his neighbor who calleth upon god", None),
                ("BRM Rev 22:1", "and he shewed me a pure", "and he showed me a pure river of water of life clear", None),
                ("WOP Ezra 10:35", "benaiah bedeiah cheluh", "binaya bidia kela vinaya murama elashib matan", ezra),
                ("WOP Ezra 10:36", "vaniah meremoth eliashib", "venaya murama eliashib mataniah matanai jsi", ezra),
                ("WEB 1 Chr 3:7", "nogah nepheg japhia", "and noga and nepheg and jephiah and elishema and elias", chron)):
            w, h = want.split(), heard.split()
            self.assertFalse(al.probe_ok(w, h, names), f"{ref}: the first question still says no")
            self.assertTrue(al.probe_ok(w, h, names, tolerant=True), f"{ref}: the second hears it")
        for ref, want, heard in (
                ("BRM 1Kgs 17:2", "and the word of the lord", "and a word of the lord came unto him saying get thee"),
                ("WEB Ezek 14:1", "then came certain of the elders", "then some of the elders of israel came to me and sat")):
            self.assertFalse(al.probe_ok(want.split(), heard.split(), tolerant=True),
                             f"{ref}: the scan's own limit stays; the matcher that lit it also lit wrong windows")

    def test_the_guards_still_hold_when_tolerant(self):
        al = self.al
        self.assertFalse(al.probe_ok("and the word of the lord".split(),
                                     "and the lord said unto moses speak unto the children".split(), tolerant=True),
                         "a formulaic line matching only function words and one content word is not the verse")
        self.assertFalse(al.probe_ok("the sleep of a labouring man".split(), "a man".split(), tolerant=True))
        self.assertFalse(al.probe_ok("the sleep of a labouring man".split(), [], tolerant=True))

    # Words for the random tests: formula and function words, KJV twins, and names with their hearings
    # (-ia for -iah, a name with no h, two men one ratio apart, a king list's neighbours).
    VOCAB = ["the", "and", "of", "a", "lord", "word", "came", "when", "dead", "unto", "labouring", "laboring",
             "neighbour", "neighbor", "man", "benaiah", "binaya", "binea", "binia", "uzzia", "uriah", "uzziah",
             "jobab", "bela", "husham", "zechariah", "zaccur"]
    NAMES = frozenset({"benaiah", "binea", "uzzia", "uriah", "jobab", "bela", "husham", "zechariah", "zaccur"})

    def test_strict_is_the_old_scan_and_tolerant_never_says_no_where_tolerance_1_said_yes(self):
        """Against tolerance 1 FROZEN in this file (_v1_probe): the first version of this test ran the old
        scan on the live tok_match, so it could not see the -ia rule costing "binia" its "Binea" (Codex)."""
        import random
        al = self.al
        rng = random.Random(924)
        for k in range(6000):
            want = [rng.choice(self.VOCAB) for _ in range(rng.randint(1, 9))]
            heard = [rng.choice(self.VOCAB) for _ in range(rng.randint(0, 14))]
            names = set(self.NAMES) if k % 2 else None
            self.assertEqual(al.probe_ok(want, heard), _v1_probe(want, heard), (want, heard))
            self.assertEqual(al.probe_ok(want, heard, names), _v1_probe(want, heard, names), (want, heard))
            if _v1_probe(want, heard, names):
                self.assertTrue(al.probe_ok(want, heard, names, tolerant=True), (want, heard, names))

    def test_the_second_question_is_the_old_scan_where_the_ears_agree(self):
        """Not a looser scan: with no -ia/-iah pair and no KJV twin among the words, the second question
        answers exactly as tolerance 1 did."""
        import random
        al = self.al
        vocab = ["the", "and", "of", "a", "lord", "word", "came", "when", "dead", "unto", "man", "sons",
                 "binea", "binia", "jobab", "bela", "husham", "zaccur", "hattush", "hattish", "simeon", "shimon"]
        names = {"binea", "jobab", "bela", "husham", "zaccur", "hattush", "shimon"}
        rng = random.Random(3)
        for _ in range(6000):
            want = [rng.choice(vocab) for _ in range(rng.randint(1, 9))]
            heard = [rng.choice(vocab) for _ in range(rng.randint(0, 14))]
            self.assertEqual(al.second_chance(want, heard, names), _v1_probe(want, heard, names), (want, heard))


class TheVersesCacheFollowsTheCorpus(unittest.TestCase):
    """verses_json() caches one chapter's reference text for is_current() to hash. It used to trust a
    cached file forever, so after a corpus text fix a belt compared its versesHash with the OLD text,
    read as current, and was never re-run. Now a cached chapter older than the extractor or the corpus
    file its translation reads is extracted again; nothing else invalidates it."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = self.tmp.name
        self.src = [os.path.join(self.d, "extract-bible-verses.mjs"), os.path.join(self.d, "bible-kjv.js")]
        for p in self.src:
            open(p, "w").close()
        self.ran = []
        self._saved = (bab.verses_sources, bab.subprocess)

        def run(argv, **kw):                  # the extractor: writes the chapter file it is handed
            self.ran.append(argv)
            with open(argv[4], "w", encoding="utf-8") as f:
                json.dump({"verses": [{"n": 1, "text": "v%d" % len(self.ran)}]}, f)
            return type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()
        bab.verses_sources = lambda translation: list(self.src)
        bab.subprocess = type("S", (), {"run": staticmethod(run)})
        bab._SOURCES_MTIME.clear()

    def tearDown(self):
        bab.verses_sources, bab.subprocess = self._saved
        bab._SOURCES_MTIME.clear()
        self.tmp.cleanup()

    def age(self, path, seconds_ago):
        t = os.path.getmtime(path) - seconds_ago
        os.utime(path, (t, t))

    def verses(self):
        return bab.verses_json("brm-kjv", "genesis", 1, os.path.join(self.d, "verses"))

    def test_a_fresh_cache_is_reused_and_a_moved_corpus_refreshes_it(self):
        p = self.verses()
        self.assertEqual(len(self.ran), 1)
        for s in self.src:
            self.age(s, 60)                   # the corpus predates the cache
        bab._SOURCES_MTIME.clear()
        self.assertEqual(self.verses(), p)
        self.assertEqual(len(self.ran), 1, "a cache newer than its sources is reused")
        self.age(p, 3600)                     # a corpus fix lands after the cache was written
        bab._SOURCES_MTIME.clear()            # (a new run)
        self.verses()
        self.assertEqual(len(self.ran), 2, "a cache older than its corpus is extracted again")
        self.assertEqual(json.load(open(p, encoding="utf-8"))["verses"][0]["text"], "v2")

    def test_a_changed_extractor_refreshes_it_too(self):
        p = self.verses()
        self.age(self.src[1], 60)
        self.age(p, 30)                       # newer than the corpus, older than the extractor
        bab._SOURCES_MTIME.clear()
        self.verses()
        self.assertEqual(len(self.ran), 2)

    def test_no_source_on_disk_never_trusts_a_cache(self):
        for s in self.src:
            os.remove(s)
        bab._SOURCES_MTIME.clear()
        self.verses()
        self.verses()
        self.assertEqual(len(self.ran), 2)

    def test_the_sources_are_the_extractors_own_files_for_every_edition(self):
        """Identity against the real tree: each edition's translation names files that exist, so the
        cache watches what extract-bible-verses.mjs actually reads (its three branches)."""
        for ed, cfg in bab.EDITIONS.items():
            srcs = self._saved[0](cfg["translation"])
            self.assertTrue(srcs[0].endswith("extract-bible-verses.mjs"), ed)
            for p in srcs:
                self.assertTrue(os.path.exists(p), f"{ed}: {p}")


if __name__ == "__main__":
    unittest.main()
