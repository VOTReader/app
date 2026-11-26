/** @jsx h */
/** @jsxFrag Fragment */
/* ═══════════════════════════════════════════════════════════════════════
   AnswersSheets — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The Answers landing's sheets (AOGCG final design f03, f12, O1, O4):

     MoreQuestionsSheet  "What does The Lord say about…", the 12 questions
     CommandmentSheet    one commandment: the site's heading, the NKJV verse,
                         its topics in the site's order
     AboutSheet          the site's "My wiki:About" page, its Sister Sites,
                         Site Promotion and Trumpet Call card, word for word
     ChartViewer         a chart, pinch and double-tap to zoom (offline: the
                         images are precached)

   Each is the kit sheet (.select-sheet, SheetHandle, useFocusTrap,
   window.__closeSheet for Escape and Android Back), one at a time: the
   landing holds which one is open in its module memory, so Back from a
   topic opened here comes back to the sheet (U5).
   ═══════════════════════════════════════════════════════════════════════ */

import { h, Fragment } from '../jsx-h.js';
import { ANSWERS_COMMANDMENTS } from '../../utils/answers-shelves.js';
import { ANSWERS_QUESTIONS, SEP, NBSP, answersRowSub, answersSizeWords, answersDomain, answersMediaSource, answersSisterRow, ANSWERS_OTHER_LABEL } from '../../utils/answers-browse.js';
import { AnsIcon, AnsRow, Chev, LeadTitle, ReadMark } from '../components/AnswersParts.jsx';
import { sheetReference } from '../../utils/passage-copy.js';

/** The handle sits in .ans-sheet-head, so a drag must move the sheet itself, not the head (fix list 3). */
const ansSheetOf = (/** @type {HTMLElement} */ t) => /** @type {HTMLElement | null} */ (t.closest('.select-sheet'));

/**
 * The kit sheet in the Answers dress: × close at the left of the sticky head, then the head's own
 * words; `tall` fills the screen under the top bar (Text Size 2+, About, the viewer).
 * @param {{ label: string, head?: any, tall?: boolean, viewer?: boolean, onClose: () => void, children?: any }} props
 */
export function AnsSheet({ label, head, tall, viewer, onClose, children }) {
  React.useEffect(() => {
    const prev = window.__closeSheet;
    window.__closeSheet = onClose;
    return () => { window.__closeSheet = prev || null; };
  }, [onClose]);
  const trapRef = useFocusTrap(true);
  return ReactDOM.createPortal(
    <>
      <div className="select-sheet-backdrop open" aria-hidden="true" onClick={onClose} />
      <div className={'select-sheet ans-sheet' + (tall ? ' is-tall' : '') + (viewer ? ' is-viewer' : '')} ref={trapRef}
        role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="ans-sheet-head">
          <SheetHandle onClose={onClose} glyph={<AnsIcon name="close" />} sheetOf={ansSheetOf} />
          {head}
        </div>
        {children}
      </div>
    </>,
    document.body
  );
}

/**
 * O1: the twelve questions (ours), each opening its topic.
 * @param {{ byId: Map<string, any>, meta: any, onOpenTopic: Function, onSurprise?: () => void, onClose: () => void, tall?: boolean }} props
 */
export function MoreQuestionsSheet({ byId, meta, onOpenTopic, onSurprise, onClose, tall }) {
  // WA2 (a-more): the question is the sheet's title; the rows sit in one inset card. 0125 A: Surprise me is its first row.
  return (
    <AnsSheet label="Start with a question" tall={tall} onClose={onClose} head={<h2 className="ans-sh-t">What does The Lord say about…</h2>}>
      <div className="ans-box is-inset">
        {onSurprise ? <AnsRow icon="shuffle" title="Surprise me" sub="A passage from anywhere in Answers" onClick={() => { onClose(); onSurprise(); }} /> : null}
        {ANSWERS_QUESTIONS.map(([q, id]) => {
          const e = byId.get(id);
          if (!e) return null;
          const size = answersSizeWords(e, meta && meta[id], { minutes: false });
          return <AnsRow key={id} title={q} sub={[e.title, size].filter(Boolean).join(SEP)} onClick={() => onOpenTopic(id, null, 'Answers')} />;
        })}
      </div>
    </AnsSheet>
  );
}

