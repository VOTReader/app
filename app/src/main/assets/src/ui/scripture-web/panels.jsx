/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/panels — Cluster F (bundle-d)

   The small DOM pieces the Scripture Web lays over its canvases: the hover
   chip (TipChip), the how-to-read guide, the empty-web notice, the
   load-error panel and the colour key (legendFor). Moved out of
   ScriptureWebScreen (F0, 2026-10-18). The chooser, the Nearby list and
   the detail sheet that lived here became the one docked panel
   (web-panel.jsx, w3). The words come from utils/scripture-web/describe.js;
   the screen decides when each is open.

   useFocusTrap is the app's free-global hook (bundle-d's pattern): the
   guide keeps Tab inside and hands focus back on close.
   ═══════════════════════════════════════════════════════════════════════ */

import { connectionTitle, arcLine, endpointLabel, plural, myWebLegendWords } from '../../utils/scripture-web/describe.js';
import { LINK_KIND_NAMES } from '../../utils/scripture-web/palette.js';
import { ink } from '../../utils/scripture-web/sw-ink.js';

/** The hover chip. `inset` is what the docked panel covers (CONTRACTS.md section 5): the chip
 * stays in the canvas area beside it, never under it. */
export function TipChip({ info, viewport, inset }) {
  const s = info.info;
  const width = viewport && viewport.DPR ? viewport.W / viewport.DPR : 800;
  const height = viewport && viewport.DPR ? viewport.H / viewport.DPR : 600;
  const right = inset && inset.right > 0 ? inset.right : 0;
  const bottom = inset && inset.bottom > 0 ? inset.bottom : 0;
  const style = {
    left: Math.max(8, Math.min(info.x + 16, width - right - 308)) + 'px',
    top: Math.max(8, Math.min(info.y + 16, height - bottom - 138)) + 'px',
  };
  return (
    <div className="sw-tip" style={style} aria-hidden="true"
      data-verse={s.kind === 'underlay' ? s.verse : undefined} data-vot={s.kind === 'underlay' ? s.vot : undefined}>
      {s.kind === 'arc' && (
        <React.Fragment>
          {/* the panel's words (spec 4.6): "A ↔ B", then votes and distance, no "weight" */}
          <div className="sw-tip-eyebrow">Connection</div>
          <div className="sw-tip-ref">{connectionTitle(s)}</div>
          <div className="sw-tip-meta">{arcLine(s)}</div>
        </React.Fragment>
      )}
      {s.kind === 'link' && (
        <React.Fragment>
          <div className="sw-tip-eyebrow">Your link</div>
          <div className="sw-tip-ref">{endpointLabel(s.source)}</div>
          <div className="sw-tip-arrow">↕</div>
          <div className="sw-tip-ref sw-tip-ref-alt">{endpointLabel(s.target)}</div>
          <div className="sw-tip-meta">{LINK_KIND_NAMES[s.joins]}</div>
        </React.Fragment>
      )}
      {s.kind === 'underlay' && (
        <React.Fragment>
          <div className="sw-tip-eyebrow">Timothy&rsquo;s note</div>
          <div className="sw-tip-ref">{s.source.label}</div>
          <div className="sw-tip-arrow">↕</div>
          <div className="sw-tip-ref sw-tip-ref-alt">{s.target ? endpointLabel(s.target) : 'A passage in the Volumes'}</div>
          <div className="sw-tip-meta">{s.sourceName ? s.sourceName + ' \u00b7 ' + s.joins : s.joins}</div>
        </React.Fragment>
      )}
      {s.kind === 'chapter' && (
        <React.Fragment>
          <div className="sw-tip-eyebrow">Chapter</div>
          <div className="sw-tip-ref">{s.book.title} {s.chapter}</div>
          <div className="sw-tip-meta">{plural(s.verses, 'verse', 'verses')} · {plural(s.connections, 'connection', 'connections')}</div>
        </React.Fragment>
      )}
      {s.kind === 'verse' && (
        <React.Fragment>
          <div className="sw-tip-eyebrow">Verse</div>
          <div className="sw-tip-ref">{s.ref.label}</div>
          <div className="sw-tip-meta">{plural(s.connections, 'connection', 'connections')}</div>
        </React.Fragment>
      )}
      {s.kind === 'bundle' && (
        <React.Fragment>
          <div className="sw-tip-eyebrow">Bundle</div>
          <div className="sw-tip-ref">{s.label}</div>
          <div className="sw-tip-meta">{plural(s.connections, 'connection converges', 'connections converge')} here · tap to open</div>
        </React.Fragment>
      )}
    </div>
  );
}

