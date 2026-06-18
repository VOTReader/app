/* ═══════════════════════════════════════════════════════════════════════
   pager-preview — INERT neighbor previews for the finger-follow page swipe
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-d.js (imported by
   ScreenLayout). Renders the prev/next page that PEEKS in during a swipe.

   HARD INVARIANT — annotation-safety:
     A peek is a throwaway, non-interactive glimpse of a neighbor page. It
     must be INVISIBLE to every annotation pass. The imperative passes
     (annotation-engine applyDOMHighlights/applyNoteIcons, dom-links,
     dom-bookmarks) all scan `document.querySelectorAll('[data-hl-key]
     [data-hl-dom]')` / `[data-hl-dom] …` document-wide. The React verse
     annotations (HighlightableText/LinkIcon/BookmarkIcon) subscribe to the
     annotation stores. So every renderer here:
       • emits NO `data-hl-dom` and NO `data-hl-key`,
       • renders NO `<mark>` / `.fn-ref` / `.wtlb-cite` / link/bookmark icons,
       • uses NO store-subscribing component (no HighlightableText / Segments /
         LinkIcon / BookmarkIcon) and NO React effects.
     Emphasis (em/strong/caps) and plain text are kept for visual fidelity —
     those carry no annotation hooks. Footnote bubbles + interactive refs are
     flattened to inert text or dropped. The pager-preview.test.jsx suite pins
     this invariant.

   DOES NOT OWN: the gesture/transform (use-pager-gesture.js) or the pager
   DOM wiring (ScreenLayout.jsx). This file is pure + presentational.
   ═══════════════════════════════════════════════════════════════════════ */

import { splitFormatBInline } from '../../utils/format-b-inline.js';

// ── Format A (letters): inert {t,v} segment render ──────────────────────────
// Mirrors LetterView's Segments output MINUS every annotation/interaction hook:
// emphasis kept, footnote bubbles dropped, stanza-break → <br>, letter-link
// flattened to its plain text. No data-hl-*; nothing subscribes.
function previewSegments(segments) {
  if (!Array.isArray(segments)) return null;
  return segments.map((s, i) => {
    if (!s) return null;
    const t = s.t, v = s.v || '';
    if (t === 'fn') return null;                       // footnote bubble — drop
    if (t === 'stanza-break') return <br key={i} />;
    if (t === 'italic') return <em key={i}>{v}</em>;
    if (t === 'bold-italic') return <strong key={i}><em>{v}</em></strong>;
    if (t === 'caps') return <span key={i} className="caps">{v}</span>;
    return <React.Fragment key={i}>{v}</React.Fragment>; // text + letter-link → plain
  });
}

/** Flat plain-text of a {t,v} segment array (footnote/stanza dropped). */
export function segmentsToPlainText(segments) {
  if (!Array.isArray(segments)) return '';
  return segments
    .filter((s) => s && s.t !== 'fn' && s.t !== 'stanza-break')
    .map((s) => s.v || '')
    .join('');
}

/** Inert render of a letter's blocks (Format A). */
export function PreviewLetterBody({ blocks }) {
  if (!Array.isArray(blocks)) return null;
  return blocks.map((block, bi) => {
    if (block.type === 'intro') return <p key={bi} className="letter-intro">{previewSegments(block.segments)}</p>;
    if (block.type === 'para') return <p key={bi} className="letter-para">{previewSegments(block.segments)}</p>;
    if (block.type === 'heading') return <h2 key={bi} className={`study-heading study-heading-l${block.level || 2}`}>{block.text}</h2>;
    if (block.type === 'poetry') {
      const lines = block.lines
        ? block.lines.map((line, li) => <div key={li} className="poetry-line">{previewSegments(line)}</div>)
        : (block.segments || []).map((seg, li) => (
            <div key={li} className="poetry-line">{previewSegments([{ ...seg, v: (seg.v || '').replace(/^\n/, '') }])}</div>
          ));
      return <div key={bi} className="letter-poetry">{lines}</div>;
    }
    if (block.type === 'closing') return <div key={bi} className="letter-closing">{block.text}</div>;
    if (block.type === 'closing-fn') return <div key={bi} className="letter-closing-fn">{previewSegments(block.segments)}</div>;
    return null; // prophecy-group / cover-image / study-image → skipped in a peek
  });
}

