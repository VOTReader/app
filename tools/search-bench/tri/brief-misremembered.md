# Writer brief: misremembered searches

You are writing search queries for a Bible-and-letters reading app (VOTReader). A real reader read something once, about a
week ago, and now wants it back. They are on a phone. They type what they remember into the search box: mostly
lowercase, little or no punctuation, never a reference ("John 3:16"), never a word added to help a search engine. You
must not know or guess how the app's search works. Write as that reader, not to please an engine.

Here every reader remembers the words slightly wrong. For each target, write the ONE query they would type, in the form
it names, plus the exact words they were trying to recall.

## Input

A packet: `{"packet", "split", "style": "misremembered", "tier", "targets": [...]}`. Each target is
`{"id", "form", "collection", "remembered", "passage"}`.
- `remembered`: the sentence the reader remembers. For the form `merged` it is a two-sentence (or two-verse) span.
- `passage`: the block around it (up to 1,200 characters), for context only.

## Output

Reply with ONLY a JSON array, one object per target, in packet order, no prose and no code fences:
`[{"id": "t001", "q": "what the reader types", "from": "the exact run of remembered being recalled"}, ...]`

`from` is the stretch of `remembered` the query is a memory of, copied word for word (lowercase, punctuation dropped is
fine), first recalled word to last; for `merged` it includes the middle that memory lost.

## Slips

A slip is one word-level change between `q` and `from`: a synonym (perish/vanish), another tense or number
(said/says, man/men), thee/thou/ye for you or back, shall for will or back, a small word dropped or added, a name
swapped. Line `q` up under `from` and count every difference: each word swapped, dropped or added is a slip, and so is
a hyphenated word joined or split (after-life/afterlife). Only case and punctuation are free. Examples come from
outside this corpus; copy the rule, not the example.

### Easy

**one-slip.** Exactly 1 slip, 6-12 words.
Shakespeare: from: `than are dreamt of in your philosophy` q: `than are dreamt of in our philosophy`

### Medium

**two-three-slips.** 2-3 slips, 6-14 words, at least one slip on a content word (noun, verb, adjective, name).
Lincoln: from: `for the people shall not perish from the earth` q: `for the people will not vanish from this earth`

### Hard

Every hard query keeps at least 40% of `from`'s content words and is never a word-for-word run of the target.

**many-slips.** 4 or more slips, 7-16 words, at least 2 of them meaning swaps (synonym, tense or number, name). Register
swaps may be some of the slips, never all: a query bent only by register is the `register` form.
Kipling: from: `if you can keep your head when all about you are losing theirs`
q: `if you keep your cool when everyone around you is losing theirs`

**reordered.** 5-18 words: one clause or phrase lifted whole to the other end, plus up to 2 slips (a dropped or added "and" counts
as one). Move one block, never single words; each part keeps its word order, and the result reads as something a
person would say. Lincoln: from: `with malice toward none with charity for all`
q: `with charity for all and malice toward none`

**register.** 6-16 words, old and new wording swapped throughout: thee/thou/ye for you (or back), -eth/-est for modern
endings (or back), shall/will, saith/says, unto/to, or modern wording made King James-sounding. Swap every place, not
one. Kennedy: from: `ask not what your country can do for you` q: `ask not what thy country can do for thee`

**merged.** The start of the first sentence of `remembered` joined straight to the end of the second, the middle gone,
as two lines run together in memory. A slip or two is fine.
Melville: "Call me Ishmael. ... I would sail about a little and see the watery part of the world."
q: `call me ishmael i would sail about and see the watery part of the world`

**half.** 6-18 words: the first 4-6 words exactly right, then at least 2 content-word slips. The first change comes on word 5, 6
or 7, never later. Frost: from: `two roads diverged in a yellow wood` q: `two roads diverged in a dark forest`

## What memory holds and what it does not

A hard misquote is still recognisably that sentence: the key image, the names and most key words survive. It is never
a paraphrase, summary or keyword list, never edits no person would make (words shuffled out of grammar, invented
words, letter typos).

When `remembered` is a Bible verse, bend this text's own words, never another translation's wording you know (King
James "ass" for this text's "donkey"): a word-for-word match to another translation is a different text, not a
misquote.

## Pick the part a reader would remember

Choose the stretch that would stay with someone: the striking image, the promise, the name, the turn of phrase, not
the opening words unless the form needs them (`half`, `merged`). Put slips on words with common near-twins, not on the
word that makes the sentence.

## Before you answer

Silently count each query's words and slips. One over is wrong (13 words for a cap of 12, 4 slips for 3). Too long: cut an end of both `q` and `from`. Too many slips: put a word back.
