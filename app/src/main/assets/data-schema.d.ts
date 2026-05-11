/* ═══════════════════════════════════════════════════════════════════════════
   data-schema.d.ts — VOTReader-studio Unified Data Schema
   ═══════════════════════════════════════════════════════════════════════════

   PURPOSE
   -------
   This file declares the SINGLE shape that all reader content normalizes to,
   regardless of which source format it came from. The renderer consumes
   this shape exclusively (after Phase 2 lands).

   Source formats currently in use:
     Format A — letters/studies (volume-*.js, lords-rebuke.js, etc.)
                blocks: [{type, segments|lines|text}]
     Format B — devotional (wtlb-*.js, the-blessed.js)
                paragraphs: [{align, text-with-inline-markup}]
     Format C — Bible (books.js, books-restored.js, bible-*.js)
                {bookId: {chapters: [{sections: [{verses}]}]}}
     Format D — Matthew Study Bible (matthew.js)
                {chapters: [{verses: [{n, text-with-embedded-segments}]}]}
     Mixed   — Holy Days (holy-days.js)
                entry.type discriminator: 'wtlb' OR 'letter'

   After Phase 2:
     - All non-Bible content → UnifiedEntry
     - Bible content stays in Format C but has BibleAdapter that returns
       a Block[] view of any chapter (so the same renderer works on both)

   ═══════════════════════════════════════════════════════════════════════════
   STATUS: design document, not yet enforced at runtime.
           Lives next to index.html so editors with TS support can use it
           when editing JS files (via // @ts-check or jsconfig.json).
   ═══════════════════════════════════════════════════════════════════════════ */

// ───────────────────────────────────────────────────────────────────────────
// CORE: Collection, Entry, Block, Segment, Footnote
// ───────────────────────────────────────────────────────────────────────────

/**
 * A logical collection of reading content. Each collection corresponds to one
 * row in the COLLECTIONS registry (src/data/collections.js).
 */
export interface Collection {
  /** Internal stable key (e.g., 'one', 'two', 'wtlb1', 'flock') */
  volKey: string;

  /** Discriminator — drives renderer selection and reading-chain logic */
  kind: 'letter' | 'wtlb' | 'blessed' | 'holy-day' | 'study' | 'bible';

  /** Display label (e.g., 'Volume Two', 'Words To Live By: Part One') */
  label: string;

  /** Short label for boundary-cross navigation (defaults to .label) */
  short?: string;

  /** Label shown when crossing INTO this collection from another family */
  shortFromOutside?: string;

  /** Optional collection-level preface entry (e.g., "A Word of Warning") */
  preface?: UnifiedEntry;

  /** All entries in this collection, in their canonical order */
  entries: UnifiedEntry[];

  /** Shared scripture lookup dict (e.g., WTLB_SCRIPTURES) */
  sharedScriptures?: Record<string, string>;

  /** Optional metadata for search/UI */
  searchVolId?: string;
  cardId?: string;
  readKey?: string;
}

/**
 * A single readable entry. Replaces both Format A "letter" and
 * Format B "WTLB entry" with one shape.
 */
export interface UnifiedEntry {
  /** URL slug (e.g., 'the-wide-path') */
  id: string;

  /** Sequence within collection (1-based; 0 for prefaces) */
  num: number;

  /** Display title */
  title: string;

  /** Optional subtitle (sometimes appears under title in hero) */
  subtitle?: string;

  /** Date string in source format ("3/28/05") — letters only */
  date?: string;

  /** Attribution: who is speaking ("From The Lord, Our God and Savior") */
  from?: string;

  /** Attribution: through whom ("The Word of The Lord Spoken to Timothy") */
  spoken?: string;

  /** Audience line ("For All Those Who Have Ears to Hear") */
  forLine?: string;

  /** Optional preamble shown before main content */
  preamble?: string;

  /** Holy Days re-attribution: where this entry was cross-pulled from */
  sourceLabel?: string;

  /** Body content — uniform Block[] regardless of source format */
  content: Block[];

  /** Numbered footnotes (Format A) — keyed by string id (usually "1", "2", ...) */
  footnotes?: Record<string, Footnote>;

  /**
   * Local NKJV/alt-translation dict (overrides global lookup).
   * Key: ref string ("Isaiah 13:11" or "Psalm 113:7 (ASV)")
   * Value: full verse text (potentially multi-verse with N. markers)
   */
  scriptures?: Record<string, string>;

  /** Audio + video links */
  media?: MediaLinks;

  /** Cross-references and navigation */
  nav?: EntryNav;

  /** User-facing tags (Holy Days topics, future: search facets) */
  tags?: string[];

  /** Discriminator — usually inherits from Collection.kind */
  kind?: 'letter' | 'wtlb' | 'blessed' | 'holy-day' | 'study' | 'hidden';

  /** Bible Studies use parts grouping; chapters reference part nums */
  part?: number;

  /** True if this is a collection preface (not a regular entry) */
  isPreface?: boolean;

