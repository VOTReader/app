"""A driveFolder edition (tsot-matthew) is indexed from the Drive listing, not a mirror script.

tools/batch-align-bible.py's audio_index() used to load `EDITIONS[ed]["mirror"]` unconditionally;
for tsot-matthew that is None and the call died in _load() -- the edition existed in the registry,
shipped its 28 manifest rows, and could not be aligned. drive_index() reads the SAME listing rows
gen-bible-audio-manifest.mjs ships (so a belt names the asset the app plays), matches local bytes
by BASENAME (the folder name carries full-width quotes on disk and ASCII in the listing), is
case-insensitive on the extension (chapter 1 is the one .MP3), and refuses -- out loud -- a chapter
with an id but no local bytes, and two files claiming one chapter. The fixture carries every one
of those shapes so a regression to "index what you can find" fails here rather than shipping a
27-chapter edition that reads like an archive gap.

The last case is the identity control against the SHIPPED manifest and runs only where the
gitignored listing exists (the generating machine): the 28 ids drive_index() returns must equal
bible-audio-manifest.js's `bible-tsot-matthew:matthew` rows in order.
"""
import importlib.util
import json
import os
import re
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "tools", "batch-align-bible.py")
FOLDER = "18. TSOT New Testament"
DISK_FOLDER = "18. TSOT New Testament (read by ＂Bejamin＂)"      # full-width quotes, as on disk
LIST_FOLDER = '18. TSOT New Testament (read by "Bejamin")'            # ASCII quotes, as in the listing


def load_tool():
    spec = importlib.util.spec_from_file_location("bab_drive", TOOL)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def fixture(tmp, chapters, extra_rows=(), skip_bytes=()):
    """A listing + an archive folder: `chapters` are (n, basename) pairs; every basename gets a
    file on disk unless it is in skip_bytes; extra_rows are appended to the listing verbatim."""
    archive = os.path.join(tmp, "archive")
    os.makedirs(os.path.join(archive, DISK_FOLDER))
    rows = []
    for n, base in chapters:
        rows.append({"path": LIST_FOLDER + "/" + base, "id": "id-%03d" % n})
        if base not in skip_bytes:
            with open(os.path.join(archive, DISK_FOLDER, base), "wb") as f:
                f.write(b"\xff\xfb" + bytes([n]))
    rows += list(extra_rows)
    listing = os.path.join(tmp, "listing.json")
    with open(listing, "w", encoding="utf-8") as f:
        json.dump(rows, f)
    return listing, archive


class DriveIndex(unittest.TestCase):
    def setUp(self):
        self.m = load_tool()
        self.cfg = {"driveFolder": FOLDER, "book": "matthew"}

    def test_indexes_by_basename_case_insensitively_and_skips_non_chapters(self):
        with tempfile.TemporaryDirectory() as tmp:
            listing, archive = fixture(tmp, [(1, "TSOT_Matthew-Chapter-001.MP3"), (2, "TSOT_Matthew-Chapter-002.mp3")],
                                       extra_rows=[{"path": LIST_FOLDER + "/V1.008_Sex (read by text-to-speech - Benjamin).mp3", "id": "id-letter"},
                                                   {"path": "17. Bible-Letter Studies/Purity-ch1.mp3", "id": "id-other"}])
            idx = self.m.drive_index(self.cfg, listing_path=listing, archive_root=archive)
        self.assertEqual(sorted(idx), [("matthew", 1), ("matthew", 2)])
        self.assertEqual(idx[("matthew", 1)][1], "id-001")            # the asset is the Drive id
        self.assertTrue(idx[("matthew", 1)][0].endswith("TSOT_Matthew-Chapter-001.MP3"))   # the .MP3 one
        self.assertIn(DISK_FOLDER, idx[("matthew", 2)][0])              # resolved through the full-width folder name

    def test_refuses_a_chapter_with_an_id_but_no_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            listing, archive = fixture(tmp, [(1, "TSOT_Matthew-Chapter-001.MP3"), (2, "TSOT_Matthew-Chapter-002.mp3")],
                                       skip_bytes=("TSOT_Matthew-Chapter-002.mp3",))
            with self.assertRaises(RuntimeError) as cm:
                self.m.drive_index(self.cfg, listing_path=listing, archive_root=archive)
        self.assertIn("matthew 2", str(cm.exception))
        self.assertIn("id-002", str(cm.exception))

    def test_refuses_two_files_claiming_one_chapter(self):
        with tempfile.TemporaryDirectory() as tmp:
            listing, archive = fixture(tmp, [(1, "TSOT_Matthew-Chapter-001.MP3"), (1, "TSOT_Matthew-Chapter-001.mp3")])
            with self.assertRaises(RuntimeError) as cm:
                self.m.drive_index(self.cfg, listing_path=listing, archive_root=archive)
        self.assertIn("two files claim matthew chapter 1", str(cm.exception))

    def test_audio_index_routes_a_drive_edition_here(self):
        # the dispatch, not the data: a driveFolder edition never reaches the mirror loader
        self.assertIsNone(self.m.EDITIONS["tsot-matthew"]["mirror"])
        self.assertEqual(self.m.EDITIONS["tsot-matthew"]["book"], "matthew")
        self.assertTrue(self.m.EDITIONS["tsot-matthew"].get("driveFolder"))

    @unittest.skipUnless(os.path.exists(os.path.join(HERE, "tools", "_audio-drive-listing.json")),
                         "the Drive listing is gitignored; runs on the generating machine only")
    def test_ids_equal_the_shipped_manifest_rows_in_order(self):
        idx = self.m.audio_index("tsot-matthew")
        with open(os.path.join(HERE, "app", "src", "main", "assets", "src", "data", "bible-audio-manifest.js"), encoding="utf-8") as f:
            src = f.read()
        m = re.search(r'\["bible-tsot-matthew:matthew"\]\s*=\s*(\[.*?\]\]);', src, re.S)
        shipped = [r[0] for r in json.loads(m.group(1))]
        self.assertEqual([idx[("matthew", c)][1] for c in range(1, len(shipped) + 1)], shipped)
        self.assertEqual(len(idx), 28)


if __name__ == "__main__":
    unittest.main()
