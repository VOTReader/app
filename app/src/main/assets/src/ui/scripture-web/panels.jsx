/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/panels — Cluster F (bundle-d)

   The DOM panels the Scripture Web opens over its canvases: the hover chip
   (TipChip), the how-to-read guide, the chooser for close threads, the
   Nearby list, the detail sheet with its endpoint cards, the empty-web
   notice, the load-error panel and the colour key (legendFor). Moved out
   of ScriptureWebScreen unchanged (F0, 2026-10-18): the same markup, the
   same classes, the same copy. The words they compute come from
   utils/scripture-web/describe.js; the screen decides when each is open.

   useFocusTrap is the app's free-global hook (bundle-d's pattern): each
   dialog keeps Tab inside and hands focus back on close.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  connectionTitle, connectionMeta, sheetEyebrow, sheetMeta, listEyebrow, listMeta, endpointLabel, prophecyMeta,
} from '../../utils/scripture-web/describe.js';
import { LINK_KIND_NAMES, MY_WEB_SOURCES, MY_WEB_LINK_KINDS } from '../../utils/scripture-web/palette.js';

export function TipChip({ info, viewport }) {
  const s = info.info;
  const width = viewport && viewport.DPR ? viewport.W / viewport.DPR : 800;
  const height = viewport && viewport.DPR ? viewport.H / viewport.DPR : 600;
  const style = {
    left: Math.max(8, Math.min(info.x + 16, width - 308)) + 'px',
    top: Math.max(8, Math.min(info.y + 16, height - 138)) + 'px',
  };
  return (
    <div className="sw-tip" style={style} aria-hidden="true"
      data-verse={s.kind === 'underlay' ? s.verse : undefined} data-vot={s.kind === 'underlay' ? s.vot : undefined}>
      {s.kind === 'arc' && (
        <React.Fragment>
          <div className="sw-tip-eyebrow">Connection</div>
          <div className="sw-tip-ref">{s.a.label}</div>
          <div className="sw-tip-arrow">↕</div>
          <div className="sw-tip-ref sw-tip-ref-alt">{s.b.label}</div>
          <div className="sw-tip-meta">{s.prophecy ? prophecyMeta(s) : s.span.toLocaleString() + ' verses apart · weight ' + s.votes}</div>
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
          <div className="sw-tip-eyebrow">Timothy&rsquo;s thread</div>
          <div className="sw-tip-ref">{s.source.label}</div>
          <div className="sw-tip-arrow">↕</div>
          <div className="sw-tip-ref sw-tip-ref-alt">{s.target ? endpointLabel(s.target) : 'Corpus passage'}</div>
          <div className="sw-tip-meta">{s.sourceName ? s.sourceName + ' \u00b7 ' + s.joins : s.joins}</div>
        </React.Fragment>
      )}
      {s.kind === 'chapter' && (
        <React.Fragment>
          <div className="sw-tip-eyebrow">Chapter</div>
          <div className="sw-tip-ref">{s.book.title} {s.chapter}</div>
          <div className="sw-tip-meta">{s.verses} verses · {s.connections.toLocaleString()} connections</div>
        </React.Fragment>
      )}
      {s.kind === 'verse' && (
        <React.Fragment>
          <div className="sw-tip-eyebrow">Verse</div>
          <div className="sw-tip-ref">{s.ref.label}</div>
          <div className="sw-tip-meta">{s.connections.toLocaleString()} connections</div>
        </React.Fragment>
      )}
      {s.kind === 'bundle' && (
        <React.Fragment>
          <div className="sw-tip-eyebrow">Bundle</div>
          <div className="sw-tip-ref">{s.label}</div>
          <div className="sw-tip-meta">{s.hidden > 0
            ? s.hidden.toLocaleString() + ' of ' + s.connections.toLocaleString() + ' connections not drawn here'
            : s.connections.toLocaleString() + ' connections converge here'} · tap to open</div>
        </React.Fragment>
      )}
    </div>
  );
}

