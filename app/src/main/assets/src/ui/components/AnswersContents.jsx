/* ═══════════════════════════════════════════════════════════════════════
   AnswersContents — an Answers topic's "5 sections · 54 passages" line and
   its Contents sheet (Cluster D, esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   A topic runs to 54 passages (median 10) and a UX walk (2026-09-25) found a
   reader could not tell how long one was or jump anywhere in it. Picture
   first (D:/Swarm/calls/ux-0925/r3-passages.png, take 1): a quiet line under
   the title says how big the topic is and opens a sheet listing its sections
   (or, with no named sections, its passages by source letter); a tap jumps
   there. utils/answers-contents.js reads the paragraphs; the page owns the
   jump (it knows its own scroller and pulse).

   Short topics (under three passages) get no line: nothing to navigate.
   The sheet is the app's select-sheet (portal, SheetHandle, focus trap,
   window.__closeSheet for Android Back), like the landing's commandments.
   ═══════════════════════════════════════════════════════════════════════ */

import { answersContents, contentsSummary } from '../../utils/answers-contents.js';

/** Fewer passages than this and a topic reads end to end without help. */
export const CONTENTS_MIN_PASSAGES = 3;

/**
 * @param {{ entry: any, onJump: (index: number) => void }} props
 */
export function AnswersContentsLine({ entry, onJump }) {
  const contents = React.useMemo(() => answersContents(entry), [entry]);
  const [open, setOpen] = React.useState(false);
  if (contents.passages < CONTENTS_MIN_PASSAGES) return null;
  return (
    <>
      <button type="button" className="answers-contents-line" onClick={() => setOpen(true)}
        aria-haspopup="dialog" aria-expanded={open}>
        {contentsSummary(contents)}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open ? (
        <AnswersContentsSheet
          contents={contents}
          onDismiss={() => setOpen(false)}
          onJump={(i) => { setOpen(false); onJump(i); }}
        />
      ) : null}
    </>
  );
}

/**
 * @param {{ contents: import('../../utils/answers-contents.js').Contents,
 *           onJump: (index: number) => void, onDismiss: () => void }} props
 */
function AnswersContentsSheet({ contents, onJump, onDismiss }) {
  React.useEffect(() => {
    const prev = window.__closeSheet;
    window.__closeSheet = onDismiss;
    return () => { window.__closeSheet = prev || null; };
  }, [onDismiss]);
  const trapRef = useFocusTrap(true);
  const named = contents.sections.filter((s) => s.title);
  // Named sections: one row each, with the first sources under it. None (or one):
  // the passages themselves, by source letter.
  const bySection = named.length > 1;
  const passages = contents.sections.flatMap((s) => s.passages);
  return ReactDOM.createPortal(
    <>
      <div className="select-sheet-backdrop open" aria-hidden="true" onClick={onDismiss} />
      <div className="select-sheet answers-contents-sheet" ref={trapRef} role="dialog" aria-modal="true"
        aria-labelledby="answers-contents-title" onClick={(e) => e.stopPropagation()}>
        <SheetHandle onClose={onDismiss} />
        <div className="select-sheet-eyebrow">In this topic</div>
        <div className="select-sheet-title" id="answers-contents-title">{contentsSummary(contents)}</div>
        <div className="answers-contents-list">
          {bySection ? contents.sections.map((s) => (
            <button key={s.index + ':' + s.title} type="button" className="answers-contents-row" onClick={() => onJump(s.index)}
              data-autofocus={s === contents.sections[0] ? true : undefined}>
              <span className="answers-contents-row-title">
                {s.title || 'Opening passages'}
                <span className="answers-contents-count">{s.passages.length}</span>
              </span>
              {s.passages.length ? (
                <span className="answers-contents-row-sub">
                  {s.passages.slice(0, 3).map((p) => p.title).join(' · ')}{s.passages.length > 3 ? ' …' : ''}
                </span>
              ) : null}
            </button>
          )) : passages.map((p, i) => (
            <button key={p.index} type="button" className="answers-contents-row" onClick={() => onJump(p.index)}
              data-autofocus={i === 0 ? true : undefined}>
              <span className="answers-contents-row-title">
                <span className="answers-contents-num">{i + 1}</span>{p.title}
              </span>
              {p.collection ? <span className="answers-contents-row-sub">{p.collection}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}
