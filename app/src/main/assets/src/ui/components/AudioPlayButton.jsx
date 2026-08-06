/* ═══════════════════════════════════════════════════════════════════════
   AudioPlayButton — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The entry points into streaming playback. Purely presentational — the
   caller owns the click (it builds the queue and hands it to AudioPlayer);
   these render the gold Cinzel affordance and nothing else.

   Three variants, one component because they differ only in text, glyph
   and box:
     'listen'  — letter / WTLB hero pill (always exactly "▶ Listen" —
                 owner directive 2026-08-06; the player bar carries the
                 reader attribution)
     'playall' — collection index header pill ("Play All")
     'chip'    — the small per-section chips under a WTLB index
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {object} props
 * @param {'listen'|'playall'|'chip'} [props.variant]
 * @param {string} [props.label] chip text; on the pills, an aria-label override
 * @param {() => void} [props.onClick]
 * @param {string} [props.className]
 * @param {string|number} [props.key] list key — declared because this repo's
 *   `React` is a global `any`, so JSX adds no React.Attributes of its own and
 *   an undeclared `key=` fails `npm run typecheck`.
 */
export function AudioPlayButton({ variant = 'listen', label, onClick, className }) {
  const chip = variant === 'chip';
  const playAll = variant === 'playall';
  const text = chip ? (label || 'Play') : playAll ? 'Play All' : 'Listen';

  return (
    <button
      type="button"
      className={(chip ? 'audio-sec-chip' : 'hero-play-pill') + (className ? ' ' + className : '')}
      onClick={onClick}
      // A chip's visible text is the section name, so the accessible name says
      // what the tap DOES ("Play Part 3 · 40–59") while still containing the
      // visible label (WCAG 2.5.3). The pills already read as verbs.
      aria-label={chip ? 'Play ' + text : (label || text)}
    >
      {playAll ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h11M4 12h11M4 18h7" />
          <path d="M16 13.5l6 3.5-6 3.5z" fill="currentColor" stroke="none" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
      <span>{text}</span>
    </button>
  );
}

/**
 * The compilation chips under a WTLB index header.
 * @param {object} props
 * @param {Array<Array<string>>} [props.sections] [label, id, reader] triples
 * @param {(index: number) => void} props.onPlay
 */
export function AudioSectionChips({ sections, onPlay }) {
  if (!sections || !sections.length) return null;
  return (
    <div className="audio-sec-chips">
      {sections.map((s, i) => (
        <AudioPlayButton key={s[1] || i} variant="chip" label={s[0]} onClick={() => onPlay(i)} />
      ))}
    </div>
  );
}
