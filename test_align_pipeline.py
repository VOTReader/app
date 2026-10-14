"""The alignment pipeline's caches and uploads must never keep half a file.

Sweep 2026-10-13 (D:/AgentBackbone/reports/votreader-sweep-2026-10-13/REPORT.md):

  W18  tools/mirror-audio-release.py streamed straight into the staged file and
       counted any size > 0 as done, so an interrupted transfer could go up to
       the append-only audio-v1 release -- a letter that stops early, for good.
  W22  hone-align.ensure_wav / _alignlib.to_wav16k wrote the final path and
       reused anything over 0 / 44 bytes; the transcript cache was keyed by the
       asset id alone, so a release asset REPLACED under its own name (the
       re-upload chain) was timed against the old recording's cached audio.
  W23  a truncated whisper transcript was not cached, but the belt built on it
       was, and is_current never looked: the tail units it could not hear went
       UNSPOKEN (never painted, never flagged) for good.
  W72  hone-verify keyed its probe cache by "_base.16k" for every recording and
       measured letters against the raw belt onset, not the shipped one.

No model, no GPU, no network: subprocess, urllib and the whisper legs are stubs.
"""
import hashlib
import importlib.util
import json
import os
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(ROOT, "tools")
sys.path.insert(0, TOOLS)


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


import _alignlib as al                                                  # noqa: E402

ha = _load("hone_align", "hone-align.py")
hb = _load("hone_bible", "hone-bible.py")
bab = _load("batch_align_bible", "batch-align-bible.py")
hv = _load("hone_verify", "hone-verify.py")


def wav_bytes(seconds=1.0, finished=True):
    """A 16 kHz mono s16le wav as ffmpeg writes it; finished=False leaves the
    size fields as an ffmpeg killed mid-write does (never patched)."""
    data = b"\x01\x00" * int(16000 * seconds)
    riff = 36 + len(data) if finished else 0
    dsz = len(data) if finished else 0xFFFFFFFF
    return (b"RIFF" + struct.pack("<I", riff) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, 16000, 32000, 2, 16)
            + b"data" + struct.pack("<I", dsz) + data)


class FakeFfmpeg:
    """Stands in for subprocess.run: writes a finished wav to the output path
    (argv[-1]); `fail_after` writes half a file there and raises, as a killed
    or failing ffmpeg does."""
    def __init__(self, fail=False):
        self.calls, self.fail = [], fail

    def __call__(self, argv, *a, **k):
        self.calls.append(argv)
        out = argv[-1]
        if self.fail:
            open(out, "wb").write(wav_bytes(finished=False)[:2000])
            raise subprocess.CalledProcessError(1, argv)
        open(out, "wb").write(wav_bytes())
        return subprocess.CompletedProcess(argv, 0, "", "")


