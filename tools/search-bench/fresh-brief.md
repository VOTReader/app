You are helping test the search box of a phone app for reading the Bible and a collection of prophetic letters.
People use that box to find again something they read days or weeks ago, typing whatever their memory kept of it.

Below is a JSON list of items. Each item is one thing a reader once read: `remembered` is the part that stuck, inside
the longer `passage` around it; for a whole-letter item there is a `title` and the letter's `text` instead. For each
item, write the one search that reader would type, in the way the item's `style` describes.

Do not open any file, run any command or use any tool: everything you need is in this message. You have never seen
the app or how its search works, and you should not guess at it. Write like a person, not for a machine.

How people type into a phone search box: mostly lowercase, little or no punctuation, no quotation marks, no chapter
and verse numbers, usually 3 to 14 words.

Styles
- exact: they remember a stretch word for word. Copy 6 to 12 consecutive words of `remembered` (the stretch most
  likely to stick, not always the opening); losing capitals and punctuation is fine.
- misremembered: a 6 to 12 word stretch of `remembered`, with one or two honest memory errors in it: a near
  synonym, another tense or number, thee/you or shall/will swapped, a small word added or lost.
- paraphrase: they recall the idea, not the words. Say it in plain modern words, 5 to 14 of them. One or two key
  words may stay, but never more than 4 words in a row from the text.
- rare: only a short striking phrase stayed with them. Give 2 to 4 words exactly as they stand in `remembered`,
  picked because they are unusual (a vivid image, a name, an odd pairing), never a stock phrase.
- gist: describe what the passage is about, the way you would tell a friend "the part where ...", in 5 to 12 words
  with one name or unusual word from it; never more than 4 words in a row from the text.
- middle: `remembered` sits deep inside a long passage. Type 6 to 14 of its words roughly as they come back to
  them: mostly right, at most one small slip.
- crossover, variant kjv: they grew up on the King James Bible. Type 6 to 14 words of the `kjv` wording (with its
  thee, thou, unto, shall and so on) as they remember it from the KJV, not from `remembered`.
- crossover, variant restored-names: they say "YahuShua" where the verse says Jesus (and "The Messiah" for Christ).
  Type 6 to 12 words of the verse with the name swapped.
- title: they half remember the letter's `title`. Give it with one or two words wrong, missing or moved, or only
  the memorable part of a long title; never the title exactly as written.
- firstwords: they remember how the letter opens (`remembered` is its first real sentence, after any opening
  formula such as "Thus says The Lord"). Type its first 5 to 10 words as they recall them.
- typos: a quick, careless phone search. 5 to 10 words from `remembered`, all lowercase, with 1 to 3 real typing
  slips (a neighbouring key, a letter doubled or dropped, a missing apostrophe, two words run together).
- unitgist: they want a whole letter back and remember its subject, not its title. Type 3 to 10 words saying what
  the letter is about; do not reuse the title, and never more than 4 words in a row from the text.

Reply with only a JSON array, one object per item in the order given, and nothing else:
[{"id": "f001", "q": "..."}, ...]

Items:
