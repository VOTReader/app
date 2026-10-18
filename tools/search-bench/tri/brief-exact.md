# Writer brief: exact searches

You are writing search queries for a Bible-and-letters reading app (VOTReader). A real reader read something once, about a
week ago, and now wants it back. They are on a phone. They type what they remember into the search box: mostly
lowercase, little or no punctuation, never a reference ("John 3:16"), never a word added to help a search engine. You
must not know or guess how the app's search works. Write as that reader, not to please an engine.

Here every reader remembers the words exactly. For each target, write the ONE query they would type, in the form it
names.

## Input

A packet: `{"packet", "split", "style": "exact", "tier", "targets": [...]}`. Each target is
`{"id", "form", "collection", "remembered", "passage"}`.
- `remembered`: the sentence the reader remembers. For the form `boundary` it is a two-sentence (or two-verse) span.
- `passage`: the block around it (up to 1,200 characters), for context only. Never take words from outside `remembered`.
- `form`: the form to produce (below).

## Output

Reply with ONLY a JSON array, one object per target, in packet order, no prose and no code fences:
`[{"id": "t001", "q": "your query"}, ...]`

## The forms

Every query is a run copied word for word from `remembered`, in order, nothing added and nothing changed, except that
case and punctuation may drop as a phone types them (and the two forms that say otherwise). Examples come from outside
this corpus on purpose; copy the rule, not the example.

### Easy

**long-run.** 9-14 words, at least 4 content words (nouns, verbs, adjectives, names), and at least half of those content
words from past the sentence's opening.
Lincoln: "...a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal."
q: `conceived in liberty and dedicated to the proposition that all men are created equal`

**short-sentence.** The whole sentence, when it is short. Every word, lowercase, punctuation optional.
Shakespeare: "Brevity is the soul of wit." q: `brevity is the soul of wit`

**pasted-quoted.** The reader pasted the words: the run keeps its own capitals and punctuation and sits inside double
quotation marks. 6-14 words. Dickens: q: `"It was the best of times, it was the worst of times,"`

### Medium

5-8 words, at least 2 content words, from the part of the sentence the form names. One sentence, three forms:
Austen: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife."

**start.** The run begins at the sentence's first word. q: `it is a truth universally acknowledged`

**middle.** The run neither begins at the first word nor ends at the last. q: `single man in possession of a good fortune`

**end.** The run finishes on the sentence's last word. q: `must be in want of a wife`

### Hard

**rare-short.** 3-4 words, at least 2 of them content words: the striking bit that sticks, an odd image, a name, an
unusual pair of words. Shakespeare: "...when we have shuffled off this mortal coil..." q: `this mortal coil`

**common-words.** 5-7 words, at least 60% of them small function words: 3 of 5, 4 of 6, 5 of 7. The small words are
the articles, pronouns and linking words: the, a, an, and, or, but, nor, so, not, no, o, of, to, in, on, at, by, for,
with, from, up, as, that, this, it, i, you, he, she, we, they, me, him, her, us, them, my, your, his, its, our,
their, thee, thou, thy, ye, is, are, was, were, be, been, have, has, had, shall, will, do, did. Any other word is
content (yes, go, along, within).
Lincoln: "...government of the people, by the people..." q: `of the people by the people` (4 of 6)

**boundary.** 6-10 words that run across the end of the first sentence of `remembered` into the start of the second,
typed without the period, at least one word from each. Melville: "Call me Ishmael. Some years ago..."
q: `call me ishmael some years ago`

**typed-forms.** 5-10 words of the run as a phone thumb types it, counted after the change (`&` and a digit are words).
Make at least one of these changes and keep every other word exact: an apostrophe dropped (`dont`, `ill`, `gods`), a
digit for a number word (`7`, `40`, `3rd`), a hyphenated word split or joined (`well known`, `wellknown`), `&` for "and".
Lincoln: "Four score and seven years ago our fathers brought forth..." q: `4 score & 7 years ago our fathers`

## Pick the part a reader would remember

A reader who remembers exactly holds a stretch of real words in their real order, not a whole long sentence, so a run
stops where memory stops. They do not add words, summarise, tidy grammar, or reach into the passage. Inside
`remembered`, choose the stretch that would stay with someone: the striking image, the promise, the warning, the name,
the turn of phrase. Do not default to the sentence's first words unless the form says `start`. Avoid filler ("and then
he said to them that") unless the form is `common-words`, and even then prefer the little-word phrase people quote.

## Before you answer

Count each query's words in your head (never in the reply). A query outside its form's limits is wrong, and one word
over is still over. If a run is too long, cut words from its start or end, never
from its middle, so it stays a real run.
