"""Tests for tools/audio-archive-hashes.py -- the pure reconcile/hash core.

Fixtures only: no real archive, no Drive listing, no network. The script's
main() (threaded hashing of the real archive, census report) is not under
test; only the functions the census is built from are.
"""

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_SPEC = importlib.util.spec_from_file_location(
    "audio_archive_hashes", _HERE / "tools" / "audio-archive-hashes.py")
_mod = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_mod)

audio_hash = _mod.audio_hash
reader_of = _mod.reader_of
letter_side_files = _mod.letter_side_files
joinkey = _mod.joinkey
load_listing = _mod.load_listing
load_live = _mod.load_live


def _synchsafe(n):
    return bytes([(n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F])


def _id3v2(frames, version=b"\x04\x00"):
    # The size field counts only the tag body after the 10-byte header, so
    # the body is 300 bytes of filler (its size spans two synchsafe bytes)
    # and the audio frames follow it.
    tag = bytes(range(256)) + b"\x00" * 44
    return b"ID3" + version + b"\x00" + _synchsafe(len(tag)) + tag + frames


class AudioHashTests(unittest.TestCase):
    FRAMES = bytes(range(256)) * 2  # 512 bytes, spans two synchsafe bytes

    def _write(self, tmp, name, data):
        p = Path(tmp) / name
        p.write_bytes(data)
        return p

    def test_plain_file_hashes_whole_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = self._write(tmp, "a.mp3", self.FRAMES)
            self.assertEqual(audio_hash(p), hashlib.sha1(self.FRAMES).hexdigest())

    def test_id3v2_header_stripped(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = self._write(tmp, "a.mp3", _id3v2(self.FRAMES))
            self.assertEqual(audio_hash(p), hashlib.sha1(self.FRAMES).hexdigest())

    def test_id3v1_trailer_stripped(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = self._write(tmp, "a.mp3", self.FRAMES + b"TAG" + b"\x00" * 125)
            self.assertEqual(audio_hash(p), hashlib.sha1(self.FRAMES).hexdigest())

    def test_both_tags_stripped(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = self._write(tmp, "a.mp3", _id3v2(self.FRAMES) + b"TAG" + b"\x00" * 125)
            self.assertEqual(audio_hash(p), hashlib.sha1(self.FRAMES).hexdigest())

    def test_retagged_file_matches_untagged(self):
        # Same frames under a different ID3v2 version tag hash the same.
        with tempfile.TemporaryDirectory() as tmp:
            plain = self._write(tmp, "a.mp3", self.FRAMES)
            tagged = self._write(tmp, "b.mp3", _id3v2(self.FRAMES, version=b"\x03\x00"))
            self.assertEqual(audio_hash(tagged), audio_hash(plain))


class ReaderOfTests(unittest.TestCase):
    def test_benjamin(self):
        self.assertEqual(reader_of("01 - Letter (read by Benjamin).mp3"), "B")

    def test_bejamin_typo_still_benjamin(self):
        self.assertEqual(reader_of("01 - Letter (read by Bejamin).mp3"), "B")

    def test_benjamin_case_insensitive(self):
        self.assertEqual(reader_of("01 - Letter (Read By BENJAMIN J.).mp3"), "B")

    def test_timothy(self):
        self.assertEqual(reader_of("01 - Letter (read by Timothy).mp3"), "T")

    def test_ai(self):
        self.assertEqual(reader_of("01 - Letter (read by AI voice).mp3"), "M")

    def test_timothy_beats_ai(self):
        self.assertEqual(reader_of("01 - Letter (read by AI Timothy).mp3"), "T")

    def test_no_reader_note_is_volunteer(self):
        self.assertEqual(reader_of("01 - Letter.mp3"), "V")

    def test_unknown_reader_is_volunteer(self):
        self.assertEqual(reader_of("01 - Letter (read by Sarah).mp3"), "V")


class LetterSideFilesTests(unittest.TestCase):
    def _tree(self, tmp):
        root = Path(tmp)
        for rel in (
            "0. ALL LETTERS/a.mp3",
            "1. Foo/a.mp3",
            "1. Foo/sub/b.mp3",
            "7. Bar/a.mp3",
            "10. Ten/a.mp3",
            "13. Thirteen/a.mp3",
            "16. Sixteen/a.mp3",
            "19. Nineteen/a.mp3",
            "9. Nine/a.mp3",
            "UP.MP3",
            "root.mp3",
            "1. Foo/notes.txt",
            "14. Fourteen/a.mp3",
            "17. Seventeen/a.mp3",
            "18. Eighteen/a.mp3",
            "AI Songs of the Letters/a.mp3",
            "The Gospel of John Movie Audio/a.mp3",
            "Trumpeting Materials/a.mp3",
            "_hidden/a.mp3",
            "Other Folder/a.mp3",
        ):
            p = root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b"x")
        return root

    def test_letter_dirs_included_sorted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self._tree(tmp)
            self.assertEqual(letter_side_files(root), [
                "0. ALL LETTERS/a.mp3",
                "1. Foo/a.mp3",
                "1. Foo/sub/b.mp3",
                "10. Ten/a.mp3",
                "13. Thirteen/a.mp3",
                "16. Sixteen/a.mp3",
                "19. Nineteen/a.mp3",
                "7. Bar/a.mp3",
                "9. Nine/a.mp3",
                "UP.MP3",
                "root.mp3",
            ])

    def test_skipped_dirs_and_non_mp3_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self._tree(tmp)
            found = letter_side_files(root)
            for bad in ("14. Fourteen/a.mp3", "17. Seventeen/a.mp3",
                        "18. Eighteen/a.mp3", "AI Songs of the Letters/a.mp3",
                        "The Gospel of John Movie Audio/a.mp3",
                        "Trumpeting Materials/a.mp3", "_hidden/a.mp3",
                        "Other Folder/a.mp3", "1. Foo/notes.txt"):
                self.assertNotIn(bad, found)

    def test_empty_tree(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(letter_side_files(Path(tmp)), [])


class JoinkeyTests(unittest.TestCase):
    def test_fullwidth_chars_map_to_ascii(self):
        self.assertEqual(joinkey("a？b＂c＜d＞e：f｜g＊h＼i"), 'a?b"c<d>e:f|g*h\\i')

    def test_ascii_unchanged(self):
        self.assertEqual(joinkey("1. Foo/a?b.mp3"), "1. Foo/a?b.mp3")


class LoadListingTests(unittest.TestCase):
    def test_missing_file_is_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(load_listing(Path(tmp) / "nope.json"), {})

    def test_records_map_path_to_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "listing.json"
            p.write_text(json.dumps([
                {"path": "1. Foo/a.mp3", "id": "id-a"},
                {"path": "1. Foo/b.mp3", "id": "id-b"},
            ]), encoding="utf-8")
            self.assertEqual(load_listing(p), {
                "1. Foo/a.mp3": "id-a", "1. Foo/b.mp3": "id-b"})

    def test_fullwidth_path_joins_on_ascii_form_first_id_wins(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "listing.json"
            p.write_text(json.dumps([
                {"path": "1. Foo/a？b.mp3", "id": "id-first"},
                {"path": "1. Foo/a?b.mp3", "id": "id-second"},
            ]), encoding="utf-8")
            self.assertEqual(load_listing(p), {"1. Foo/a?b.mp3": "id-first"})


class LoadLiveTests(unittest.TestCase):
    def test_missing_file_is_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(load_live(Path(tmp) / "nope.tsv"), set())

    def test_only_mp3_rows_kept_size_stripped_fullwidth_joined(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "live.tsv"
            p.write_text(
                "1. Foo/a.mp3;12345\n"
                "1. Foo/b.txt;9\n"
                "1. Foo/c？d.mp3;7\n"
                "1. Foo/e.mp3\n"
                "\n",
                encoding="utf-8")
            self.assertEqual(load_live(p), {
                "1. Foo/a.mp3", "1. Foo/c?d.mp3", "1. Foo/e.mp3"})


if __name__ == "__main__":
    unittest.main()
