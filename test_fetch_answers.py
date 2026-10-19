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
  aogcg  (2026-10-19, phase 1a) the scripture links the old converter dropped (2-peter after a book,
         passage.aspx, 1Co), the redirect loop guard, the refusal rule (a shipped paragraph may only
         gain {{ref:}} markers), locate_tokens / UTF-16 offsets, and the sidecars blocks_to_paragraphs
         records beside text that carries no new markup.

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


def _stats():
    """The counters convert_page's pieces write to (main() builds the same dict)."""
    import collections
    return {'refs': 0, 'refs_unparsed': [], 'ref_words_kept': 0, 'topic_links': 0, 'html_headings': 0,
            'attr_wording': collections.Counter(), 'attr_nonstd': [], 'refmeta_versions': collections.Counter(),
            'locate_miss': 0, 'u_runs': 0, 'bare_orphans': 0}


class ScriptureLinks(unittest.TestCase):
    """aogcg phase 1a (2026-10-19): the passages the site links and the old converter dropped. Each of
    these is one of the 15 shipped paragraphs that now gains a {{ref:}} marker in place."""

    def test_a_numbered_book_after_another_book_starts_a_new_ref(self):
        # "psalm 56:5; 2-peter 3:16": "2-peter" begins with a digit, so the old splitter read it as a
        # verse of Psalm 56 and canon_refs threw the part away (eight paragraphs lost 2 Peter 3:16).
        self.assertEqual(fa.split_query_refs('psalm 56:5; 2-peter 3:16'), ['Psalm 56:5', '2 Peter 3:16'])
        self.assertEqual(fa.split_query_refs('Psalms 56:5; 2 Peter 3:16'), ['Psalm 56:5', '2 Peter 3:16'])
        # A verse list after a book still inherits it.
        self.assertEqual(fa.split_query_refs('John 3:16,18'), ['John 3:16', 'John 3:18'])
        self.assertEqual(fa.split_query_refs('2 Kings 19:28,Isaiah 37:29'), ['2 Kings 19:28', 'Isaiah 37:29'])

    def test_biblestudytools_passage_aspx(self):
        url = 'http://www.biblestudytools.com/gnt/john/passage.aspx?q=john+15:1-14'
        self.assertEqual(fa.refs_from_url(url, {}), ['John 15:1-14'])
        self.assertEqual(fa.ref_version(url), 'GNT')
        # Reached through bit.ly, as the site links it.
        self.assertEqual(fa.refs_from_url('http://bit.ly/2Exj0D9', {'http://bit.ly/2Exj0D9': url}), ['John 15:1-14'])

    def test_bible_gateway_abbreviations(self):
        url = 'https://www.biblegateway.com/passage/?search=1Co+5:7-8&version=NKJV'
        self.assertEqual(fa.refs_from_url(url, {}), ['1 Corinthians 5:7-8'])
        self.assertEqual(fa.ref_version(url), 'NKJV')

    def test_a_keyword_search_is_not_a_citation(self):
        self.assertFalse(fa.is_scripture_host('https://www.biblegateway.com/quicksearch/?quicksearch=sabbath', {}))
        self.assertTrue(fa.is_scripture_host('https://www.biblegateway.com/passage/?search=Isaiah%2064%3A5-6&version=NKJV', {}))


class Redirects(unittest.TestCase):
    def test_a_chain_is_followed_to_its_end(self):
        self.assertEqual(fa.follow_redirects('A', {'A': 'B', 'B': 'C'}), 'C')
        self.assertEqual(fa.follow_redirects('X', {'A': 'B'}), 'X')

    def test_a_loop_stops(self):
        self.assertIn(fa.follow_redirects('A', {'A': 'B', 'B': 'A'}), ('A', 'B'))