/**
 * f03: one commandment. The title is the site's sidebar heading word for word (C13), without its number
 * (WA2, a-cmd: "4 of 10" sits in the head); the verse is the app's NKJV, its quotation marks drawn by CSS so a
 * copy carries the words alone, then the reference (data-copy-ref: "Exodus 20:13 (NKJV)", whatever Settings
 * picks). With onStep, the foot steps to the commandment before and after without closing the sheet.
 * @param {{ shelf: any, meta: any, isRead: (id: string) => boolean, onOpenTopic: Function,
 *   onGoToRef?: Function, onStep?: (n: number) => void, onClose: () => void, tall?: boolean }} props
 */
export function CommandmentSheet({ shelf, meta, isRead, onOpenTopic, onGoToRef, onStep, onClose, tall }) {
  const cmd = shelf.commandment;
  const raw = String(cmd.verse || '');
  const closed = raw.endsWith('”');
  const verse = raw.slice(raw.startsWith('“') ? 1 : 0, closed ? -1 : raw.length);
  const label = `The ${cmd.ordinal} Commandment`;
  const num = Number(shelf.num) || 0;
  const prev = num > 1 ? ANSWERS_COMMANDMENTS[num - 2] : null;
  const next = num && num < ANSWERS_COMMANDMENTS.length ? ANSWERS_COMMANDMENTS[num] : null;
  const n = shelf.topics.length;
  return (
    <AnsSheet label={label} tall={tall} onClose={onClose}
      head={<><p className="ans-k ans-sh-k">{label}</p>{num ? <span className="ans-sh-m">{num + ' of ' + ANSWERS_COMMANDMENTS.length}</span> : null}</>}>
      <h2 className="ans-h2 ans-cmd-t">{String(shelf.label).replace(/^\d+\.\s*/, '')}</h2>
      <p className={'ans-verse' + (closed ? ' is-closed' : '')} data-copy-ref={sheetReference(cmd.ref)}>{verse}</p>
      <div className="ans-head">
        <span className="ans-meta">{cmd.ref + SEP + 'NKJV'}</span>
        {onGoToRef ? <button type="button" className="ans-textbtn" onClick={() => onGoToRef(cmd.ref)}>Go to Scripture<Chev /></button> : null}
      </div>
      <div className="ans-sechead"><h3 className="ans-h2">Topics</h3><span className="ans-count">{n === 1 ? '1' + NBSP + 'topic' : n + NBSP + 'topics'}</span></div>
      <div className="ans-box is-inset">
        {shelf.topics.map((e) => (
          <AnsRow key={e.id} title={<LeadTitle title={e.title} />}
            sub={<>{answersRowSub(e, meta && meta[e.id])}{isRead(e.id) ? <>{SEP}<ReadMark /></> : null}</>}
            onClick={() => onOpenTopic(e.id, null, 'Answers')} />
        ))}
      </div>
      {onStep && (prev || next) ? (
        <div className="ans-two ans-cmd-step">
          {prev ? (
            <button type="button" className="ans-tile-btn" aria-label={'Previous commandment: ' + prev.numeral + ', ' + prev.label} onClick={() => onStep(prev.n)}>
              <Chev dir="left" />{prev.numeral + SEP + prev.label}
            </button>
          ) : <span />}
          {next ? (
            <button type="button" className="ans-tile-btn" aria-label={'Next commandment: ' + next.numeral + ', ' + next.label} onClick={() => onStep(next.n)}>
              {next.numeral + SEP + next.label}<Chev />
            </button>
          ) : null}
        </div>
      ) : null}
    </AnsSheet>
  );
}

/** "Opens in your browser"-style sub for a link the About sheet lists: its domain, or PDF / Dropbox. */
function linkSub(url) {
  const w = answersMediaSource({ url, kind: 'link' });
  return w === 'PDF' || w === 'Dropbox' ? w : answersDomain(url);
}

/**
 * f12: the site's About page, its Sister Sites (9), Site Promotion and Trumpet Call card, word for word
 * (ANSWERS_SITE_META), then the copyright, the captured date and which words are the app's.
 * @param {{ site: any, onOpenTopic: Function, onClose: () => void }} props
 */
