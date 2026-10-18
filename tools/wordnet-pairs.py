"""tools/wordnet-pairs.py - one-word synonym pairs out of a WordNet 3.x database (search200 B7, 2026-10-18).

Reads the WordNet dict directory (index.* and data.* of noun, verb, adj, adv) and writes, one per line,
tab-separated:  word_a  word_b  relation  rank_a  rank_b
  relation  syn: the two words share a synset; sim: a direct similar-to link (an adjective head and its satellite);
            hyp: a direct hypernym link, one word's synset a kind of the other's (tread, walk)
  rank_x    where that synset falls in the word's senses, in WordNet's own order (most frequent first, 1-based)
Only single words of plain letters; each unordered pair once, its closest link kept (syn, then sim, then hyp, then the
lower worst rank). tools/build-wordnet-lex.mjs turns this into the shipped lexicon against the corpus.

Source and license: WordNet 3.1, Princeton University, https://wordnet.princeton.edu/ (download
https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz). WordNet License: use, copy, modify and distribute for any
purpose without fee, provided the copyright notice and the license text (with its disclaimer) appear on all
copies, including modifications; "WordNet 3.1 Copyright 2011 by Princeton University. All rights reserved."
The full notice travels in the generated lexicon file.

The database is downloaded data: run this with python -I, the dict path as an argument, from outside it.
  python -I tools/wordnet-pairs.py <dict dir> <out.tsv>
"""
import os
import re
import sys

POS = (('noun', 'n'), ('verb', 'v'), ('adj', 'a'), ('adv', 'r'))
WORD = re.compile(r'^[a-z]+$')


def clean(w):
    """A data-file word as a plain lowercase word, or None: syntactic markers (a)/(p)/(ip) dropped."""
    w = re.sub(r'\([a-z]+\)$', '', w).lower()
    return w if WORD.match(w) else None


def read_index(path):
    """word -> synset offsets in sense order."""
    out = {}
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            if line.startswith('  ') or not line.strip():
                continue
            p = line.split()
            lemma, pcnt = p[0], int(p[3])
            n_ptr_end = 4 + pcnt
            sense_cnt = int(p[n_ptr_end])
            offs = p[n_ptr_end + 2:n_ptr_end + 2 + sense_cnt]
            out[lemma] = offs
    return out


def read_data(path):
    """offset -> (words, similar-to offsets, direct hypernym offsets in the same part of speech)."""
    out = {}
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            if line.startswith('  ') or not line.strip():
                continue
            head = line.split(' | ', 1)[0].split()
            off = head[0]
            wcnt = int(head[3], 16)
            words = [head[4 + 2 * i] for i in range(wcnt)]
            i = 4 + 2 * wcnt
            pcnt = int(head[i])
            sims = []
            hypers = []
            for k in range(pcnt):
                sym, toff, tpos = head[i + 1 + 4 * k], head[i + 2 + 4 * k], head[i + 3 + 4 * k]
                if sym == '&' and tpos in ('a', 's'):
                    sims.append(toff)
                if sym == '@':
                    hypers.append(toff)
            out[off] = (words, sims, hypers)
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    best = {}

    def offer(a, b, rel, ra, rb):
        if a == b:
            return
        if a > b:
            a, b, ra, rb = b, a, rb, ra
        key = (a, b)
        score = ({'syn': 0, 'sim': 1}.get(rel, 2), max(ra, rb), ra + rb)
        cur = best.get(key)
        if cur is None or score < cur[0]:
            best[key] = (score, rel, ra, rb)

    for name, _ in POS:
        idx = read_index(os.path.join(src, 'index.' + name))
        data = read_data(os.path.join(src, 'data.' + name))
        rank = {}
        for w, offs in idx.items():
            for r, o in enumerate(offs, 1):
                rank[(w, o)] = r
        def words_of(o):
            out = []
            for w in data[o][0]:
                c = clean(w)
                if c and (c, o) in rank and c not in out:
                    out.append(c)
            return out

        for off, (_, sims, hypers) in data.items():
            ws = words_of(off)
            for i, a in enumerate(ws):
                for b in ws[i + 1:]:
                    offer(a, b, 'syn', rank[(a, off)], rank[(b, off)])
            for so in sims:
                if so not in data:
                    continue
                for a in ws:
                    for b in words_of(so):
                        offer(a, b, 'sim', rank[(a, off)], rank[(b, so)])
            # a direct hypernym link (tread, a kind of walk); hyponyms are the same pairs read the other way
            for ho in hypers:
                if ho not in data:
                    continue
                for a in ws:
                    for b in words_of(ho):
                        offer(a, b, 'hyp', rank[(a, off)], rank[(b, ho)])
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        for (a, b) in sorted(best):
            _, rel, ra, rb = best[(a, b)]
            f.write(f'{a}\t{b}\t{rel}\t{ra}\t{rb}\n')
    print(f'[wordnet-pairs] {len(best)} pairs -> {dst}')


if __name__ == '__main__':
    main()
