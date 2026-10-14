"""test_build_semantic.py: a rebuild of the meaning pack keeps every unchanged passage's vector (sr8, 2026-10-14).

tools/build-semantic.py embeds through an int8 dynamically quantized model in length-sorted batches of 64, so a
passage's vector depends on its batch: one new passage embedded from scratch moved all 52,854 shipped vectors.
reuse_plan decides which shipped vector each passage keeps, and tools/semantic-units.hashes says which text each
shipped vector was made from. Plain Python, as CI runs it: no model, no numpy.
"""
import importlib.util
import os
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('build_semantic', os.path.join(HERE, 'tools', 'build-semantic.py'))
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)

OLD = [('v1:1', 0, 'a'), ('v1:1', 40, 'b'), ('v2:3', -1, 'c')]


class ReusePlan(unittest.TestCase):
    def test_an_unchanged_pack_keeps_every_vector_in_place(self):
        self.assertEqual(bs.reuse_plan(OLD, OLD), [0, 1, 2])

    def test_one_new_passage_moves_no_other(self):
        new = [OLD[0], ('v1:2', 0, 'new'), OLD[1], OLD[2]]
        self.assertEqual(bs.reuse_plan(OLD, new), [0, None, 1, 2])

    def test_a_text_repeated_across_documents_keeps_each_copy(self):
        old = [('v1:1', 0, 'same'), ('v7:2', 80, 'same')]
        self.assertEqual(bs.reuse_plan(old, old), [0, 1])

    def test_a_moved_text_keeps_a_vector_of_that_text_and_a_changed_one_is_embedded(self):
        new = [('v1:1', 10, 'a'), ('v9:9', 0, 'b'), ('v1:1', 40, 'changed')]
        self.assertEqual(bs.reuse_plan(OLD, new), [0, 1, None])


class Hashes(unittest.TestCase):
    def test_the_hashes_describe_one_pack_only(self):
        with tempfile.TemporaryDirectory() as d:
            prev = bs.HASHES
            bs.HASHES = os.path.join(d, 'semantic-units.hashes')
            try:
                full = [bs.text_hash('In the beginning'), bs.text_hash('was the Word')]
                bs.write_hashes('units-0011aabb.bin', full)
                self.assertEqual(bs.read_hashes('units-0011aabb.bin'), [h[:bs.HASH_HEX] for h in full])
                self.assertIsNone(bs.read_hashes('units-ffffffff.bin'), 'hashes of another pack are not this one\'s')
            finally:
                bs.HASHES = prev

    def test_no_hashes_file_means_none(self):
        prev = bs.HASHES
        bs.HASHES = os.path.join(tempfile.gettempdir(), 'no-such-semantic-units.hashes')
        try:
            self.assertIsNone(bs.read_hashes('units-0011aabb.bin'))
        finally:
            bs.HASHES = prev


if __name__ == '__main__':
    unittest.main()
