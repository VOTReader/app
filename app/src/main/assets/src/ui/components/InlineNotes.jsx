/* ═══════════════════════════════════════════════════════════════════════
   InlineNotes — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Annotation contract mirrors StudyPanels (2026-08-09): non-interactive
   study prose carries data-hl-key + data-hl-dom + StaticSubtree; tappable
   rows stay navigation chrome. `hlKeyBase` is the verse's own study key
   ('study:matthew-5:12') — suffixes keep these containers distinct from
   the verse text container that owns the bare key.

   Studies pass 3 (hub, 2026-11-18): a verse's notes are one card of rows in
   the parts the chapter's end already wears (StudyPanels): the verse in the
   accent, the reference or the letter's name, the kit chevron. Before, they
   hung off a gold rule in 10 px capitals inside hairline boxes, a look the
   rest of the app had left. The words and what a tap opens are unchanged. */

import { renderCommentaryCite } from './ModeToggle.jsx';
import { UiIcon } from './UiIcon.jsx';

export function InlineNotes({ scriptures, votNotes, onScriptureClick, onVotLetterClick, hlKeyBase }) {
  if (!scriptures.length && !votNotes.length) return null;
  const ann = (suffix) => hlKeyBase ? { 'data-hl-key': hlKeyBase + '-' + suffix, 'data-hl-dom': true } : {};
  return (
    <div className="inline-notes ui-group">
      {scriptures.map((s, i) => {
        const hasVerse = !!MATTHEW_NKJV[s.cite];
        return hasVerse ? (
          <button key={`s${i}`} className="inline-note-scripture" onClick={() => onScriptureClick && onScriptureClick(s)}>
            <span className="inline-note-tag">{s.ref}</span>
            <span className="inline-note-cite">{s.cite}</span>
            <UiIcon name="chev" size="sm" className="inline-note-chevron" />
          </button>
        ) : (
          <div key={hlKeyBase ? hlKeyBase + '-s' + i : `s${i}`} className="inline-note-scripture inline-note-plain" {...ann('s' + i)}>
            <StaticSubtree>
              <span className="inline-note-tag">{s.ref}</span>
              <span className="inline-note-cite">{renderCommentaryCite(s.cite, onScriptureClick ? (cite) => onScriptureClick({ ref: s.ref, cite }) : null)}</span>
            </StaticSubtree>
          </div>
        );

      })}
      {votNotes.map((n, i) => {
        const canTap = onVotLetterClick && !!resolveVotLetter(n.vol, n.letter);
        const volLabel = votNoteVolLabel(n);
        const hm = isHiddenManna(n);
        const badge = hm ? (
          <span className="inline-vot-hm" title="Hidden Manna — The Word of The Lord Spoken to Timothy">Hidden Manna</span>
        ) : canTap ? (
          <UiIcon name="chev" size="sm" className="inline-vot-chevron" />
        ) : null;
        const inner = (
          <>
            <div className="inline-vot-header">
              <span className="inline-vot-ref">{n.ref}</span>
              {volLabel && <span className="inline-vot-vol">{volLabel}</span>}
              {badge}
            </div>
            <div className="inline-vot-letter">{n.letter}</div>
            {n.excerpt && <div className="inline-vot-excerpt">{n.excerpt}</div>}
          </>
        );

        return canTap ? (
          <button
            key={`v${i}`}
            className="inline-vot-note inline-vot-note-tappable"
            onClick={() => onVotLetterClick(n.vol, n.letter, n.excerpt)}
          >
            {inner}
          </button>
        ) : (
          <div key={hlKeyBase ? hlKeyBase + '-v' + i : `v${i}`} className="inline-vot-note" {...ann('v' + i)}>
            <StaticSubtree>{inner}</StaticSubtree>
          </div>
        );

      })}
    </div>
  );

}