export function AboutSheet({ site, onOpenTopic, onClose }) {
  const about = site.about || {};
  const tc = site.trumpetCall || { links: [] };
  const inline = (tc.links || [])[0];
  const text = String(tc.text || '');
  const at = inline ? text.indexOf(inline.label) : -1;
  const lines = (s) => s.split('\n').flatMap((l, i) => (i ? [<br key={'b' + i} />, l] : [l]));
  return (
    <AnsSheet label="About this collection" tall onClose={onClose} head={<h2 className="ans-sh-t">About this collection</h2>}>
      {/* WA2 (a-about): what this is, the two in-app doors in one card, then the web links in another */}
      <h3 className="ans-about-t">{about.title}</h3>
      <p className="ans-about-lede">{'Passages from The Volumes of Truth gathered by topic, as arranged on ' + answersDomain(site.site) + '. Captured' + NBSP + site.capturedAt + '.'}</p>
      <div className="ans-box is-inset">
        {(about.see || []).map((r) => (
          <AnsRow key={'s' + r.id} one title={<><span className="ans-lead">See:</span>{' ' + r.title}</>} onClick={() => onOpenTopic(r.id, null, 'Answers')} />
        ))}
        {(about.alsoSee || []).map((r) => (
          <AnsRow key={'a' + r.id} one title={<><span className="ans-lead">Also See:</span>{' ' + r.title}</>} onClick={() => onOpenTopic(r.id, null, 'Answers')} />
        ))}
      </div>
      <div className="ans-sechead"><h3 className="ans-h2">Sister Sites</h3><span className="ans-count">Open in your browser</span></div>
      <div className="ans-box is-inset">
        <AnsRow title={'Visit ' + answersDomain(site.site)} sub="Opens in your browser" href={site.site} />
        {(site.sisterSites || []).map((s) => { const r = answersSisterRow(s); return <AnsRow key={s.url} title={r.title} sub={r.sub} href={s.url} label={r.title === s.label ? undefined : r.label} />; })}
      </div>
      {site.promotion ? (
        <>
          <h3 className="ans-foot-h3">Site Promotion</h3>
          <AnsRow title={site.promotion.label} sub={linkSub(site.promotion.url)} href={site.promotion.url} />
          <p className="ans-note">{site.promotion.note}</p>
        </>
      ) : null}
      <h3 className="ans-foot-h3">{tc.title}</h3>
      <p className="ans-quote">
        {at >= 0 ? (
          <>
            {lines(text.slice(0, at))}
            <a className="letter-link-ref" href={inline.url} target="_blank" rel="noopener noreferrer">{inline.label}<AnsIcon name="ext" className="ans-ext" /></a>
            {lines(text.slice(at + inline.label.length))}
          </>
        ) : lines(text)}
      </p>
      {(tc.links || []).slice(1).map((L) => (
        <React.Fragment key={L.url + L.label}>
          <AnsRow title={L.label} sub={linkSub(L.url)} href={L.url} />
          {L.note ? <p className="ans-note">{L.note}</p> : null}
        </React.Fragment>
      ))}
      <p className="ans-credit">
        {site.copyright}<br />
        {'This is the site’s page “My wiki:About”, captured from ' + answersDomain(site.site) + ' on' + NBSP + site.capturedAt + '.'}<br />
        The words, headings and order are the site’s. These are the app’s: the group short names, the commandment short labels (“No other gods” to “Do not covet”), the “Topics & Doctrines” label, Charts & videos, the questions, Surprise me and the reading path.<br />
        {/* 0125 C: the self-explanations the screens carried, here once */}
        {'The site numbers its twelve “Thus Says The Lord...” groups; the short names are ours. The site’s “Other Topics” is called ' + ANSWERS_OTHER_LABEL + ' here.'}<br />
        A–Z files each topic under its first main word: “Regarding The Holy Days of God” is under H.
      </p>
    </AnsSheet>
  );
}

const MAX_ZOOM = 5;
const DOUBLE_TAP_ZOOM = 2.5;

/**
 * O4: a chart in a tall sheet. Pinch and pan live on the stage only (the page's own pinch stays
 * off); a double tap zooms to 2.5x at the finger, or back out; a mouse wheel zooms at the cursor and the
 * stage's keys zoom (+ - 0) and pan (arrows) (idea audit 10-23, s28.5). The image is precached.
 * @param {{ chart: { title: string, src: string }, onClose: () => void }} props
 */
