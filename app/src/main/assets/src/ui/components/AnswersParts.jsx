/** @jsx h */
/** @jsxFrag Fragment */
/* ═══════════════════════════════════════════════════════════════════════
   AnswersParts — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The small pieces every Answers browse screen draws (AOGCG final design
   §5, "Component catalogue"): the inline SVG icons (the CSP is hash-locked,
   so no data URIs, icon font or emoji), the row (title, sub, chevron or ↗),
   a title's muted lead words, the "✓ Read" mark, the sidecars hook, and the
   classes the Answers .screen-layout wears. Words come from
   utils/answers-browse.js; nothing here writes copy of its own.
   ═══════════════════════════════════════════════════════════════════════ */

import { h, Fragment } from '../jsx-h.js';
import { NBSP, answersLeadSplit } from '../../utils/answers-browse.js';
import { loadAnswersMeta } from '../../utils/sync-loaders.js';

/** 24 × 24 outline paths (§2.4). */
export const ANS_ICONS = Object.freeze({
  chev: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  up: 'M6 15l6-6 6 6',
  left: 'M15 5l-7 7 7 7',
  info: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 11v5M12 8v.01',
  search: 'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.5 15.5L20 20',
  close: 'M6 6l12 12M18 6L6 18',
  shuffle: 'M4 7h3c4 0 6 10 10 10h3M4 17h3c1.5 0 2.7-1.4 3.7-3M14 9.5c.9-1.4 2-2.5 3-2.5h3M18 4l3 3-3 3M18 14l3 3-3 3',
  chart: 'M4 20h16M7 16v-5M12 16V6M17 16v-8',
  ext: 'M14 5h5v5M19 5l-8 8M18 14v5H5V6h5',
  play: 'M9 6.5v11l9-5.5z',
  audio: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H4zM17 15h3v5h-3z',
  doc: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
  download: 'M12 4v11M8 11l4 4 4-4M5 19h14',
  tick: 'M5 12.5l4.5 4.5L19 7',
  list: 'M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01',
  zoom: 'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.5 15.5L20 20M8 10.5h5M10.5 8v5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
});

/**
 * One inline icon, aria-hidden.
 * @param {{ name: keyof typeof ANS_ICONS, className?: string, width?: number | string }} props
 */
export function AnsIcon({ name, className = 'ans-ico', width }) {
  const sw = className.startsWith('ans-chev') ? '1.6' : className === 'ans-tick' ? '2' : className === 'ans-ext' ? '1.6' : className ? '1.5' : '1.8';
  return (
    <svg className={className || undefined} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width || sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ANS_ICONS[name]} />
    </svg>
  );
}

/** @param {{ dir?: 'chev' | 'down' | 'up' | 'left' }} props */
export function Chev({ dir = 'chev' }) {
  return <AnsIcon name={dir} className="ans-chev" />;
}

/** "✓ Read" in words (a row's sub), or the tick alone (a commandment cell). @param {{ bare?: boolean }} props */
export function ReadMark({ bare }) {
  return (
    <span className="ans-read">
      <AnsIcon name="tick" className="ans-tick" />
      {bare ? null : NBSP + 'Read'}
    </span>
  );
}

/** A title with its lead words muted ("[Regarding] The Holy Days of God"); the title stays whole. */
export function LeadTitle({ title }) {
  const { lead, rest } = answersLeadSplit(title);
  if (!lead) return <>{title}</>;
  return <><span className="ans-lead">{lead}</span>{' ' + rest}</>;
}

/**
 * A row (§5 "Row"): an optional numeral or icon, the title and its sub, then a chevron, or ↗ for a
 * link that leaves the app (href; it opens outside, as every external link in the app does).
 * @param {{ title: any, sub?: any, onClick?: (e: any) => void, href?: string, num?: any, icon?: keyof typeof ANS_ICONS,
 *   one?: boolean, label?: string, haspopup?: boolean, className?: string, onPointerDown?: (e: any) => void,
 *   rowRef?: any, dataKey?: string }} props
 */