class RefusalRule(unittest.TestCase):
    """A regeneration may change a shipped paragraph only by inserting {{ref:}} markers into it."""

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, 'answers.js')
        _write_answers(self.path, [
            _entry('holy', ['Christ, our _Passover Covenant of old_.', 'Keep the feast{{ref:John 3:16}}.', 'c']),
        ])

    def _now(self, texts, eid='holy'):
        return [_entry(eid, texts)]

    def test_without_refs_closes_the_run_a_marker_split(self):
        self.assertEqual(fa.without_refs('_Covenant_{{ref:1 Corinthians 5:7-8}}_ of old_'), '_Covenant of old_')
        self.assertEqual(fa.without_refs('**a**{{ref:John 1:1}}** b**'), '**a b**')

    def test_an_inserted_marker_is_the_only_change_allowed(self):
        changed, problems, fields, _size = fa.text_changes(self.path, self._now([
            'Christ, our _Passover Covenant_{{ref:1 Corinthians 5:7-8}}_ of old_.',
            'Keep the feast{{ref:John 3:16}}{{ref:2 Peter 3:16}}.', 'c']))
        self.assertEqual(problems, [])
        self.assertEqual(changed, [('holy', 0, ['1 Corinthians 5:7-8']), ('holy', 1, ['2 Peter 3:16'])])
        self.assertEqual(fields, [])

    def test_a_word_change_a_lost_marker_and_a_new_paragraph_are_refused(self):
        _c, problems, _f, _s = fa.text_changes(self.path, self._now([
            'Christ, our _Passover Covenant of old_!', 'Keep the feast.', 'c', 'd']))
        kinds = sorted(p.split()[0] for p in problems)
        self.assertEqual(kinds, ['LEN', 'TEXT', 'TEXT'])

    def test_only_the_main_page_may_join_and_nothing_may_leave(self):
        _c, problems, _f, _s = fa.text_changes(self.path, self._now(['x'], eid='other'))
        self.assertEqual(sorted(p.split()[0] for p in problems), ['GONE', 'NEW'])
        _c, problems, _f, _s = fa.text_changes(self.path, [
            _entry('holy', ['Christ, our _Passover Covenant of old_.', 'Keep the feast{{ref:John 3:16}}.', 'c']),
            _entry(fa.MAIN_ID, ['Main'])])
        self.assertEqual(problems, [])


class LocateTokens(unittest.TestCase):
    def test_every_span_holds_its_own_words(self):
        tokens = [('t', 'Hear ', ''), ('t', 'My_words', 'b'), ('ref', 'John 3:16'), ('t', ' and\nmore  here', ''),
                  ('t', '', '')]
        out = fa.render_tokens(tokens)
        self.assertEqual(out, 'Hear **My‗words**{{ref:John 3:16}} and\nmore here')
        loc, misses = fa.locate_tokens(out, tokens)
        self.assertEqual(misses, 0)
        got = [[out[s:e] for s, e in spans] for _before, spans in loc]
        self.assertEqual(got, [['Hear'], ['My‗words'], ['{{ref:John 3:16}}'], ['and', 'more here'], []])

    def test_utf16_offsets_count_an_astral_character_twice(self):
        u = fa.U16('a\U0001D50Ab c')
        self.assertEqual([u(0), u(1), u(2), u(3)], [0, 1, 3, 4])
        self.assertEqual(fa.U16('plain')(3), 3)


class SidecarsFromBlocks(unittest.TestCase):
    """Parser -> blocks_to_paragraphs: the paragraph text carries no markup the site's underline, link
    or footnote added; each goes to a sidecar keyed by paragraph index, at a UTF-16 offset."""

    def test_underline_link_note_and_a_bare_scripture_link(self):
        src = ('Hear <u>My words</u> and [[Regarding Prayer|pray]].<sup>1</sup> '
               '[https://www.biblegateway.com/passage/?search=Isaiah%2064%3A5-6&version=NKJV]')
        p = fa.Parser()
        p.feed(fa.wiki_to_html(src))
        p.close()
        side, stats = {}, _stats()
        paras = fa.blocks_to_paragraphs(p.blocks, {}, fa.Matcher([]), stats, side)
        self.assertEqual(paras, [{'align': 'justify', 'text': 'Hear My words and pray.1{{ref:Isaiah 64:5-6}}'}])
        self.assertEqual(side['marks'][0], {'u': [[5, 8]]})
        self.assertEqual(side['links'][0], [{'text': 'pray', 'occ': 0, 'at': 18, '_href': 'wiki:Regarding Prayer'}])
        self.assertEqual(side['notes'][0], [{'marker': '1', 'at': 23, 'after': 'Hear My words and pray.'}])
        self.assertEqual(side['refmeta'], {})   # an NKJV link needs no refMeta
        self.assertEqual(stats['refs'], 1)

    def test_a_non_nkjv_ref_records_its_version_and_link(self):
        src = 'Abide in Me [http://www.biblestudytools.com/gnt/john/passage.aspx?q=john+15:1-14 (John 15:1-14)].'
        p = fa.Parser()
        p.feed(fa.wiki_to_html(src))
        p.close()
        side = {}
        paras = fa.blocks_to_paragraphs(p.blocks, {}, fa.Matcher([]), _stats(), side)
        self.assertEqual(paras[0]['text'], 'Abide in Me{{ref:John 15:1-14}}.')
        self.assertEqual(side['refmeta'][0], [{'i': 0, 'version': 'GNT',
                                               'siteUrl': 'http://www.biblestudytools.com/gnt/john/passage.aspx?q=john+15:1-14'}])


if __name__ == '__main__':
    unittest.main()