/** The how-to-read card (landing 13). A modal dialog, so it keeps a trap:
 * focus in on open, Tab kept inside, focus handed back to where the reader
 * was (the ? button) on close. Escape and Back close it through
 * closeTopOverlay, the same as the docked panel. */
export function HowToReadGuide({ onClose }) {
  const trapRef = useFocusTrap(true);
  return (
    <div className="sw-guide" ref={trapRef} role="dialog" aria-labelledby="sw-guide-title">
      <div className="sw-guide-title" id="sw-guide-title">How to read this web</div>
      <ul className="sw-guide-body">
        <li>Every thread joins two passages of Scripture. Its feet stand on the verses it joins; the taller the arch, the farther apart they are.</li>
        <li>Colour is distance: violet threads join near neighbours, green ones cross the whole Bible. The books run along the bottom.</li>
        <li>Pinch or press <strong>+</strong> to zoom in. Past the overview, the chapter under the middle is lit and the rest stands back.</li>
        <li>Tap a thread to see both ends and follow it. Tap a number under the baseline to list every thread landing on that verse.</li>
        <li>Drag the web down to look higher, where the long threads cross. The ruler on the left names the height; the bar on the right jumps.</li>
        <li><strong>Reset</strong> brings you home.</li>
      </ul>
      <button type="button" className="sw-sheet-follow sw-guide-close" onClick={onClose}>Got it</button>
    </div>
  );
}

export function legendFor(mode) {
  // The key names only what the web draws (digest item 22): the chapter-length bars' key left
  // with the spec's legend, which has none, and My Web never drew bars.
  // My Web (w3, r2-05): two families, named as the picture names them,
  // Timothy's notes then the reader's links; one line of each family's ink.
  if (mode === 'personal') {
    const words = myWebLegendWords();
    return [
      <span className="sw-key" key="timothy">
        <i className="sw-key-line" style={{ background: ink('myWebFootnote').hex }} aria-hidden="true" />
        {words.timothy}
      </span>,
      <span className="sw-key" key="yours">
        <i className="sw-key-line" style={{ background: ink('myWebReader').hex }} aria-hidden="true" />
        {words.yours}
      </span>,
    ];
  }
  // Distance is the only colour law the screen offers (Corbin, 2026-09-10:
  // "leave distance as only option, it looks best anyway"); the renderer has
  // no other.
  return [
    <span className="sw-key sw-key-ramp" key="ramp">
      <span>nearby</span><i className="sw-key-gradient" /><span>across the canon</span>
    </span>,
  ];
}

/** The empty-web notice on a My Web with no links yet: what to do, in one
 * sentence, and a close the screen's dismissEmpty remembers. */
export function EmptyWebNotice({ onDismiss }) {
  return (
    <div className="sw-empty">
      <div className="sw-empty-title">Your web is still being woven.</div>
      {/* Two short sentences, so the panel covers under half the band on the
          800x360 frame (the walk's R3); the faint threads behind it are
          Timothy's notes, and the panel must not hide them. */}
      <div className="sw-empty-body">
        Select text anywhere in the app, tap <strong>Link</strong>, and pick
        where it goes. The faint threads are Timothy&rsquo;s notes, the Volumes&rsquo; own citations.
      </div>
      <button type="button" className="sw-empty-close" aria-label="Dismiss"
        onClick={onDismiss}>×</button>
    </div>
  );
}

/**
 * The panel a failed load (or a renderer that threw) shows, with Try again.
 * A render helper rather than a component, on purpose: the screen returns
 * its element as its root, so the root stays the same `div` type across
 * the error and the web, exactly as when this markup was inline.
 * @param {string} message
 * @param {() => void} onRetry
 */
export function loadErrorPanel(message, onRetry) {
  return (
    <div className="sw-fallback">
      <div className="sw-fallback-title">The Scripture Web couldn’t load.</div>
      <div className="sw-fallback-body">{message}</div>
      <button type="button" className="sw-btn" onClick={onRetry}>Try again</button>
    </div>
  );
}