export function ChartViewer({ chart, onClose }) {
  const stageRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const imgRef = React.useRef(/** @type {HTMLImageElement | null} */ (null));
  const view = React.useRef({ s: 1, x: 0, y: 0 });
  const [zoomed, setZoomed] = React.useState(false);
  React.useEffect(() => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return undefined;
    /** @type {Map<number, { x: number, y: number }>} */
    const pts = new Map();
    let pinch = null, pan = null, lastTap = 0;
    const apply = () => {
      const v = view.current;
      const r = stage.getBoundingClientRect();
      const w = img.offsetWidth * v.s, h = img.offsetHeight * v.s;
      const bx = img.offsetLeft, by = img.offsetTop;
      // keep the picture over the stage: no edge pulled inside it while there is more beyond
      const minX = Math.min(0, r.width - w - bx), maxX = Math.max(0, -bx);
      const minY = Math.min(0, r.height - h - by), maxY = Math.max(0, -by);
      if (v.s > 1) { v.x = Math.min(maxX, Math.max(minX, v.x)); v.y = Math.min(maxY, Math.max(minY, v.y)); } else { v.x = 0; v.y = 0; }
      img.style.transform = v.s === 1 ? '' : `translate(${v.x}px, ${v.y}px) scale(${v.s})`;
    };
    const local = (p) => { const r = stage.getBoundingClientRect(); return { x: p.x - r.left - img.offsetLeft, y: p.y - r.top - img.offsetTop }; };
    const zoomAt = (s, at) => {
      const v = view.current;
      const ns = Math.min(MAX_ZOOM, Math.max(1, s));
      v.x = at.x - (at.x - v.x) * (ns / v.s);
      v.y = at.y - (at.y - v.y) * (ns / v.s);
      v.s = ns;
      apply();
      if (ns > 1) setZoomed(true);
    };
    const onDown = (/** @type {PointerEvent} */ e) => {
      try { stage.setPointerCapture(e.pointerId); } catch (_e) { /* best-effort */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: view.current.s };
        pan = null;
      } else if (pts.size === 1) {
        const now = Date.now();
        if (now - lastTap < 300) {
          lastTap = 0;
          zoomAt(view.current.s > 1 ? 1 : DOUBLE_TAP_ZOOM, local({ x: e.clientX, y: e.clientY }));
          return;
        }
        lastTap = now;
        pan = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y };
      }
    };
    const onMove = (/** @type {PointerEvent} */ e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        zoomAt(pinch.s * (d / pinch.d), local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));
      } else if (pan && view.current.s > 1) {
        view.current.x = pan.vx + (e.clientX - pan.x);
        view.current.y = pan.vy + (e.clientY - pan.y);
        apply();
      }
    };
    const onUp = (/** @type {PointerEvent} */ e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!pts.size) pan = null;
    };
    // a mouse wheel zooms at the cursor; the keys zoom at the middle (+ - 0) and pan (arrows)
    const onWheel = (/** @type {WheelEvent} */ e) => {
      e.preventDefault();
      zoomAt(view.current.s * Math.exp(-e.deltaY / 400), local({ x: e.clientX, y: e.clientY }));
    };
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      const mid = { x: img.offsetWidth / 2, y: img.offsetHeight / 2 };
      const v = view.current;
      const step = 48;
      if (e.key === '+' || e.key === '=') zoomAt(v.s * 1.25, mid);
      else if (e.key === '-' || e.key === '_') zoomAt(v.s / 1.25, mid);
      else if (e.key === '0') zoomAt(1, mid);
      else if (v.s > 1 && e.key.startsWith('Arrow')) {
        if (e.key === 'ArrowLeft') v.x += step; else if (e.key === 'ArrowRight') v.x -= step;
        else if (e.key === 'ArrowUp') v.y += step; else v.y -= step;
        apply();
      } else return;
      e.preventDefault();
    };
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('keydown', onKey);
    return () => {
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('keydown', onKey);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
    };
  }, []);
  return (
    <AnsSheet label={chart.title} tall viewer onClose={onClose} head={<h2 className="ans-row-title">{chart.title}</h2>}>
      <div className="ans-zoom" ref={stageRef} tabIndex={0} role="group" aria-label={chart.title + ': + and - zoom, arrows move'}>
        <img ref={imgRef} src={chart.src} alt={chart.title + ', a chart'} draggable={false} />
      </div>
      {zoomed ? null : <p className="ans-meta">Pinch, double-tap or scroll to zoom</p>}
    </AnsSheet>
  );
}
