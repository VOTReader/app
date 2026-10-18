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

import { connectionTitle, arcLine, endpointLabel, plural, WEB_CREDIT, loadErrorWords, myWebLegendWords } from '../../utils/scripture-web/describe.js';
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
/** "How to read this web": four short lines, five with the go-to, each pointing at something the
 * screen has (digest items 22, 23). The "+" button, the ruler on the left and the bar that
 * jumped are gone, so the card no longer names them; the legend says what the colours are.
 * The footer carries the OpenBible.info credit (Q5). `canSearch`: the go-to's button is there. */
export function HowToReadGuide({ onClose, canSearch, credit }) {
  const trapRef = useFocusTrap(true);
  return (
    <div className="sw-guide" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="sw-guide-title">
      <div className="sw-guide-title" id="sw-guide-title">How to read this web</div>
      <ul className="sw-guide-body">
        <li><strong>Pinch</strong> or scroll to zoom. Drag down to look higher, where the long threads cross.</li>
        <li>Tap a thread to read both ends. Its votes are readers&rsquo; votes for how strong the link is.</li>
        <li>A gold tick under the baseline marks a verse the Volumes cite.</li>
        {canSearch ? <li><strong>Search</strong> at the top goes straight to a verse.</li> : null}
        <li><strong>Reset</strong> brings the whole web back.</li>
      </ul>
      <p className="sw-guide-foot">{credit || WEB_CREDIT}</p>
      <button type="button" className="sw-btn sw-guide-close" onClick={onClose}>Got it</button>
    </div>
  );
}

export function legendFor(mode, credit) {
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
  // no other. Then the two marks it paints over the threads (Q1 a: the Volumes
  // are always on): a verse the Volumes cite carries a gold tick under the
  // baseline, a prophecy's fulfilment is the pale thread on top. Last, the
  // credit the OpenBible.info data is owed (Q5), on the same line: it is never
  // a line of its own on the canvas (round 3), so it can never print over the
  // book labels. My Web draws none of that data, so it carries no credit.
  return [
    <span className="sw-key sw-key-ramp" key="ramp">
      <span>nearby</span><i className="sw-key-gradient" aria-hidden="true" /><span>across the canon</span>
    </span>,
    <span className="sw-key" key="cited"><i className="sw-key-tick" aria-hidden="true" />cited in the Volumes</span>,
    <span className="sw-key" key="prophecy"><i className="sw-key-arc" aria-hidden="true" />prophecy fulfilled</span>,
    <span className="sw-credit" key="credit">{credit || WEB_CREDIT}</span>,
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
export function loadErrorPanel(message, onRetry, onBack) {
  // It replaces the whole screen, topbar and all, so it carries its own Back (item 24) where the
  // topbar's sits; the words are plain, the raw message small beneath them.
  return (
    <div className="sw-fallback">
      <button type="button" className="sw-btn sw-btn-icon sw-fallback-back" onClick={onBack} aria-label="Back">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <div className="sw-fallback-title">The Scripture Web couldn’t load.</div>
      <div className="sw-fallback-body">{loadErrorWords(message)}</div>
      {message ? <div className="sw-fallback-detail">{message}</div> : null}
      <button type="button" className="sw-btn" onClick={onRetry}>Try again</button>
    </div>
  );
}
