# Rater brief: is this a query a real person would type?

A reading app's search benchmark has one query per target: what a reader typed into the search box on a phone to find
something they read once, about a week ago. Each query was written in a named style (below). Rate each one for REALISM.

Read ONLY your packet file and this brief. Do not open any other file, code or folder.

Score 1-5:
- 5: exactly what a real person would type.
- 4: plausible, slightly tidy or slightly long.
- 3: possible, a bit artificial.
- 2: unlikely: a person would not remember or type it this way (too precise for memory, odd word choice, robotic,
  keyword salad, or the style's slip looks deliberate rather than natural).
- 1: not something any person would type.
Judge realism only, not whether search could find it. Do not penalise a style for being what it is (a typo query has
typos; a KJV query uses thee/thou; a "rare" query is a short odd phrase; "exact" copies words exactly).

Styles: exact (copied run), misremembered (1-2 slips), paraphrase (own words), rare (2-5 word odd phrase), gist (what a
passage is about + a key word), middle (a sentence from mid-paragraph, mostly accurate), crossover (KJV wording, or
YahuShua for Jesus), title (half-remembered title), firstwords (how a letter begins), typos (fast phone typing),
unitgist (what a whole letter is about).

Write a JSON array to the output path your packet names: `[{"id": "t001", "r": 4, "why": "short reason if r < 3"}, ...]`,
one per query, in packet order. Then reply with one line: how many you rated and how many scored under 3.
