# The three design branches every item is explored in (round 1).
COMMON = ("Render as a crisp, flat, full-bleed Android phone screen UI mockup, front view, portrait orientation, "
          "no hands, no desk, no perspective, no device photo; very thin rounded phone outline at most. "
          "Real, legible, correctly spelled text. Professional product-design quality (Apple Design Award / Material Design showcase level). "
          "Calm, reverent, uncluttered; strong typographic hierarchy; generous whitespace; consistent 8-pt spacing; "
          "touch targets at least 48 dp; WCAG AA contrast. No emoji, no stock photos, no people, no crosses or church clip-art, no logos.")

A = ("Design language 'Vesper' (refined true-black): OLED true-black background (#000000) with slightly raised charcoal surfaces "
     "(#0F0F0E to #161512); NO gold outlined boxes - surfaces separate by fill and spacing, with faint hairline dividers (#23201B) only. "
     "Primary text warm ivory (#EFE8DA), secondary text warm grey (#9C9488). ONE restrained antique-gold accent (#D4AF5A) used sparingly: "
     "the primary action, the selected state, small verse numbers. Typography: an elegant high-contrast book serif (like EB Garamond / Cormorant) "
     "for titles in Title Case (no letter-spaced all-caps headlines), a clean humanist sans-serif (like Inter) for UI labels and metadata. "
     "16 dp corner radius. Quiet luxury, like a premium edition Bible app.")

B = ("Design language 'Vellum' (warm light, editorial): warm paper background (#F5F0E6), cream cards (#FBF8F2) with barely-visible soft shadows, "
     "deep ink text (#1E1A15), secondary text (#6B6257); ONE accent of deep oxblood red (#7B2D26) for the primary action, verse numbers and selection; "
     "fine gilt hairline rules (#B89A5B) used only as dividers. Typography: classic book typography - a refined old-style serif (like EB Garamond) "
     "for headings and reading text, small caps for tiny labels, a quiet sans (like Source Sans) only for dense metadata. "
     "Feels like a finely typeset leather-bound Bible reimagined as a modern app.")

C = ("Design language 'Stillwater' (modern calm): contemporary, highly legible UI in the spirit of iOS 18 and Material 3 Expressive. "
     "Deep blue-slate dark background (#0F1519) with layered surfaces (#172026, #1E2930), primary text off-white (#E8EEF0), secondary (#94A3AB); "
     "one muted accent soft sage-teal (#7FB8A4) plus a warm sand (#D8C39A) highlight. Typography: a modern grotesk sans (like Inter / SF Pro) for all UI, "
     "a readable serif only for scripture and letter text. Rounded 20 dp cards, big comfortable touch targets, a bottom navigation bar with 4 labelled tabs "
     "(Home, Read, Listen, Library), friendly minimal line icons (1.75 px stroke), subtle depth.")

DIRS = {'A': A, 'B': B, 'C': C}

FIDELITY = 'TEXT FIDELITY (strict): use ONLY the exact wording supplied in this spec for any scripture, letter, lyric or dedication text. Wherever the layout needs more running text than supplied, render it as soft grey placeholder lines (greeked bars), never as readable sentences. Never write new sentences attributed to God, the Bible, the letters or the songs. UI labels may be written freely.'