/** The how-to-read card (landing 13). A dialog like the panels below it, so it
 * gets their trap: focus in on open, Tab kept inside, focus handed back to
 * where the reader was (the ? button) on close. Escape and Back close it
 * through closeTopOverlay, the same as the panels. */
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

export function ConnectionChooser({ choices, onChoose, onClose }) {
  // v03-03: Tab stays in the panel; closing it hands focus back to the web
  const trapRef = useFocusTrap(true);
  return (
    <div className="sw-choice" ref={trapRef} data-focus-self="" role="dialog" aria-modal="false" aria-label="Connections here">
      <button type="button" className="sw-sheet-close" onClick={onClose} aria-label="Close connection choices">×</button>
      <div className="sw-sheet-eyebrow">Connections here</div>
      <div className="sw-sheet-meta">Several threads are close together. Choose the one you meant.</div>
      <div className="sw-choice-list">
        {choices.map((choice, i) => (
          <button type="button" className="sw-choice-row" key={i} onClick={() => onChoose(choice)}>
            <span className="sw-choice-label">{connectionTitle(choice)}</span>
            <span className="sw-choice-meta">{connectionMeta(choice)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ConnectionList({ items, mode, lensOn, onChoose, onClose }) {
  // v03-03: Tab stays in the panel; closing it hands focus back to the web
  const trapRef = useFocusTrap(true);
  // the canon list leads with the chapter it reads (landing 15)
  const chapter = mode !== 'personal' && items[0] && items[0].kind === 'chapter' ? items[0] : null;
  // My Web lists every one of the reader's links, the one passing nearest the middle of the view
  // first (w3 item 29; it was the first 36 in store order, sweep mw12); its header still says
  // 'Your links'. The canon list reads the view too (the lit chapter, its threads).
  const eyebrow = listEyebrow(mode, chapter, lensOn);
  const meta = listMeta(chapter, items.length);
  return (
    <div className="sw-list" ref={trapRef} data-focus-self="" role="dialog" aria-modal="false" aria-label="Nearby connections" data-lens-on={lensOn ? '1' : '0'}>
      <button type="button" className="sw-sheet-close" onClick={onClose} aria-label="Close nearby connections">×</button>
      <div className="sw-sheet-eyebrow">{eyebrow}</div>
      <div className="sw-sheet-meta">{meta}</div>
      {items.length ? (
        <div className="sw-choice-list">
          {items.map((item, i) => (
            <button type="button" className={'sw-choice-row' + (item.kind === 'chapter' ? ' sw-choice-chapter' : '')} key={i} onClick={() => onChoose(item)}>
              <span className="sw-choice-label">{connectionTitle(item)}</span>
              <span className="sw-choice-meta">{connectionMeta(item)}</span>
            </button>
          ))}
        </div>
      ) : <div className="sw-list-empty">{mode === 'personal' ? 'You have no links on the web yet.' : 'No nearby connections at this location.'}</div>}
    </div>
  );
}

export function DetailSheet({ info, onClose, onOpen, onFollow, onGroup }) {
  // v03-03: Tab stays in the panel; closing it hands focus back to the web
  const trapRef = useFocusTrap(true);
  const cards = info.cards || [];
  const eyebrow = sheetEyebrow(info);
  const meta = sheetMeta(info);

  return (
    <div className="sw-sheet" ref={trapRef} data-focus-self="" role="dialog" aria-modal="false"
      aria-label={eyebrow + ' details'}>
      <button type="button" className="sw-sheet-close" onClick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
      <div className="sw-sheet-eyebrow">{eyebrow}</div>
      <div className="sw-sheet-meta">{meta}</div>
      {info.kind === 'arc' && onFollow && (
        <button type="button" className="sw-sheet-follow" onClick={() => onFollow(info)}
          aria-label={'Follow the line to ' + (info.far === 'to' ? info.b : info.a).label}>
          Follow to {(info.far === 'to' ? info.b : info.a).label} &rsaquo;
        </button>
      )}
      {(info.kind === 'bundle' || (info.kind === 'chapter' && info.groups && info.groups.length > 0)) && onGroup && (
        <div className="sw-choice-list sw-bundle-groups" role="group" aria-label="Where this bundle goes">
          {info.groups.map((grp) => (
            <button type="button" className="sw-choice-row" key={grp.chapterIndex}
              aria-pressed={info.chosenGroup === grp.chapterIndex}
              onClick={() => onGroup(info, grp)}>
              <span className="sw-choice-label">{grp.label}</span>
              <span className="sw-choice-meta">{grp.count} {grp.count === 1 ? 'thread' : 'threads'}
                {grp.hidden > 0 ? ' · ' + grp.hidden + ' not drawn' : ''} · weight {grp.votes}</span>
            </button>
          ))}
        </div>
      )}
      <div className="sw-sheet-cards">
        {cards.map((card, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <div className="sw-card-join" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
            )}
            <button type="button" className="sw-card"
              disabled={!card.endpoint}
              aria-label={card.endpoint ? 'Open ' + card.label + ' in the reader' : card.label}
              onClick={() => card.endpoint && onOpen(card.endpoint)}>
              <span className="sw-card-eyebrow">{card.eyebrow}</span>
              <span className="sw-card-label">{card.label}</span>
              {card.cat && <span className="sw-card-cat">{card.cat}</span>}
              {card.preview && <span className="sw-card-preview">{card.preview}</span>}
              {card.endpoint && <span className="sw-card-go">Open in reader &rsaquo;</span>}
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export function legendFor(mode) {
  // Every variant ends with the histogram key — the bars hanging under the
  // baseline (Psalm 119 reaching deepest) are chapter LENGTH, and nothing on
  // screen said so until a reader asked what the deep column was.
  const histKey = (
    <span className="sw-key" key="hist">
      <i className="sw-key-hist" aria-hidden="true"><i /><i /><i /></i>
      bars below — chapter length
    </span>
  );
  // My Web (1b, design-myweb-colour.md, 5): two families, yours first because
  // the reader's own links are the point of My Web. A pin per shape for yours
  // (the channel a deuteranope keeps once gold and amber meet), a bar per
  // source for Timothy's. Canon hue retired here by Corbin (2026-09-11).
  if (mode === 'personal') {
    const shapeWords = ['within scripture', 'within the Volumes', 'across'];
    return [
      <span className="sw-key" key="yours">
        yours
        {MY_WEB_LINK_KINDS.map((k, i) => (
          <React.Fragment key={k.name}>
            {i > 0 ? ' \u00b7 ' : ' '}
            <i className={'sw-key-pin is-' + k.pin} style={{ color: 'rgb(' + k.rgb + ')' }} aria-hidden="true" />
            {shapeWords[i]}
          </React.Fragment>
        ))}
      </span>,
      <span className="sw-key" key="timothy">
        Timothy&rsquo;s
        {MY_WEB_SOURCES.map((src, i) => (
          <React.Fragment key={src.key}>
            {i > 0 ? ' \u00b7 ' : ' '}
            <i className="sw-key-line" style={{ background: 'rgb(' + src.rgb + ')' }} aria-hidden="true" />
            {src.name}
          </React.Fragment>
        ))}
      </span>,
      histKey,
    ];
  }
  // Distance is the only colour law the screen offers (Corbin, 2026-09-10:
  // "leave distance as only option, it looks best anyway"); the renderer has
  // no other.
  return [
    <span className="sw-key sw-key-ramp" key="ramp">
      <span>nearby</span><i className="sw-key-gradient" /><span>across the canon</span>
    </span>,
    histKey,
  ];
}

/** The empty-web notice on a My Web with no links yet: what to do, in one
 * sentence, and a close the screen's dismissEmpty remembers. */
export function EmptyWebNotice({ onDismiss }) {
  return (
    <div className="sw-empty">
      <div className="sw-empty-title">Your web is still being woven.</div>
      {/* One sentence, so the panel covers under half the band on the
          800x360 frame (the walk's R3); the silver threads behind it are
          the corpus's own citations, and the panel must not hide them. */}
      <div className="sw-empty-body">
        Select text anywhere in the app, tap <strong>Link</strong>, and pick
        where it goes. The silver threads are the Volumes&rsquo; own citations.
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