// ── Format B (WTLB / Blessed): inert inline render ──────────────────────────
// Mirrors WtlbEntryView.renderLine MINUS the interactive elements: emphasis
// kept; {{ref:…}} → inert "(ref)" text; {{nav:…}} → inert "[bookId ch]" text;
// attribution + plain text rendered literally with \n → <br>.
function previewFormatBLine(text) {
  const parts = splitFormatBInline(text);
  return parts.map((seg, si) => {
    if (!seg) return null;
    if (seg.startsWith('**') && seg.endsWith('**')) return <strong key={si}>{previewFormatBLine(seg.slice(2, -2))}</strong>;
    if (seg.startsWith('_') && seg.endsWith('_')) return <em key={si}>{previewFormatBLine(seg.slice(1, -1))}</em>;
    const refMatch = seg.match(/^\{\{ref:(.+)\}\}$/);
    if (refMatch) return <React.Fragment key={si}>{'(' + refMatch[1].trim() + ')'}</React.Fragment>;
    const navMatch = seg.match(/^\{\{nav:([^:]+):(\d+)\}\}$/);
    if (navMatch) return <React.Fragment key={si}>{'[' + navMatch[1] + ' ' + navMatch[2] + ']'}</React.Fragment>;
    // attribution [From "…" ~ Volume N] + plain text: literal, soft breaks → <br>
    const lines = String(seg).split('\n');
    return (
      <React.Fragment key={si}>
        {lines.map((ln, li) => <React.Fragment key={li}>{li ? <br /> : null}{ln}</React.Fragment>)}
      </React.Fragment>
    );
  });
}

/** Flat plain-text of a Format B paragraph (markers stripped, emphasis unwrapped). */
export function stripFormatBMarkers(text) {
  if (typeof text !== 'string') return '';
  return splitFormatBInline(text)
    .map((seg) => {
      if (!seg) return '';
      if (seg.startsWith('**') && seg.endsWith('**')) return stripFormatBMarkers(seg.slice(2, -2));
      if (seg.startsWith('_') && seg.endsWith('_')) return stripFormatBMarkers(seg.slice(1, -1));
      const refMatch = seg.match(/^\{\{ref:(.+)\}\}$/);
      if (refMatch) return '(' + refMatch[1].trim() + ')';
      const navMatch = seg.match(/^\{\{nav:([^:]+):(\d+)\}\}$/);
      if (navMatch) return '[' + navMatch[1] + ' ' + navMatch[2] + ']';
      return seg;
    })
    .join('');
}

/** Inert render of a WTLB/Blessed entry's paragraphs (Format B). */
export function PreviewWtlbBody({ paragraphs }) {
  if (!Array.isArray(paragraphs)) return null;
  return paragraphs.map((p, pi) => (
    <p key={pi} style={{ textAlign: p.align }} className={p.align === 'center' ? 'letter-poetry' : 'letter-para'}>
      {previewFormatBLine(p.text || '')}
    </p>
  ));
}

// ── Format C (Bible / Matthew verses): inert verse list ─────────────────────
// Plain verse spans — base NKJV/study text only (no translateVerse, no
// HighlightableText/LinkIcon/BookmarkIcon). Matches the live `.verses-block`.
export function PreviewVerses({ verses, poetry }) {
  if (!Array.isArray(verses)) return null;
  return (
    <div className={`verses-block${poetry ? ' is-poetry' : ''}`}>
      {verses.map((v, vi) => (
        <span key={vi} className="verse">
          <span className="verse-num">{v.n}</span>
          {v.text}{' '}
        </span>
      ))}
    </div>
  );
}