  /** Cover image filename (Bible Studies) */
  coverImage?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// BLOCK & SEGMENT — body content tree
// ───────────────────────────────────────────────────────────────────────────

/**
 * A single block of body content. The Block.type discriminator tells the
 * renderer how to lay it out; Block.content (Segment[]) is the actual text.
 */
export interface Block {
  type: BlockType;

  /** Optional anchor id for deep-linking */
  id?: string;

  /** Layout hint for renderer */
  align?: 'left' | 'center' | 'justify';

  /** Heading depth (h2/h3) — only for type='heading' */
  level?: number;

  /** Image source path — for image blocks */
  src?: string;

  /** Image alt text */
  alt?: string;

  /** Image caption */
  caption?: string;

  /** Plain text content — ONLY for type='closing' | 'note' | 'divider' */
  text?: string;

  /** Inline content — for ALL other block types (uniform) */
  content?: Segment[];

  /** Prophecy-card subtype (Matthew Study Bible) */
  cardType?: 'intro' | 'ot' | 'nt' | 'vot';

  /** Optional sub-label for prophecy cards */
  sublabel?: string;
}

export type BlockType =
  | 'paragraph'      // body text run
  | 'poetry'         // verse, indented + italic
  | 'heading'        // h2/h3 section heading (uses level)
  | 'image'          // generic image
  | 'cover-image'    // Bible Study cover
  | 'study-image'    // study diagram
  | 'closing'        // letter sign-off ("Says The Lord.")
  | 'closing-fn'     // closing with attached footnote(s)
  | 'note'           // editorial note (small italic block)
  | 'scripture'      // quoted scripture block
  | 'divider'        // horizontal rule with optional symbol
  | 'prophecy-group' // Matthew Study collapsible cards
  | 'intro';         // preface intro

/**
 * A segment is an inline run of text with optional formatting/linking.
 * Replaces both Format A `{t, v}` segments and Format B inline markup
 * tokens like `_italic_`, `**bold**`, `{{ref:...}}`, etc.
 */
export interface Segment {
  type: SegmentType;

  /** The visible text (or empty for stanza-break/line-break) */
  text?: string;

  /** For type='footnote-ref' — which footnote in entry.footnotes to open */
  footnoteId?: string;

  /** For type='letter-link' — destination letter */
  link?: LetterLink;

  /** For type='scripture-ref' — bible reference */
  ref?: string;

  /** For type='scripture-ref' — explicit translation tag (NKJV, ASV, etc.) */
  translation?: string;

  /** For type='nav-ref' — bible navigation target */
  bookId?: string;

  /** For type='nav-ref' — chapter number */
  chapter?: number;

  /** Nested segments (for emphasis/strong containing other markup) */
  children?: Segment[];
}

export type SegmentType =
  | 'text'            // plain run
  | 'emphasis'        // italic
  | 'strong'          // bold
  | 'caps'            // small-caps style
  | 'footnote-ref'    // numbered footnote bubble
  | 'letter-link'     // cross-collection tap-through
  | 'scripture-ref'   // tappable scripture popup
  | 'nav-ref'         // tappable Bible chapter navigation
  | 'attribution'     // ~ "From X" attribution line
  | 'divider'         // † inline section divider
  | 'stanza-break'    // poetry stanza separator (no text)
  | 'line-break';     // forced line break (no text)

// ───────────────────────────────────────────────────────────────────────────
// FOOTNOTES — numbered bubbles in Format A entries
// ───────────────────────────────────────────────────────────────────────────

/**
 * A numbered footnote attached to an entry. Two main subtypes:
 * - 'scripture' — opens FootnoteSheet showing the cited verse text
 * - 'note' — opens FootnoteSheet showing editorial text + optional link
 */
export interface Footnote {
  /** Footnote number as string ('1', '2', '3', ...) */
  id: string;

  /** Discriminator */
  type: 'scripture' | 'note';

  /** For type='note' — the editorial text shown in the sheet */
  text?: string;

  /** For type='scripture' — bible reference */
  ref?: string;

  /** Translation override (defaults to NKJV) */
  translation?: string;

  /** Optional cross-reference shown in the sheet */
  seeAlso?: SeeAlso;

  /** External URL (mutually exclusive with link) */
  url?: string;

  /** Internal letter link (mutually exclusive with url) */
  link?: LetterLink;
}

/**
 * "See also" pointer attached to a scripture footnote — opens the cited
 * letter in-app via openInAppLetter (back-pill enabled).
 */
export interface SeeAlso {
  collection: string;       // Display label of target collection
  letterTitle: string;      // Full title of target letter
  label?: string;           // Optional override label for the link button
  excerpt?: string;         // Optional excerpt highlighted on arrival
}

/**
 * A cross-collection link descriptor used in footnotes, addendum, and
 * letter-link segments.
 */
export interface LetterLink {
  /** Display label of the source collection (e.g., 'Volume Two') */
  collection: string;

  /** Exact title of the target letter — used to resolve to id at nav time */
  letterTitle: string;

