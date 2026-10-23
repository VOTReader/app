"""tools/gen-audio-lengths.py: seconds from an MP3's first bytes (downloads brief 2026-10-23, 3d)."""
import importlib.util
import os
import unittest

_spec = importlib.util.spec_from_file_location(
    "gen_audio_lengths", os.path.join(os.path.dirname(__file__), "tools", "gen-audio-lengths.py"))
g = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(g)

# MPEG-1 Layer III, 128 kbit/s, 44.1 kHz, stereo, no padding: 417-byte frames.
HDR = bytes([0xFF, 0xFB, 0x90, 0x00])
FRAME = HDR + bytes(413)


class SecondsOf(unittest.TestCase):
    def test_cbr_is_size_over_bit_rate(self):
        head = bytes(7) + FRAME * 3                     # a little junk before the first frame
        size = 7 + 417 * 1000
        assert abs(g.seconds_of(head, size) - (417 * 1000) * 8 / 128000) < 1e-6

    def test_xing_frame_count_wins(self):
        xing = bytearray(FRAME)
        xing[4 + 32:4 + 32 + 4] = b"Xing"
        xing[4 + 32 + 4:4 + 32 + 8] = (1).to_bytes(4, "big")      # frames field present
        xing[4 + 32 + 8:4 + 32 + 12] = (2000).to_bytes(4, "big")
        head = bytes(xing) + FRAME * 2
        assert abs(g.seconds_of(head, 10_000_000) - 2000 * 1152 / 44100) < 1e-6

    def test_a_lone_sync_word_in_padding_is_not_a_frame(self):
        head = HDR + bytes(50) + FRAME * 3              # 0xFFFB with no frame after it
        assert abs(g.seconds_of(head, 54 + 417 * 10) - (417 * 10) * 8 / 128000) < 1e-6

    def test_no_frame_is_none(self):
        assert g.seconds_of(bytes(4096), 4096) is None


if __name__ == "__main__":
    unittest.main()
