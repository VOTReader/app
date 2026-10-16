/* AaSheet - "Text and theme" (picture 1c-aa-sheet; desktop: the D4 dialog): text size on six steps, the page (Slate,
   Paper, Black) and line spacing. Every change shows at once and is kept (look.js); Done, the scrim, Escape and Back
   close it. The shell opens it from a reading page's Aa button. Settings > Text and theme (7g, TextPages.jsx) is the
   same controls as a page (AaControls), with main's preview sentence under Text size. */
import { Sheet } from '../Sheet.jsx';
import { TEXT_STEPS, PAGES, LINES, stepOf } from '../look.js';

/**
 * @param {{ look: import('../look.js').Look, desktop?: boolean, onChange: (look: import('../look.js').Look) => void,
 *   onClose: () => void }} props
 */
export function AaSheet({ look, desktop = false, onChange, onClose }) {
  return (
    <Sheet kind="aa" label="Text and theme" desktop={desktop} onClose={onClose}>
      <div className="sh">Text and theme</div>
      <AaControls look={look} onChange={onChange} />
      <button type="button" className="pill block done" onClick={onClose}>Done</button>
    </Sheet>
  );
}

/**
 * Text size, Page and Line spacing; `preview` goes under the size (the page's sentence).
 * @param {{ look: import('../look.js').Look, onChange: (look: import('../look.js').Look) => void, preview?: any }} props
 */
export function AaControls({ look, onChange, preview = null }) {
  const at = stepOf(look.scale);
  const toStep = (i) => {
    const n = Math.max(0, Math.min(TEXT_STEPS.length - 1, i));
    if (n !== at || TEXT_STEPS[n] !== look.scale) onChange({ ...look, scale: TEXT_STEPS[n] });
  };
  // a tap anywhere on the track takes the nearest dot
  const onTrack = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width) return;
    toStep(Math.round(((e.clientX - r.left) / r.width) * (TEXT_STEPS.length - 1)));
  };
  const onTrackKey = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); toStep(at - 1); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); toStep(at + 1); }
  };
  const choice = (on, fn) => ({
    role: 'radio', 'aria-checked': on, tabIndex: 0, onClick: fn,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } },
  });
  return (
    <>
      <div className="aa-row"><span className="aa-k">Text size</span></div>
      <div className="size">
        <button type="button" className="sz-a s" aria-label="Smaller text" disabled={at === 0} onClick={() => toStep(at - 1)}>A</button>
        <div className="steps" role="slider" tabIndex={0} aria-label="Text size" aria-valuemin={1} aria-valuemax={TEXT_STEPS.length}
          aria-valuenow={at + 1} aria-valuetext={'Step ' + (at + 1) + ' of ' + TEXT_STEPS.length} onClick={onTrack} onKeyDown={onTrackKey}>
          {TEXT_STEPS.map((s, i) => <i key={s} className={i < at ? 'lit' : i === at ? 'on' : ''} />)}
        </div>
        <button type="button" className="sz-a l" aria-label="Larger text" disabled={at === TEXT_STEPS.length - 1} onClick={() => toStep(at + 1)}>A</button>
      </div>
      {preview}
      <div className="aa-row"><span className="aa-k">Page</span></div>
      <div className="looks" role="radiogroup" aria-label="Page">
        {PAGES.map((p) => (
          <div key={p.id} className={'look' + (p.id === look.page ? ' on' : '')}
            {...choice(p.id === look.page, () => { if (p.id !== look.page) onChange({ ...look, page: /** @type {any} */ (p.id) }); })}>
            <span className={'sw ' + p.id}>Aa</span>{p.label}
          </div>
        ))}
      </div>
      <div className="aa-row"><span className="aa-k">Line spacing</span></div>
      <div className="seg" role="radiogroup" aria-label="Line spacing">
        {LINES.map((l) => (
          <span key={l.id} className={l.id === look.lines ? 'on' : undefined}
            {...choice(l.id === look.lines, () => { if (l.id !== look.lines) onChange({ ...look, lines: /** @type {any} */ (l.id) }); })}>
            {l.label}
          </span>
        ))}
      </div>
    </>
  );
}
