"""test_fetch_answers.py — the Answers converter's two guards (2026-09-25, improvement sweep n5-04 / n5-08).

Stdlib unittest, no network: the converter module is loaded from tools/fetch-answers.py and its
pure pieces are exercised directly.

  n5-08  paragraph_shifts(): highlights key on a paragraph's INDEX (wtlb:<id>:<n>), so a
         regeneration that inserts or drops a paragraph above a reader's mark moves the mark onto
         other words. c62 did it to Regarding Spiritual Gifts from paragraph 88 on and only a
         screenshot caught it; the converter now refuses to write such a file without
         --accept-shift. In-place edits and changes after the last kept paragraph move nothing.
  n5-04  Matcher.blessed_by_lines(): a bare The_Blessed link resolved to the Introduction every
         time; the entry holding the passage's lines wins now.

Run: py -3.13 -m unittest test_fetch_answers
"""
import importlib.util
import json
import os
import tempfile
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('fetch_answers', os.path.join(_HERE, 'tools', 'fetch-answers.py'))
fa = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fa)


def _entry(eid, texts):
    return {'id': eid, 'paragraphs': [{'align': 'justify', 'text': t} for t in texts]}


def _write_answers(path, entries):
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// GENERATED\nvar ANSWERS = [\n')
        for i, e in enumerate(entries):
            f.write(json.dumps(e, ensure_ascii=False) + (',\n' if i < len(entries) - 1 else '\n'))
        f.write('];\n')


class ParagraphShifts(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, 'answers.js')
        _write_answers(self.path, [
            _entry('gifts', ['=Heading=\nFor as in one body', 'b', 'c', 'd']),
            _entry('prayer', ['p0', 'p1', 'p2']),
        ])

    def test_an_inserted_paragraph_above_kept_ones_is_a_shift(self):
        # The c62 shape: a raw heading that shared a paragraph splits in two, so b, c, d move down.
        now = [_entry('gifts', ['**Heading**', 'For as in one body', 'b', 'c', 'd']), _entry('prayer', ['p0', 'p1', 'p2'])]
        shifts = fa.paragraph_shifts(self.path, now)
        self.assertEqual(shifts, [('gifts', 1, 2, 3)])

    def test_edits_in_place_and_a_dropped_tail_are_not(self):
        now = [_entry('gifts', ['**Heading**', 'b', 'c']),   # paragraph 0 edited, "d" dropped from the end
               _entry('prayer', ['p0', 'p1 edited', 'p2'])]
        self.assertEqual(fa.paragraph_shifts(self.path, now), [])

    def test_a_new_topic_or_no_file_is_not(self):
        self.assertEqual(fa.paragraph_shifts(self.path, [_entry('new', ['x'])]), [])
        self.assertEqual(fa.paragraph_shifts(os.path.join(self.dir, 'absent.js'), [_entry('gifts', ['z'])]), [])


class BlessedByLines(unittest.TestCase):
    def setUp(self):
        blessed = {'volKey': 'blessed', 'label': 'The Blessed', 'registryLabel': 'The Blessed', 'kind': 'blessed', 'entries': [
            {'id': 'introduction', 'title': 'Introduction', 'text': 'Blessed are those who hear My voice.'},
            {'id': 'walk', 'title': 'Blessed Are Those Who Walk in My Ways',
             'text': 'Blessed are those who walk in My ways,\nFor they shall inherit the earth.\n_Keep My commandments_ always.'},
        ]}
        self.m = fa.Matcher([blessed])

    def test_the_entry_holding_the_passage_wins(self):
        hit = self.m.blessed_by_lines(['"Blessed are those who walk in My ways,\nfor they shall inherit the earth."'])
        self.assertEqual(hit[1]['id'], 'walk')
        got = self.m.match('https://www.thevolumesoftruth.com/The_Blessed', ['Keep My commandments always.'])
        self.assertEqual(got['title'], 'Blessed Are Those Who Walk in My Ways')

    def test_no_match_falls_back_to_the_introduction(self):
        got = self.m.match('https://www.thevolumesoftruth.com/The_Blessed', ['Words that appear nowhere at all.'])
        self.assertEqual(got['title'], 'Introduction')
        got = self.m.match('https://www.thevolumesoftruth.com/The_Blessed')
        self.assertEqual(got['title'], 'Introduction')


if __name__ == '__main__':
    unittest.main()