export function AnsRow({ title, sub, onClick, href, num, icon, one, label, haspopup, className, onPointerDown, rowRef, dataKey }) {
  const cls = 'ans-row' + (one ? '' : ' is-2') + (className ? ' ' + className : '');
  const body = (
    <>
      {num != null ? <span className="ans-num">{num}</span> : null}
      {icon ? <AnsIcon name={icon} /> : null}
      <span className="ans-row-body">
        <span className="ans-row-title">{title}</span>
        {sub ? <span className="ans-row-sub">{sub}</span> : null}
      </span>
      {href ? <AnsIcon name="ext" /> : <Chev />}
    </>
  );
  if (href) {
    return <a className={cls} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} ref={rowRef}>{body}</a>;
  }
  return (
    <button type="button" className={cls} onClick={onClick} aria-label={label} aria-haspopup={haspopup ? 'dialog' : undefined}
      onPointerDown={onPointerDown} ref={rowRef} data-ans-key={dataKey}>
      {body}
    </button>
  );
}

/**
 * The sidecars (ANSWERS_META, src/data/answers-meta.js): the words beyond each topic's text that the
 * browse screens count (minutes, media, sections). null until the lazy file lands; the screens
 * draw without them first (subs fill in place, §3 f01 "Loading").
 * `enabled` false (a reading screen that is not an Answers topic) asks for nothing.
 * @param {boolean} [enabled]
 * @returns {Record<string, any> | null}
 */
export function useAnswersMeta(enabled = true) {
  return useAnswersMetaState(enabled)[0];
}

/**
 * The sidecars and whether they failed: a load that leaves no ANSWERS_META (offline, a 404) is
 * tried once more 3 s on (the loader forgets a failed load), then reported failed.
 * @param {boolean} [enabled]
 * @returns {[Record<string, any> | null, boolean]}
 */
export function useAnswersMetaState(enabled = true) {
  const read = () => (typeof window !== 'undefined' && /** @type {any} */ (window).ANSWERS_META) || null;
  const [meta, setMeta] = React.useState(read);
  const [tries, setTries] = React.useState(0);
  React.useEffect(() => {
    if (meta || !enabled || tries > 1) return undefined;
    let live = true, t = /** @type {any} */ (0);
    loadAnswersMeta().then(() => {
      if (!live) return;
      if (read()) setMeta(read());
      else if (tries) setTries(2);
      else t = setTimeout(() => setTries(1), 3000);
    });
    return () => { live = false; clearTimeout(t); };
  }, [meta, enabled, tries]);
  return [enabled ? meta : null, enabled && !meta && tries > 1];
}

/* The reading path (f01 #8, U16): the topic finished last, kept on this device only. The landing's
   Continue row goes on from it in the site's order. Settings › Reading › Answers Reading Path off
   stops the writes and hides the path; what is kept stays. */
const PATH_KEY = 'vot-answers-path';

/** The topic the reader finished last ('' when none). */
export function readAnswersPath() {
  try { return localStorage.getItem(PATH_KEY) || ''; } catch (_e) { return ''; }
}

/** Remember the topic just finished (the answers-entry route's onMarkRead). */
export function writeAnswersPath(id) {
  try { if (id) localStorage.setItem(PATH_KEY, String(id)); } catch (_e) { /* private mode: nothing kept */ }
}

/** The Answers .screen-layout classes: the desktop grid (ans-wide), Text Size 2 and up (ans-ts2). */
export function answersLayoutClass(fontScale, wide) {
  const fs = parseFloat(String(fontScale == null ? '1' : fontScale));
  return [wide ? 'ans-wide' : '', Number.isFinite(fs) && fs >= 2 ? 'ans-ts2' : ''].filter(Boolean).join(' ');
}