// ── Neighbor resolution (Letter / WTLB) ─────────────────────────────────────
// Bible/Matthew screens already hold full neighbor chapter objects; only the
// VOT screens need to resolve {id} → full entry from the in-memory corpus.
// COL_BY_KEY / colLetterArr / colPreface are cross-bundle globals
// (scripture-resolution.js). Returns null if not found (caller falls back).
export function resolveNeighborLetter(volKey, neighborId) {
  if (!volKey || !neighborId || typeof COL_BY_KEY === 'undefined') return null;
  const col = COL_BY_KEY.get(volKey);
  if (!col) return null;
  const arr = (typeof colLetterArr === 'function') ? colLetterArr(col) : [];
  const found = arr.find((l) => l.id === neighborId);
  if (found) return found;
  const pref = (typeof colPreface === 'function') ? colPreface(col) : null;
  return (pref && pref.id === neighborId) ? pref : null;
}

// ── Inert hero (dimmed) ─────────────────────────────────────────────────────
// A lightweight clone of the reading hero so the peek reads as a real page
// turn, not a bare paragraph. `bgClass` matches the host screen's hero-bg
// modifier ('vol' | 'study' | 'ot' | '').
function PreviewHero({ eyebrow, title, subtitle, bgClass }) {
  if (!eyebrow && !title) return null;
  return (
    <header className="hero">
      <div className={`hero-bg${bgClass ? ' ' + bgClass : ''}`} />
      <div className="hero-content">
        {eyebrow && <div className="hero-eyebrow">{eyebrow}</div>}
        {title && <h1 className="hero-title">{title}</h1>}
        {subtitle && <div className="hero-subtitle">{subtitle}</div>}
        <div className="hero-ornament">
          <div className="hero-ornament-line" />
          <div className="hero-ornament-diamond" />
          <div className="hero-ornament-line r" />
        </div>
      </div>
    </header>
  );
}

/* PagerPeek — the absolutely-positioned neighbor page that slides in during a
   swipe. ScreenLayout mounts ONE of these (the active side) and the gesture
   hook drives its transform. `desc` is whatever the screen's pager.peek(side)
   returned (see ScreenLayout integration):

     { kind:'letter', hero, blocks }
     { kind:'wtlb',   hero, paragraphs }
     { kind:'verses', hero, verses, poetry, wrapClass }
     { kind:'boundary', eyebrow, title }
     null  → nothing to show (dead end); ScreenLayout does not mount a peek

   aria-hidden + pointer-events:none (in CSS): never interactive, never read. */
export function PagerPeek({ side, desc, peekRef }) {
  if (!desc) return null;
  let body = null;
  if (desc.kind === 'boundary') {
    return (
      <div className={`pager-peek pager-peek-${side}`} aria-hidden="true" ref={peekRef}>
        <div className="pager-peek-boundary">
          <div className="bottom-nav-card">
            <div className="bottom-nav-label">{desc.eyebrow}</div>
            <div className="bottom-nav-title">{desc.title}</div>
          </div>
        </div>
      </div>
    );
  }
  if (desc.kind === 'letter') body = <div className="content-layout"><main className="letter-body">{<PreviewLetterBody blocks={desc.blocks} />}</main></div>;
  else if (desc.kind === 'wtlb') body = <div className="content-layout"><main className="letter-body">{<PreviewWtlbBody paragraphs={desc.paragraphs} />}</main></div>;
  else if (desc.kind === 'verses') body = <div className={desc.wrapClass || 'chapter-body'}>{<PreviewVerses verses={desc.verses} poetry={desc.poetry} />}</div>;

  return (
    <div className={`pager-peek pager-peek-${side}`} aria-hidden="true" ref={peekRef}>
      <div className="pager-peek-scroll">
        <PreviewHero {...(desc.hero || {})} />
        <div className="page-wrapper">{body}</div>
      </div>
    </div>
  );
}