  /** Optional excerpt to highlight on arrival */
  excerpt?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// MEDIA — audio + video links
// ───────────────────────────────────────────────────────────────────────────

export interface MediaLinks {
  audio?: AudioLink[];
  video?: VideoLink[];
}

export interface AudioLink {
  /** Audio service ('bandcamp' | 'soundcloud') */
  service: 'bandcamp' | 'soundcloud';
  /** Full URL */
  url: string;
  /** Optional display label (defaults to service-typical) */
  label?: string;
}

export interface VideoLink {
  /** Video kind ('voice' = read-aloud; 'music' = music-set; 'study' = teaching) */
  kind: 'voice' | 'music' | 'study' | 'other';
  /** Full URL (typically YouTube) */
  url: string;
  /** Optional display label */
  label?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// NAVIGATION — prev/next, related, addendum
// ───────────────────────────────────────────────────────────────────────────

export interface EntryNav {
  /** Previous entry in collection sequence */
  prev?: EntryRef;

  /** Next entry in collection sequence */
  next?: EntryRef;

  /** Related-topics card links (external + internal mix) */
  related?: RelatedLink[];

  /** Bible-studies card links */
  bibleStudies?: RelatedLink[];

  /** Single "Also Read" addendum card */
  addendum?: AlsoRead;
}

export interface EntryRef {
  /** Target id within same collection */
  id: string;
  /** Display title */
  title: string;
}

export interface RelatedLink {
  /** Display label */
  label: string;
  /** External URL (mutually exclusive with link/internalStudy) */
  url?: string;
  /** Internal letter link */
  link?: LetterLink;
  /** Internal Bible Study reference */
  internalStudy?: { studyId: string; chapterId?: string };
}

export interface AlsoRead {
  /** Display text (often quoted title) */
  text: string;
  /** External URL */
  url?: string;
  /** Internal letter link */
  link?: LetterLink;
  /** Same-volume id (when target is in the current collection) */
  internal?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// USER STATE — annotations, notes, links, bookmarks (Phase 5), journal (Phase 5)
// ───────────────────────────────────────────────────────────────────────────

/**
 * A persisted highlight/underline/note segment.
 * Stored in vot-annotations: { [hlKey]: Annotation[] }
 */
export interface Annotation {
  id: string;
  groupId: string;           // shared across multi-segment groups
  kind: 'highlight' | 'underline' | 'note';
  color: HighlightColor;
  text: string;
  start: number;             // char offset within container
  end: number;
  created: number;
  updated: number;
}

export type HighlightColor =
  | 'yellow' | 'green' | 'pink' | 'red' | 'orange'
  | 'blue' | 'purple' | 'teal' | 'brown' | 'gray'
  | 'cyan';                  // legacy alias for teal

/**
 * A note body keyed by groupId.
 * Stored in vot-notes: { [groupId]: NoteRecord }
 */
export interface NoteRecord {
  groupId: string;
  notebookIds: string[];     // [] = uncategorized; multi-membership allowed
  body: string;              // user's note text (may be empty)
  color: HighlightColor;     // matches the segments' color
  fullText: string;          // joined text across all segments
  keys: string[];            // every hlKey the note touches
  created: number;
  updated: number;
}

/**
 * A bidirectional link between two passages.
 * Stored in vot-links: Link[]
 */
export interface Link {
  id: string;
  created: number;
  a: LinkEndpoint;
  b: LinkEndpoint;
}

export interface LinkEndpoint {
  type: 'bible' | 'study' | 'study-letter' | 'letter' | 'wtlb' | 'blessed' | 'holy-days';
  key: string;               // hlKey
  bookId?: string;
  chapter?: number;
  verse?: number;
  letterId?: string;
  entryId?: string;
  studyId?: string;
  studyChapterId?: string;
  text?: string;             // captured text of the linked range
  preview?: string;          // for sidebar display
  start?: number;            // char offset within container
  end?: number;
  label: string;             // display label
}

/**
 * A bookmark — Phase 5.1 feature.
 * Stored in vot-bookmarks: { [id]: Bookmark }
 */
export interface Bookmark {
  id: string;
  hlKey: string;             // location anchor
  label?: string;            // user-supplied name
  start?: number;
  end?: number;
  text?: string;             // captured snippet for preview
  tags?: string[];
  created: number;
  updated: number;
}

/**
 * A journal entry — Phase 5.2 feature.
 * Stored in vot-journal: { [id]: JournalEntry }
 */
export interface JournalEntry {
  id: string;
  date: string;              // YYYY-MM-DD
  title?: string;
  body: string;              // markdown-formatted
  anchors?: string[];        // hlKeys this entry reflects on
  mood?: string;             // optional emoji/tag
  tags?: string[];
  created: number;
  updated: number;
}

/**
 * A notebook — SHIPPED 2026-05-10.
 * Stored in vot-notebooks: { list: Notebook[] }
 *
 * Notebooks deliberately have NO color and NO icon — color belongs to the
 * note (HighlightColor). The notebook is a name-only grouping.
 * (See CLAUDE.md §17.13 for the rationale.)
 */
export interface Notebook {
  id: string;
  name: string;
  sortIndex: number;
  created: number;
  updated: number;
}

// ───────────────────────────────────────────────────────────────────────────
// END
// ───────────────────────────────────────────────────────────────────────────
