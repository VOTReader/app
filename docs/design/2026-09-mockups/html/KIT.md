# VOTReader mockup kit (HTML renders)

You are drawing high-fidelity mockups of VOTReader screens in the approved **Vesper** design system
(dark) and its **Vellum** light twin. They are PNG renders of HTML, not app code. Work ONLY inside
`screens/` in this directory. Never edit `kit/`, `render.mjs` or anything else.

## Files
- `kit/kit.css` holds the tokens and components. Read it fully before starting.
- `kit/kit.js` sets the theme from `?theme=`, injects the icon sprite and fills `.status` bars.
- `screens/bible-select.html` is the reference screen. Copy its head and structure.
- `node render.mjs <name> [name...]` renders `screens/<name>.html` to `renders/<name>-dark.png` and
  `renders/<name>-light.png`. The server on 127.0.0.1:8095 is already running. A 404 console error
  for favicon is harmless; any other error is yours to fix.

## Page skeleton
```html
<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="../kit/kit.css"><script src="../kit/kit.js"></script>
<style>/* screen-specific styles only, built from the kit tokens (var(--surface) etc.) */</style>
</head><body>
<div class="screen">
  <div class="status"></div>
  ...
</div></body></html>
```
- The portrait phone is 412×915 CSS px. `<body class="landscape">` gives 915×412.
  `<body data-size="1200x800">` gives a spec-sheet canvas of that size.
- Icons: `<i data-i="name"></i>` becomes a Lucide line icon (24px; add class `sm`, `xs` or `lg`).
  Available names: house chevron-left chevron-right chevron-down search x layers history settings sun moon
  bookmark highlighter underline notebook-pen link share-2 copy headphones play pause gauge circle-check
  download book-open library music shuffle notebook plus trash-2 image mic bold italic list type
  sliders-horizontal rotate-ccw rotate-cw skip-back skip-forward calendar clock file-text sparkles lock
  shield-check upload check ellipsis-vertical list-filter arrow-up-down bell wifi battery-full signal
  sticky-note scroll-text graduation-cap message-square-quote book-marked timer square-pen eye heart star
  sunrise feather mail hand flame scripture-web. Use play and pause inside `.playbtn` (filled automatically)
  or add class `fill`.

## The system
- **Dark (Vesper):** true black, filled charcoal surfaces (no outlines), warm ivory text, ONE antique-gold
  accent used sparingly (primary action, selected state, verse numbers, progress).
- **Light (Vellum):** warm paper, cream cards, ink text, ONE oxblood accent. The same HTML renders both
  themes through tokens. Never hard-code a colour that only works in one theme.
- **Type:** titles and reading text in `var(--serif)` (EB Garamond); all UI in `var(--sans)`
  (Atkinson Hyperlegible). Use the kit classes `.display .h1 .h2 .h3 .reading .body .meta .eyebrow .label`.
  No letter-spaced ALL-CAPS headings. `.label` is the only caps style, and only for tiny section labels.
- **Components:** `.row`, `.list`, `.group > .item`, `.card`, `.chip(.on)`, `.seg > span(.on)`, `.toggle(.on)`,
  `.slider > i + b`, `.progress > i`, `.search`, `.btn.primary/.secondary/.text`, `.sheet + .grabber + .scrim`,
  `.readbar > .rb`, `.tabbar > .tb(.on)`, `.mini` + `.playbtn`, `.pill`, `.dot` with `--dot-honey|sage|sky|rose|lavender|clay`,
  highlights `mark.hl-honey` and so on, `.ph` placeholder bars.
- Spacing on an 8pt grid; screen gutter 20px (`.scroll` has it); 16px radii; touch targets of at least 44px.
- Calm and uncluttered. It is a reverent reading app for older readers. Hierarchy comes from type and
  space, not from boxes and ornaments. No glows, no gradients except a subtle one on photo-like thumbnails.

## Text fidelity (strict)
Use ONLY the verbatim scripture, letter and title text given in your brief. Wherever a layout needs
more running text (a letter body, a journal entry, lyrics), draw `.ph` placeholder bars and never
readable invented sentences. UI labels you may write freely. Never attribute words to God, the Bible,
the letters or the songs that are not supplied.

## Workflow
1. Write the screen. 2. Render it. 3. Look at BOTH renders once with the Read tool. 4. Fix what is
visibly wrong: overflow, clipping, collisions, wrong theme colours, anything that doesn't fit the system.
5. Render again. Stop there. Report the file names and anything you could not get right.

## Boards and tall pages (for dense coverage)
- **Board:** `<body data-size="1400x1000">` with `<div class="board">`, a `.board-head` (`.h2` + `.meta`), then
  `.board-grid` (set `grid-template-columns` inline). Each `.cell` has a `.cap` caption and either a component
  drawn at full size, or a scaled phone: `<div class="phone-s"><div class="screen">…full 412×915 screen markup…</div></div>`
  (`.phone-m` is larger). Use boards for small states: toasts, banners, hints, tour stops, empty, loading and
  error states, popovers, menus, and each step of a flow.
- **Tall page:** `<body data-size="412x2600">` + `<div class="screen tall">` for long scrolling screens,
  such as Settings with every group expanded. Size the height to the content.
- Renders use `data-size` exactly, so choose a size that fits the content without a big empty tail.
