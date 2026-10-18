# Writer brief: title searches

You are writing search queries for a Bible-and-letters reading app (VOTReader). A real reader read a letter or entry
once, about a week ago, and now wants it back. They are on a phone. They type what they remember of its title into the
search box: mostly lowercase, little or no punctuation, never a reference or a number they could not know, never a word
added to help a search engine. You must not know or guess how the app's search works. Write as that reader, not to
please an engine.

For each target, write the ONE query that reader would type, in the form it names.

## Input

A packet: `{"packet", "split", "style": "title", "tier", "targets": [...]}`. Each target is
`{"id", "form", "collection", "title", "opening"}`.
- `title`: the title as written.
- `opening`: the first 300 characters of the text, for context.
- `collection`: the collection it sits in (for `collection-word`).
- `form`: the form to produce (below).

## Output

Reply with ONLY a JSON array, one object per target, in packet order, no prose and no code fences:
`[{"id": "t001", "q": "your query"}, ...]`

## The forms

Examples come from outside this corpus; copy the rule, not the example.

### Easy

**lowercase.** The whole title, lowercase, punctuation removed.
"The Old Man and the Sea" q: `the old man and the sea`

**as-written.** The whole title with its own capitals and punctuation.
"Do Androids Dream of Electric Sheep?" q: `Do Androids Dream of Electric Sheep?`

### Medium

The query's words are the title's words in the title's order with some left out (after folding case and
punctuation), but never the whole title. Two forms are the exception and keep every word: number-swap and
punct-swap change how a word is typed instead of leaving words out.

**article-dropped.** The leading The, A or Regarding dropped. "The Great Gatsby" q: `great gatsby`

**word-dropped.** One word dropped from inside the title.
"The Lion, the Witch and the Wardrobe" q: `the lion the witch and wardrobe`

**memorable-part.** Only the part that sticks: the core of a long title, or its subtitle.
"The Strange Case of Dr Jekyll and Mr Hyde" q: `dr jekyll and mr hyde`

**number-swap.** A number word typed as a digit or back, or a "Part Two" typed "part 2" style.
"Twenty Thousand Leagues Under the Sea" q: `20000 leagues under the sea`

**punct-swap.** A mark inside a word typed differently: an apostrophe moved, dropped or replaced by a space, or a
hyphenated word joined into one. Keep the other words as written. Do not just leave commas, colons or a hyphen out
(that is the easy lowercase form, not this one).
"Alice's Adventures in Wonderland" q: `alices' adventures in wonderland`

### Hard

Keep at least 50% of the title's content words (nouns, verbs, adjectives, names); the query must not be an in-order
subset of the title: something is wrong, moved or misspelled. Do only what the form names. If the bent title turns
into a well-known Bible verse word for word, bend it another way.

**words-wrong.** 1-2 words swapped for a near-twin: a different word, not the same word with another ending (plural,
tense). Same number of words as the title, nothing added, nothing dropped.
"The Old Man and the Sea" q: `the old man and the ocean`

**reordered.** The title's parts in another order, every word kept (The and Regarding too) and none changed. Move
whole parts (the two sides of an "and", a subtitle put first), never single words into an order nobody says.
"The Lion, the Witch and the Wardrobe" q: `the witch the lion and the wardrobe`

**typo.** A typo in 1-2 words of 5 or more letters, the kind a thumb makes: a neighbouring key, a dropped or doubled
letter, two letters swapped. Put it in the word's root, in a word of 5+ letters even without its -s/-ed/-ing ending.
"Wuthering Heights" q: `wuthering hieghts`

**collection-word.** The title or part of it plus a word or phrase from the target's `collection`, as people name
where they read it ("words to live by", "volume 7", "blessed").
"Harry Potter and the Deathly Hallows" (book 7) q: `deathly hallows book 7`

**dropped-wrong.** Two changes, both required: one whole word removed and a different word changed, so the query is
one word shorter than the title and holds a word the title lacks. A swap alone is `words-wrong`.
"The Picture of Dorian Gray" q: `portrait of dorian gray` (The dropped, Picture changed)
"Murder on the Orient Express" q: `murder on orient train` (the dropped, Express changed)

## What memory holds

A week later people keep a title's gist words (the name, the striking noun, the image) and lose or confuse the small
words, the order of a long title, which near-synonym it used, and the punctuation. A hard query still points
unmistakably at that title. It is never a description of the subject ("the letter about pride"), never words from the
opening that are not in the title (except the collection word), and never letter noise: typos look like thumbs on a
phone, wrong words like real misremembering (a synonym, a name or number wrong).

## Pick the part a reader would remember

When a form lets you leave words out or change them, keep what a reader carries away: the distinctive nouns, names
and images. Drop or bend the forgettable words (articles, prepositions,
"Regarding", "A Letter on"), not the word that makes the title. Before you answer, check each query against its form:
medium never types the whole title, hard never becomes an in-order subset, dropped-wrong both drops and changes.