class _Tmp(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.d = self._td.name

    def patch(self, obj, name, value):
        old = getattr(obj, name)
        setattr(obj, name, value)
        self.addCleanup(setattr, obj, name, old)


# ---------------------------------------------------------------- W22: wavs --

class ToWavNeverReusesHalfAWav(_Tmp):
    def test_an_unfinished_wav_is_rebuilt(self):
        dest = os.path.join(self.d, "a.wav")
        open(dest, "wb").write(wav_bytes(finished=False))
        ff = FakeFfmpeg()
        self.patch(al.subprocess, "run", ff)
        al.to_wav16k(os.path.join(self.d, "a.mp3"), dest)
        self.assertEqual(len(ff.calls), 1, "a wav ffmpeg never finished was reused")
        self.assertTrue(al.wav_complete(dest))

    def test_a_finished_wav_is_reused(self):
        dest = os.path.join(self.d, "a.wav")
        open(dest, "wb").write(wav_bytes())
        ff = FakeFfmpeg()
        self.patch(al.subprocess, "run", ff)
        al.to_wav16k(os.path.join(self.d, "a.mp3"), dest)
        self.assertEqual(ff.calls, [])

    def test_an_interrupted_conversion_leaves_nothing_at_the_final_path(self):
        dest = os.path.join(self.d, "a.wav")
        self.patch(al.subprocess, "run", FakeFfmpeg(fail=True))
        with self.assertRaises(subprocess.CalledProcessError):
            al.to_wav16k(os.path.join(self.d, "a.mp3"), dest)
        self.assertFalse(os.path.exists(dest), "a half-written wav sits where the next run will reuse it")
        self.assertEqual([f for f in os.listdir(self.d)], [], "the partial file was left behind")


class EnsureWavTrustsOnlyTheReleasesBytes(_Tmp):
    """The release asset's identity is GitHub's sha256 digest of its bytes (refuter r1: a byte
    size misses a same-length re-encode, which audio_rewatch re-uploads under the same name)."""
    BYTES = b"m" * 1000

    def setUp(self):
        super().setUp()
        self.patch(ha, "AUDIO", self.d)
        self.want = {"size": len(self.BYTES), "sha256": hashlib.sha256(self.BYTES).hexdigest()}
        self.real_release_asset = ha.release_asset
        self.patch(ha, "release_asset", lambda fid: self.want)
        self.ff = FakeFfmpeg()
        self.patch(al.subprocess, "run", self.ff)
        self.downloads = []
        self.served = self.BYTES

        def fetch(url, path):
            self.downloads.append(path)
            open(path, "wb").write(self.served)
            return path, {}
        self.patch(ha.urllib.request, "urlretrieve", fetch)
        self.mp3, self.wav = os.path.join(self.d, "F.mp3"), os.path.join(self.d, "F.wav")
        self.src = os.path.join(self.d, "F.src.json")

    def test_a_partial_mp3_at_the_final_path_is_fetched_again(self):
        open(self.mp3, "wb").write(self.BYTES[:400])
        ha.ensure_wav("F")
        self.assertEqual(len(self.downloads), 1, "a cut-off mp3 was converted as it was")
        self.assertEqual(open(self.mp3, "rb").read(), self.BYTES)
        self.assertNotEqual(self.downloads[0], self.mp3, "the download wrote the final path directly")

    def test_a_short_or_wrong_download_raises_and_leaves_nothing(self):
        for served in (self.BYTES[:600], b"n" * 1000):
            self.served = served
            with self.assertRaises(Exception):
                ha.ensure_wav("F")
            self.assertEqual(os.listdir(self.d), [], "a download that is not the release's bytes stayed")

    def test_a_stamped_cache_of_the_same_release_is_reused(self):
        open(self.mp3, "wb").write(self.BYTES)
        open(self.wav, "wb").write(wav_bytes())
        json.dump({"sha256": self.want["sha256"]}, open(self.src, "w"))
        self.assertEqual(ha.ensure_wav("F"), self.wav)
        self.assertEqual((self.downloads, self.ff.calls), ([], []))

    def test_a_replaced_release_asset_rebuilds_every_cache(self):
        old = b"o" * 1000                                       # same length: a re-encode, re-uploaded
        open(self.mp3, "wb").write(old)
        open(self.wav, "wb").write(wav_bytes(2.0))
        open(self.wav + ".sil.json", "w").write("[[0.0, 1.0]]")
        json.dump({"sha256": hashlib.sha256(old).hexdigest()}, open(self.src, "w"))
        ha.ensure_wav("F")
        self.assertEqual(len(self.downloads), 1, "the old recording's mp3 was kept: same size, other bytes")
        self.assertEqual(len(self.ff.calls), 1, "the old recording's wav was kept")
        self.assertFalse(os.path.exists(self.wav + ".sil.json"), "the old recording's silence map was kept")
        self.assertEqual(json.load(open(self.src))["sha256"], self.want["sha256"])

    def test_an_unstamped_wav_is_not_trusted(self):
        open(self.mp3, "wb").write(self.BYTES)
        open(self.wav, "wb").write(wav_bytes(2.0))
        ha.ensure_wav("F")
        self.assertEqual(len(self.ff.calls), 1, "a wav nothing ties to these bytes was reused")

    def test_the_release_listing_gives_size_and_digest(self):
        listing = "\n".join(["A.mp3\t1000\tsha256:" + "a" * 64, "B.mp3\t5\t", "notes.txt\t3\tsha256:" + "b" * 64])

        def gh(argv, **k):
            return subprocess.CompletedProcess(argv, 0, "77\n" if argv[-1] == ".id" else listing + "\n", "")
        self.patch(ha.subprocess, "run", gh)
        self.patch(ha, "_RELEASE", {})
        self.assertEqual(self.real_release_asset("A"), {"size": 1000, "sha256": "a" * 64})
        with self.assertRaises(RuntimeError):
            self.real_release_asset("B")                               # no digest: nothing to vouch for its bytes


# ---------------------------------------------- W22 + W23: the belt's wiring --

class FakeWhisper:
    def __init__(self, data):
        self.data, self.calls = data, []

    def transcribe_words(self, wav, cache_path=None, stamp=None, fill_min=None):
        self.calls.append({"cache": cache_path, "stamp": stamp})
        return dict(self.data)


class FakeMMS:
    def __init__(self, placed):
        self.placed = placed

    def align(self, wav, units):
        return {u["owner"]: {"t": t, "tEnd": t + 0.5, "wordTs": [t]} for u, t in zip(units, self.placed)}


class RunBeltStampsWhatItHeard(_Tmp):
    """run_belt over stub legs: the transcript and silence caches are asked for
    the release asset's identity (W22), and a truncated transcript is written
    into the belt with its unheard tail REVIEW, not UNSPOKEN (W23)."""
    def _run(self, tx):
        frags = [{"bi": i, "cs": 0, "ce": 9, "text": w} for i, w in enumerate(
            ["Alpha beta gamma", "Delta epsilon zeta", "Eta theta iota", "Kappa lambda mu"])]
        self.patch(ha, "HONE", self.d)
        self.patch(ha, "fragments_for", lambda key: (frags, "A"))
        self.patch(ha, "js_object", lambda name: {"AUDIO_MANIFEST": {"one:x": [["F", "B"]]},
                                                   "AUDIO_ALTERNATES": {}}[name])
        self.patch(ha, "ensure_wav", lambda fid: os.path.join(self.d, fid + ".wav"))
        self.patch(ha, "release_asset", lambda fid: {"size": 1234, "sha256": "d1g"})
        self.whisper = FakeWhisper(tx)
        self.patch(ha, "_legs", lambda s: (self.whisper, FakeMMS([1.0, 4.0, 9.0, 12.0])))
        self.sil = []
        self.patch(al, "silence_intervals", lambda wav, stamp=None, **k: self.sil.append(stamp) or [])
        self.patch(al, "probe", lambda *a, **k: (False, []))
        return ha.run_belt("one:x", al.settings_for("letters-A"))

    def test_the_caches_are_asked_for_this_release(self):
        d = self._run({"words": [["alpha", 1.0, 1.3], ["beta", 1.3, 1.6], ["gamma", 1.6, 2.0]], "dur": 14.0})
        self.assertEqual(self.whisper.calls[0]["stamp"], "d1g", "the transcript cache was read by asset id alone")
        self.assertEqual(self.sil, ["d1g"], "the silence map was read by wav path alone")
        self.assertEqual(d["tracks"], ["F"])
        self.assertFalse(d.get("txTruncated"))

    def test_a_truncated_transcript_is_stamped_and_its_tail_is_review(self):
        words = [["alpha", 1.0, 1.3], ["beta", 1.3, 1.6], ["gamma", 1.6, 2.0],
                 ["delta", 4.0, 4.3], ["epsilon", 4.3, 4.6], ["zeta", 4.6, 5.0]]
        d = self._run({"words": words, "dur": 14.0, "truncated": True, "cut": 5.0})
        self.assertEqual(d.get("txTruncated"), [0], "the belt does not say its transcript stopped early")
        status = {r["fi"]: r["status"] for r in d["results"]}
        self.assertNotIn("UNSPOKEN", (status[2], status[3]),
                         "text past the transcript's end was called absent from the recording")


class BeltCallsTheUnheardTailReviewNotUnspoken(unittest.TestCase):
    """_alignlib.belt directly: with tx_cut, a unit leg B never heard is UNSPOKEN
    only where the transcript covered its leg-A onset; past the cut it is REVIEW."""
    def _rows(self, tx_cut):
        units = [{"owner": i, "tokens": ["w%d" % i, "x"], "text": "w x", "ident": {"fi": i}} for i in range(3)]
        A = {0: {"t": 1.0, "tEnd": 1.5, "wordTs": [1.0]}, 1: {"t": 6.0, "tEnd": 6.5, "wordTs": [6.0]},
             2: {"t": 9.0, "tEnd": 9.5, "wordTs": [9.0]}}
        s = dict(al.settings_for("letters-A"), interpolate_missing=False)
        return al.belt(A, {}, units, s, lambda t, txt: (False, []), end_t=12.0, tx_cut=5.0 if tx_cut else None)

    def test_past_the_cut_is_review(self):
        self.assertEqual([r["status"] for r in self._rows(True)], ["UNSPOKEN", "REVIEW", "REVIEW"])

    def test_without_a_cut_nothing_changes(self):
        self.assertEqual([r["status"] for r in self._rows(False)], ["UNSPOKEN"] * 3)


class FakeSeg:
    def __init__(self, words):
        self.words = words


class FakeWord:
    def __init__(self, w, s, e):
        self.word, self.start, self.end = w, s, e


class TranscribeMarksWhereItStopped(_Tmp):
    def test_a_truncated_transcript_carries_its_cut_and_is_not_cached(self):
        def segs():
            yield FakeSeg([FakeWord(" alpha", 1.0, 1.4), FakeWord(" beta", 1.4, 2.25)])
            raise IndexError("size of axis is 0")

        class Info:
            duration = 30.0

        class Model:
            def transcribe(self, *a, **k):
                return segs(), Info()
        leg = al.WhisperLeg(al.settings_for("letters-A"))
        leg._model = Model()
        cache = os.path.join(self.d, "tx.json")
        data = leg.transcribe_words("x.wav", cache, stamp=7)
        self.assertTrue(data.get("truncated"))
        self.assertEqual(data.get("cut"), 2.25, "a truncated transcript does not say where it stopped")
        self.assertFalse(os.path.exists(cache))

    def test_a_corrupt_cache_is_a_miss_not_a_crash(self):
        cache = os.path.join(self.d, "tx.json")
        open(cache, "w").write('{"words": [["alp')

        class Info:
            duration = 3.0

        class Model:
            def transcribe(self, *a, **k):
                return iter([FakeSeg([FakeWord(" alpha", 1.0, 1.4)])]), Info()
        leg = al.WhisperLeg(al.settings_for("letters-A"))
        leg._model = Model()
        data = leg.transcribe_words("x.wav", cache, stamp=7)
        self.assertEqual(data["words"][0][0], "alpha")
        self.assertEqual(json.load(open(cache))["stamp"], 7)


class BibleBeltsOnATruncatedTranscriptAreNotCurrent(_Tmp):
    def test_is_current_refuses_a_truncated_belt(self):
        audio = os.path.join(self.d, "a.mp3")
        open(audio, "wb").write(b"x" * 10)
        verses = os.path.join(self.d, "v.json")
        json.dump({"verses": [{"n": 1, "text": "In the beginning"}]}, open(verses, "w"))
        want = al.settings_hash(al.settings_for("bible-wop-nkjv"))
        vh = al.sha10(json.dumps([[1, "In the beginning"]], ensure_ascii=False, separators=(",", ":")))
        belt = os.path.join(self.d, "b.json")
        base = {"settings_hash": want, "audioSize": 10, "versesHash": vh, "verses": [{"n": 1, "t": 0.5}]}
        json.dump(base, open(belt, "w"))
        self.assertTrue(bab.is_current(belt, want, verses, audio), "control")
        json.dump({**base, "txTruncated": True}, open(belt, "w"))
        self.assertFalse(bab.is_current(belt, want, verses, audio),
                         "a chapter belted on a truncated transcript is current forever")


# ---------------------------------------------------- W18: the release mirror --

mar = _load("mirror_audio_release", "mirror-audio-release.py")


class MirrorUploadsOnlyWholeFiles(_Tmp):
    """main() over stub downloaders and a stub upload: nothing but Drive's own bytes,
    by size and md5 from the daily sweep listing, reaches the append-only release.
    _playable is a stub that passes everything: refuter r1 cut a real release mp3 to
    5,000,000 of its 11,914,052 bytes and ffmpeg decoded it without one error, so the
    decode check cannot be what stops a truncated file."""
    WHOLE = b"x" * 1000

    def setUp(self):
        super().setUp()
        self.uploads = []
        self.patch(mar, "STAGING", self.d)
        self.patch(mar, "manifest_ids", lambda: ["FID"])
        self.patch(mar, "existing_assets", lambda: set())
        self.patch(mar, "release_id", lambda: "1")
        self.patch(mar, "upload_asset", lambda rid, path, name: self.uploads.append((path, open(path, "rb").read()))
                   or subprocess.CompletedProcess([], 0, "", ""))
        self.patch(mar.time, "sleep", lambda s: None)
        self.patch(mar, "RCLONE", os.path.join(self.d, "no-rclone.exe"))
        self.patch(mar, "_cookie_session", lambda: None)
        self.patch(mar, "_playable", lambda p: True)
        self.drive = {"FID": {"size": 1000, "md5": hashlib.md5(self.WHOLE).hexdigest()}}
        self.patch(mar, "drive_files", lambda: self.drive)
        self.patch(sys, "argv", ["mirror-audio-release.py"])
        self.dst = os.path.join(self.d, "FID.mp3")
        self.got = []

    def _serve(self, body):
        def download(id=None, output=None, quiet=True):
            self.got.append(output)
            open(output, "wb").write(body)
            return output
        self.patch(mar.gdown, "download", download)

    def test_a_download_that_dies_part_way_is_never_uploaded(self):
        def dies(id=None, output=None, quiet=True):
            open(output, "wb").write(b"x" * 400)
            raise ConnectionError("reset by peer")
        self.patch(mar.gdown, "download", dies)
        self.assertEqual(mar.main(), 2)
        self.assertEqual(self.uploads, [], "a partial file went up to the append-only release")
        self.assertEqual(os.listdir(self.d), [], "the partial file stayed in staging")

    def test_a_whole_download_is_uploaded(self):
        self._serve(self.WHOLE)
        self.assertEqual(mar.main(), 0)
        self.assertEqual([b for _p, b in self.uploads], [self.WHOLE])

    def test_a_cut_off_download_that_still_decodes_is_never_uploaded(self):
        self._serve(self.WHOLE[:600])                            # gdown returned cleanly with 600 B
        self.assertEqual(mar.main(), 2)
        self.assertEqual(self.uploads, [], "a truncated file went up because it decoded")
        self.assertEqual(os.listdir(self.d), [])

    def test_a_staged_leftover_that_is_not_drives_file_is_fetched_again(self):
        open(self.dst, "wb").write(self.WHOLE[:400])             # left by an older, in-place writer
        self._serve(self.WHOLE)
        self.assertEqual(mar.main(), 0)
        self.assertEqual(len(self.got), 1, "a cut-off staged file was trusted")
        self.assertEqual([b for _p, b in self.uploads], [self.WHOLE])

    def test_same_size_other_bytes_is_not_drives_file(self):
        self._serve(b"y" * 1000)
        self.assertEqual(mar.main(), 2)
        self.assertEqual(self.uploads, [])

    def test_an_id_the_sweep_has_no_size_for_is_refused_before_any_download(self):
        self.drive = {}
        self._serve(self.WHOLE)
        self.assertEqual(mar.main(), 2)
        self.assertEqual((self.got, self.uploads), ([], []), "uploaded bytes nothing could vouch for")


class MirrorDownloadersPromoteOnlyACompleteTransfer(_Tmp):
    def test_the_signed_in_download_checks_content_length(self):
        class Resp:
            headers = {"Content-Type": "audio/mpeg", "Content-Length": "1000"}

            def iter_content(self, n):
                yield b"x" * 600                                  # the connection closed early

        class Session:
            def get(self, *a, **k):
                return Resp()
        dst = os.path.join(self.d, "F.mp3")
        self.assertFalse(mar._download_authed(Session(), "F", dst))
        self.assertEqual(os.listdir(self.d), [], "a short transfer was kept")

    def test_a_failed_rclone_batch_promotes_nothing(self):
        def rclone(args, **k):
            for dest in args[5::2]:
                open(dest, "wb").write(b"x" * 300)               # each transfer cut off
            return subprocess.CompletedProcess(args, 1, "", "  \n")
        self.patch(mar, "STAGING", self.d)
        self.patch(mar.subprocess, "run", rclone)
        self.assertEqual(mar._rclone_batch(["A", "B"]), [])
        self.assertEqual(os.listdir(self.d), [], "a cut-off rclone transfer was kept")

    def test_drive_files_reads_the_sweep_listing(self):
        p = os.path.join(self.d, "listing.json")
        json.dump({"swept": "x", "files": {"A": {"size": 5, "md5": "m"}, "B": {"path": "no size"}}}, open(p, "w"))
        self.patch(mar, "DRIVE_LISTING", p)
        self.assertEqual(mar.drive_files(), {"A": {"size": 5, "md5": "m"}})
        self.patch(mar, "DRIVE_LISTING", os.path.join(self.d, "absent.json"))
        self.assertEqual(mar.drive_files(), {})

    def test_rclone_is_found_on_the_path(self):
        self.patch(mar.shutil, "which", lambda name: r"C:\tools\rclone.exe" if name == "rclone" else None)
        self.assertEqual(mar.find_rclone(), r"C:\tools\rclone.exe")


# ------------------------------------------------------------- W72: verify --

class VerifyMeasuresTheShippedOnsetOfTheRightRecording(_Tmp):
    def test_letters_are_measured_at_ship_t(self):
        belt = os.path.join(self.d, "one__x.large-v3.json")
        json.dump({"results": [{"fi": 0, "t": 5.0, "ship_t": 5.0, "status": "CONFIRMED"},
                               {"fi": 1, "t": 4.2, "ship_t": 5.0, "clamped": True, "status": "PROBED_A"},
                               {"fi": 2, "t": None, "status": "UNSPOKEN"}]}, open(belt, "w"))
        _kind, _meta, units = hv.load_belt(belt)
        self.assertEqual([u["t"] for u in units], [5.0, 5.0, None],
                         "verify measured the raw leg onset, not what the app paints")

    def test_legacy_letter_rows_without_ship_t_still_read_t(self):
        belt = os.path.join(self.d, "old.json")
        json.dump({"results": [{"fi": 0, "t": 5.0, "status": "CONFIRMED"}]}, open(belt, "w"))
        self.assertEqual(hv.load_belt(belt)[2][0]["t"], 5.0)

    def test_the_probe_cache_names_the_recording(self):
        a, b = os.path.join(self.d, "part0.mp3"), os.path.join(self.d, "part1.mp3")
        open(a, "wb").write(b"a" * 100)
        open(b, "wb").write(b"b" * 120)
        ta, tb = hv.audio_tag(a), hv.audio_tag(b)
        self.assertNotEqual(ta, tb, "two recordings share one probe cache")
        self.assertNotIn("base16k", ta)
        c = os.path.join(self.d, "x", "part0.mp3")
        os.makedirs(os.path.dirname(c))
        open(c, "wb").write(b"c" * 140)
        self.assertNotEqual(hv.audio_tag(c), ta, "same name, different bytes, same cache")


if __name__ == "__main__":
    unittest.main()
