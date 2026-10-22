/** @jsx h */
/** @jsxFrag Fragment */
/* ═══════════════════════════════════════════════════════════════════════
   AnswersTopic — an Answers topic page (Cluster D, esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   AOGCG final design f07-f11, O3, O4: the hero (eyebrow, title, meta line,
   contents line), the site's own sections and excerpts, inline links and
   media, the foot in the page's own order, the running head, the Contents
   sheet and its desktop rail (AnswersContents.jsx), the note sheet.
   WtlbEntryView draws it for volKey 'answers' and keeps what every Format B
   entry has: the scripture sheet, the landings, read-along and find.

   Paragraphs render once (StaticSubtree: the annotation engine paints into
   them), plain first and decorated when ANSWERS_META lands; their key holds
   which, so the decorated element replaces the plain one whole. Every
   decoration is the paragraph's own characters (utils/answers-topic.js, D3).
   Taps inside them are read by one delegated handler from data-ans
   attributes, so a frozen subtree never holds a stale callback.

   The running head only READS the scroller (IntersectionObserver plus a
   passive scroll listener, in rAF): scrollTop keeps its five writers. A
   Contents jump is the reader-initiated scrollIntoView the A–Z and the
   search landing already make (WtlbEntryView jumpToPara).
   ═══════════════════════════════════════════════════════════════════════ */

import { h, Fragment } from '../jsx-h.js';
import { AnsIcon, AnsRow, Chev, LeadTitle, ReadMark } from './AnswersParts.jsx';
import { FoldRow, TocRows, AnswersContentsSheet } from './AnswersContents.jsx';
import { AnsSheet, ChartViewer, CommandmentSheet } from '../sheets/AnswersSheets.jsx';
import { SEP, NBSP, pl, answersRowSub, answersPlaceOf, answersLeadSplit, answersTopSections, answersShelfByKey, ANSWERS_FD_INDEX_SHORT } from '../../utils/answers-browse.js';
import { ANSWERS_MAIN_PAGE_ID, answersShortTitle, answersPassageCount } from '../../utils/answers-shelves.js';
import { ANSWERS_FD_INDEX_ID, answersSiteNav, answersSiteShelfOf } from '../../utils/answers-site.js';
import {
  answersEyebrow, answersLongTitle, answersHeroMeta, answersContentsLine, answersTocRows, answersTocRowAt,
  answersRunTitle, answersFootOrder, answersRelated, answersFootMedia, answersMediaKindSub, answersMediaLabel,
  answersLinkSub, answersInline, answersParaMeta, answersParaPlan, answersFdLines, answersChars, answersFoldable,
  answersNoteRange, answersNoteLabel,
} from '../../utils/answers-topic.js';
import { answersFragmentStart } from '../../utils/answers-links.js';
import { wtlbHlKey } from '../../utils/hl-keys.js';

/** The pictures' own sizes, so a figure holds its place before it decodes. */
const IMG_WH = { 'answers-chart-chronology.jpg': [2000, 1545], 'answers-holidays-vs-holy-days.jpg': [1472, 960], 'answers-banner.jpg': [1200, 304] };

/**
 * The page's keyed paragraphs were mounted anew (the body painted, decorated, folded or unfolded):
 * the annotation pass runs again over them (use-dom-annotation-sync), so the reader's marks are on them.
 */
export function answersHlDomChanged() {
  const w = /** @type {any} */ (window);
  w.__hlDomV = (w.__hlDomV || 0) + 1;
  window.dispatchEvent(new Event('vot-hl-dom'));
}

/** How much of the page's top the running head covers (0 on desktop, where it is hidden). */
export function answersHeadCover() {
  const rh = typeof document !== 'undefined' ? /** @type {HTMLElement | null} */ (document.querySelector('.ans-runhead')) : null;
  return rh && getComputedStyle(rh).display !== 'none' ? rh.offsetHeight : 0;
}

/* ── A paragraph's decorated runs, as elements ─────────────────────── */

/** Runs that are one plain tag: [element, class]. */
const TAGS = { b: ['strong'], i: ['em'], u: ['u', 'ans-u'], small: ['small'], big: ['span', 'ans-h2'], sr: ['span', 'sr-only'], lead: ['span', 'ans-lead'] };

/**
 * @param {import('../../utils/answers-topic.js').AnsNode[]} nodes
 * @param {number} pi the paragraph
 * @param {string} kb key base
 * @returns {any[]}
 */
function renderNodes(nodes, pi, kb) {
  return nodes.map((n, j) => {
    if (typeof n === 'string') return n;
    const key = kb + j;
    const kids = n.k ? renderNodes(n.k, pi, key + '.') : null;
    const d = n.d || {};
    const tag = TAGS[n.t];
    if (tag) return h(tag[0], { key, className: tag[1] }, kids);
    if (n.t === 'br') return <br key={key} />;
    if (n.t === 'ext') return <AnsIcon key={key} name="ext" className="ans-ext" />;
    // A cite's and a link's words sit in span.ans-tb, drawn above every target's 14px band (app.css): where two
    // bands overlap (links on adjacent lines, the names of an "Also see:" line) a tap on a link's own words is
    // still that link's. The span wraps the words only: the paragraph's text is unchanged (D3).
    if (n.t === 'cite') return <a key={key} className="wtlb-cite" href="#" data-ans="cite" data-p={pi} data-n={d.n} data-ref={d.ref}><span className="ans-tb">{kids}</span></a>;
    if (n.t === 'sup') return <sup key={key} className="ans-note-ref" role="button" tabIndex={0} data-ans="note" data-p={pi} data-at={d.N.at}>{kids}</sup>;
    const bare = n.t === 'bare';
    const X = (bare ? d.B : d.L) || {};
    const go = X.kind === 'external' && X.url
      ? { href: X.url, target: '_blank', rel: 'noopener noreferrer' }
      : { href: '#', 'data-ans': bare ? 'bare' : X.li == null ? 'contents' : 'link', 'data-p': pi, 'data-l': bare ? undefined : X.li, 'data-b': bare ? d.n : undefined };
    // the bare glyph is inline SVG (the CSP blocks data URIs): it adds no text node
    if (bare) return <a key={key} className="ans-bare" aria-label={'Open ' + (X.title || X.query || 'the linked page')} {...go}><AnsIcon name="link" className="" /></a>;
    return <a key={key} className="letter-link-ref" {...go}><span className="ans-tb">{kids}</span></a>;
  });
}

/** A video card's inside: the play disc, the site's label, what it opens, ↗. */
const mediaInner = (m) => (
  <>
    <span className="ans-disc" aria-hidden="true"><AnsIcon name="play" /></span>
    <span className="ans-row-body"><span className="ans-row-title">{answersMediaLabel(m)}</span><span className="ans-media-sub">{answersMediaKindSub(m)}</span></span>
    <AnsIcon name="ext" />
  </>
);

/** A topic row's link words with the title's lead muted ("[Regarding] The Holy Spirit"); no new text. */
function leadLinkNodes(nodes, title) {
  const { lead } = answersLeadSplit(title);
  const a = lead ? nodes.find((x) => typeof x !== 'string' && x.t === 'a') : null;
  const k = a && typeof a !== 'string' ? a.k : null;
  if (k && typeof k[0] === 'string' && k[0].startsWith(lead + ' ')) k.splice(0, 1, { t: 'lead', k: [lead] }, k[0].slice(lead.length));
  return nodes;
}

/** The figures a paragraph carries (charts); a tap opens the viewer. */
function Figures({ meta, i }) {
  const figs = ((meta && meta.media) || []).filter((m) => m.kind === 'image' && m.at === i);
  return figs.map((m) => {
    const wh = /** @type {Record<string, number[]>} */ (IMG_WH)[m.src] || [];
    return (
      <figure key={m.src} className="ans-fig" role="button" tabIndex={0} aria-haspopup="dialog" data-ans="fig" data-src={m.src} data-title={m.title}>
        <img src={m.src} alt={m.title + ', a chart'} width={wh[0]} height={wh[1]} />
        <figcaption className="ans-figcap"><AnsIcon name="zoom" />Tap to zoom</figcaption>
      </figure>
    );
  });
}

/** The spaces around a run's words (an also-see row keeps them outside its link). */
function trimRange(raw, from) {
  const chars = answersChars(raw).chars.filter((c) => c.r >= from);
  let a = 0, b = chars.length;
  while (a < b && chars[a].c.trim() === '') a++;
  while (b > a && chars[b - 1].c.trim() === '') b--;
  const text = (x, y) => chars.slice(x, y).map((c) => (c.c === '\n' ? '' : c.c)).join('');
  return { lead: text(0, a), from: a < chars.length ? chars[a].r : String(raw).length, to: b > a ? chars[b - 1].r + 1 : from, tail: text(b, chars.length) };
}

/**
 * One keyed paragraph, decorated as its plan says (answersParaPlan). Memoised: a landing's pulse
 * (on, then off 4 s later) re-renders the one paragraph it names, not every paragraph's plan.
 */
const Para = React.memo(/**
 * @param {{ entry: any, meta: any, metaAll: any, byId: Map<string, any>, i: number, landed: boolean, first: boolean,
 *   ts2: boolean, secIdx: number | null }} props
 */ function Para({ entry, meta, metaAll, byId, i, landed, first, ts2, secIdx }) {
  const p = entry.paragraphs[i] || {};
  const raw = String(p.text || '');
  const plan = answersParaPlan(entry, meta, i);
  const pm = answersParaMeta(meta, i);
  const hl = { 'data-hl-key': wtlbHlKey(entry.id, i), 'data-hl-dom': true };
  const pulse = landed ? ' pulse' : '';
  const nodes = (o) => renderNodes(answersInline(raw, pm, o), i, 'n');
  const S = (c) => <StaticSubtree>{c}</StaticSubtree>;
  switch (plan.kind) {
    case 'src': {
      const w = plan.wording;
      return (
        <p className={'letter-para ans-src' + pulse} {...hl}>{S(
          <a href="#" data-ans="src" data-p={i} aria-label={w + ' ' + plan.title + ', ' + plan.collection + '. Opens the letter.'}>
            <span className="sr-only">~ [From </span><span className="ans-src-t" data-w={w}>{plan.title}</span>
            <span className="sr-only"> ~ </span><span className="ans-src-c">{plan.collection}</span><span className="sr-only">]</span><Chev />
          </a>)}
        </p>
      );
    }
    case 'src-ns': {
      const a = plan.attr;
      const body = nodes({ noLinks: true });
      return (
        <p className={'letter-para ans-src' + pulse} {...hl}>{S(
          a.inApp ? <a href="#" data-ans="srcns" data-p={i}>{body}<Chev /></a>
            : a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer">{body}<AnsIcon name="ext" className="ans-ext" /></a>
              : <span>{body}</span>)}
        </p>
      );
    }
    case 'orn':
      return <p className={'letter-para ans-orn' + (plan.minor ? ' is-minor' : '') + pulse} aria-hidden="true" {...hl}>{S(nodes({}))}</p>;
    case 'sh': {
      const H = plan.section.level === 2 ? 'h3' : 'h2';
      return (
        <>
          <H className={'letter-para ans-sh' + (plan.section.level === 2 ? ' is-h3' : '') + (first ? ' is-first' : '') + pulse}
            id={plan.section.anchor} tabIndex={-1} data-ans-sec={secIdx == null ? undefined : secIdx} {...hl}>{S(nodes({}))}</H>
          <Figures meta={meta} i={i} />
        </>
      );
    }
    case 'metarow':
      return <p className={'letter-para ans-metarow' + pulse} {...hl}>{S(nodes({}))}</p>;
    case 'alsosee': {
      const r = trimRange(raw, plan.restAt);
      const lead = <><span className="sr-only">• </span><span className="ans-lead"><em>{plan.lead}</em></span>{r.lead}</>;
      const real = pm ? pm.links.filter((l) => l.kind !== 'contents') : [];
      // several names ("A"; "B"; "C"): each its own inline link, as in running text; the line is not one target
      if (real.length > 1) {
        return <p className={'letter-para ans-alsosee is-multi' + pulse} {...hl}>{S(<>{lead}<span>{renderNodes(answersInline(raw, pm, { from: r.from, to: r.to }), i, 'a')}</span>{r.tail}</>)}</p>;
      }
      // one name: the whole row is its link (an external one opens in the browser, ↗)
      const L = real[0];
      const ext = !!(L && L.kind === 'external' && L.url);
      const go = ext ? { href: L.url, target: '_blank', rel: 'noopener noreferrer' }
        : L ? { href: '#', 'data-ans': 'link', 'data-p': i, 'data-l': pm.links.indexOf(L) } : { href: '#', 'data-ans': 'alsosee', 'data-p': i };
      return (
        <p className={'letter-para ans-alsosee' + pulse} {...hl}>{S(<>
          {lead}
          <a className="letter-link-ref ans-alsosee-a" {...go}>{renderNodes(answersInline(raw, null, { from: r.from, to: r.to }), i, 'a')}</a>
          {r.tail}{ext ? <AnsIcon name="ext" className="ans-ico ans-chev" /> : <Chev />}
        </>)}</p>
      );
    }
    case 'fd':
      return (
        <p className={'letter-para ans-fd' + pulse} {...hl}>{S(answersFdLines(raw).map((ln, k) => {
          if (ln.kind === 'truth') {
            // a line whose link leaves the app (a PDF, the TVOT main page) is a real link to it, ↗
            const L = pm && pm.links.find((l) => l.at >= ln.from && l.at < ln.to);
            const ext = !!(L && L.kind === 'external' && L.url);
            const go = ext ? { href: L.url, target: '_blank', rel: 'noopener noreferrer' } : { href: '#', 'data-ans': 'fdtruth', 'data-p': i, 'data-from': ln.from, 'data-to': ln.to };
            return (
              <a key={k} className="ans-fd-truth" {...go}>
                <strong className="ans-lead">{ln.lead}</strong>{' '}
                <strong>{renderNodes(answersInline(raw, pm, { from: /** @type {number} */ (ln.leadEnd) + 1, to: ln.to - 2, noLinks: true, noBold: true }), i, 't' + k)}</strong>
                {ext ? <AnsIcon name="ext" className="ans-ico ans-chev" /> : <Chev />}
              </a>
            );
          }
          if (ln.kind === 'fd') {
            return <span key={k} className="ans-fd-line"><span className="ans-lead">False Doctrine:</span>{renderNodes(answersInline(raw, pm, { from: ln.leadEnd, to: ln.to }), i, 'f' + k)}</span>;
          }
          return <span key={k} className="ans-fd-line">{renderNodes(answersInline(raw, pm, { from: ln.from, to: ln.to }), i, 'l' + k)}</span>;
        }))}</p>
      );
    case 'media': {
      // The site embeds this video; the page links to it (no embeds, no remote thumbnails).
      const m = plan.media;
      return (
        <a className={'letter-para ans-media' + pulse} href={m.url} target="_blank" rel="noopener noreferrer" {...hl}>{S(mediaInner(m))}</a>
      );
    }
    case 'linkrow':
      return (
        <p className={'letter-para ans-linkrow' + pulse} data-sub={plan.sub} {...hl}>{S(<>
          <span className="ans-disc" aria-hidden="true"><AnsIcon name={plan.icon} /></span>
          <span className="ans-linkrow-t"><span className="sr-only">{plan.sr}</span>{nodes({ from: plan.from, noExt: true, wrapLink: plan.L.kind === 'contents' ? { kind: 'contents' } : null })}</span>
          {plan.ext ? <AnsIcon name="ext" /> : <Chev />}
        </>)}</p>
      );
    case 'bulletlink': {
      const L = plan.L;
      const target = L.kind === 'topic' && !L.anchor ? byId.get(L.id) : null;
      let ns = answersInline(raw, pm, { from: plan.from, noExt: true });
      if (target) ns = leadLinkNodes(ns, target.title);
      return (
        <p className={'letter-para ans-linkrow is-plain' + pulse} data-sub={answersLinkSub(L, byId, metaAll) || undefined} {...hl}>{S(<>
          <span className="ans-linkrow-t"><span className="sr-only">{plan.sr}</span>{renderNodes(ns, i, 'b')}</span>
          {L.kind === 'external' ? <AnsIcon name="ext" /> : <Chev />}
        </>)}</p>
      );
    }
    default: {
      const al = p.align === 'center' ? ' is-center' + (raw.indexOf('\n') >= 0 ? ' letter-poetry' : '') : p.align === 'justify' ? ' is-justify' : p.align === 'right' ? ' is-right' : '';
      const ind = pm && pm.marks && pm.marks.indent ? { paddingLeft: pm.marks.indent * (ts2 ? 12 : 24) + 'px' } : undefined;
      return (
        <>
          <p className={'letter-para' + al + pulse} style={ind} {...hl}>{S(nodes({}))}</p>
          <Figures meta={meta} i={i} />
        </>
      );
    }
  }
});

/** Whether paragraph i closes a passage (a source line, an ornament, a heading): the next one starts one. */
function closesPassage(entry, meta, i) {
  const k = answersParaPlan(entry, meta, i).kind;
  return k === 'src' || k === 'src-ns' || k === 'orn' || k === 'sh';
}

/* ── Hero (f07, f11) ──────────────────────────────────────────────── */

/**
 * @param {{ entry: any, entries: any[] | null, meta: any, pending: boolean, heroRef: any, onEyebrow: (shelf: any) => void,
 *   onContents: () => void, h1: any }} props
 */
function Hero({ entry, entries, meta, pending, heroRef, onEyebrow, onContents, h1 }) {
  const eb = entries ? answersEyebrow(entries, entry) : null;
  const cl = meta ? answersContentsLine(entry, meta) : null;
  return (
    <>
      {entry.id === ANSWERS_MAIN_PAGE_ID ? <img className="ans-banner" src="answers-banner.jpg" alt="Answers Only God Can Give" width="1200" height="304" /> : null}
      <header className="ans-hero" ref={heroRef}>
        {eb ? (eb.shelf
          ? <a className="ans-eyebrow ans-label" href="#" onClick={(e) => { e.preventDefault(); onEyebrow(eb.shelf); }}>{eb.text}<Chev /></a>
          : <p className="ans-label">{eb.text}</p>) : null}
        {h1 || <h1 className={'ans-display' + (answersLongTitle(entry) ? ' is-long' : '')}>{entry.title}</h1>}
        {/* no line once the sidecars are in without this topic's row, or could not load */}
        {meta ? <p className="ans-meta">{answersHeroMeta(entry, meta)}</p> : pending ? <p className="ans-meta"><em>Loading contents…</em></p> : null}
        {cl ? (
          <button type="button" className="ans-contents-line" aria-haspopup="dialog" onClick={onContents}>
            <span className="ans-names">{cl.names}</span><span className="ans-more">{cl.more}<Chev /></span>
          </button>
        ) : null}
      </header>
    </>
  );
}

/* ── The page ──────────────────────────────────────────────────────── */

const FOLD_KEY = 'vot-answers-fold';
function readFold(id) {
  try { return !!JSON.parse(localStorage.getItem(FOLD_KEY) || '{}')[id]; } catch (_e) { return false; }
}
function writeFold(id, on) {
  try {
    const all = JSON.parse(localStorage.getItem(FOLD_KEY) || '{}');
    if (on) all[id] = 1; else delete all[id];
    localStorage.setItem(FOLD_KEY, JSON.stringify(all));
  } catch (_e) { /* private mode: not kept */ }
}

/**
 * @typedef {object} AnswersTopicActions
 * @property {(ref: string, note: any) => void} cite      open the scripture sheet (note: the refMeta row, or null)
 * @property {(index: number, opts?: { pulse?: boolean, el?: HTMLElement | null }) => void} jump
 * @property {(index: number) => void} source             a source chip: open its letter on the passage
 * @property {(target: { collection: string, letterTitle: string }) => void} letter
 */

/**
 * @param {{ entry: any, entries: any[] | null, meta: any, metaAll: any, metaFailed?: boolean, site: any, ready: boolean, inert?: boolean,
 *   ts2: boolean, landedPara: number, mainRef: any, isRead: (id: string) => boolean, pathOn: boolean, findOn: boolean,
 *   act: AnswersTopicActions, nav: any }} props
 *   nav, the route's hand-offs: { openTopic(id, anchor), openGroup(key), openLanding(), openStudy(id, url),
 *   searchLibrary(q), goToRef(ref) }
 */
export function AnswersTopic({ entry, entries, meta, metaAll, metaFailed, site, ready, inert, ts2, landedPara, mainRef, isRead, pathOn, findOn, act, nav }) {
  const heroRef = React.useRef(/** @type {HTMLElement | null} */ (null));
  const [sheet, setSheet] = React.useState(/** @type {any} */ (null));
  const [cur, setCur] = React.useState(0);
  const [shown, setShown] = React.useState(false);
  const [foldOn, setFoldOn] = React.useState(() => readFold(entry.id));
  const [openSecs, setOpenSecs] = React.useState(/** @type {Set<number>} */ (new Set()));
  const barRef = React.useRef(/** @type {HTMLElement | null} */ (null));
  const railBarRef = React.useRef(/** @type {HTMLElement | null} */ (null));
  const pinRef = React.useRef(0);
  const sheetRef = React.useRef(sheet);
  sheetRef.current = sheet;
  const [layoutEl, setLayoutEl] = React.useState(/** @type {Element | null} */ (null));

  React.useEffect(() => { setSheet(null); setCur(0); setShown(false); setFoldOn(readFold(entry.id)); setOpenSecs(new Set()); }, [entry.id]);

  const byId = React.useMemo(() => {
    const m = new Map();
    for (const e of entries || []) m.set(e.id, e);
    return m;
  }, [entries]);
  const rows = React.useMemo(() => (meta ? answersTocRows(entry, meta) : []), [entry, meta]);
  const counted = rows.filter((r) => !r.trumpet);
  const foldable = answersFoldable(meta);
  const folded = !!foldOn && foldable && !findOn;
  const main = entry.id === ANSWERS_MAIN_PAGE_ID;
  const tcRow = rows.find((r) => r.trumpet);
  const tcAt = tcRow ? tcRow.at : entry.paragraphs.length;

  // Fold on or off moves every paragraph into or out of its section's div.ans-fold, so React mounts
  // them anew and the marks painted inside them go with the old ones: say so, and the pass re-paints.
  const foldedRef = React.useRef(folded);
  React.useEffect(() => {
    if (foldedRef.current === folded) return;
    foldedRef.current = folded;
    if (!inert && ready) answersHlDomChanged();
  }, [folded, inert, ready]);

  /* The running head: shown on scroll up once the hero has gone; its section and bar follow the page. */
  React.useEffect(() => {
    if (inert || !ready) return undefined;
    const root = mainRef.current;
    const sc = root && root.closest('.screen-scroll');
    if (!sc) return undefined;
    setLayoutEl(sc.closest('.screen-layout'));
    let heroVis = true, last = sc.scrollTop, up = 0, raf = 0;
    const IO = typeof IntersectionObserver !== 'undefined' ? IntersectionObserver : null;
    const io1 = IO && heroRef.current ? new IO((es) => {
      for (const e of es) heroVis = e.isIntersecting;
      if (heroVis && !sheetRef.current) setShown(false);
    }) : null;
    if (io1 && heroRef.current) io1.observe(heroRef.current);
    // The current section: the last heading whose top has reached the head's lower edge (48 under the
    // scroller's top), or a heading's height below it: a heading just under the head names its section. The headings' places are read once and again when the column changes size, so a
    // jump of any length names the right section (an observer only hears the headings it crossed).
    const heads = Array.from(root.querySelectorAll('[data-ans-sec]'));
    /** @type {{ k: number, y: number }[] | null} */
    let tops = null;
    const RO = typeof ResizeObserver !== 'undefined' ? ResizeObserver : null;
    const ro = RO ? new RO(() => { tops = null; }) : null;
    if (ro) ro.observe(root);
    const section = (st) => {
      if (!tops) {
        const base = sc.getBoundingClientRect().top - sc.scrollTop;
        tops = heads.map((h) => ({ k: Number(h.getAttribute('data-ans-sec')), y: h.getBoundingClientRect().top - base }));
      }
      let c = 0;
      for (const x of tops) if (x.y < st + 88 && x.k > c) c = x.k;
      setCur(c);
    };
    section(sc.scrollTop);
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const st = sc.scrollTop;
        const d = st - last;
        last = st;
        const max = sc.scrollHeight - sc.clientHeight;
        const pct = (max > 0 ? Math.min(100, Math.max(0, (st / max) * 100)) : 0).toFixed(1) + '%';
        if (barRef.current) barRef.current.style.width = pct;
        if (railBarRef.current) railBarRef.current.style.width = pct;
        section(st);
        if (sheetRef.current || pinRef.current > Date.now()) return;
        if (heroVis) { up = 0; setShown(false); return; }
        if (d < 0) { up -= d; if (up >= 8) setShown(true); } else if (d > 0) { up = 0; setShown(false); }
      });
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      sc.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      if (io1) io1.disconnect();
      if (ro) ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mainRef is a stable ref; the body's shape (meta, fold) re-observes
  }, [entry.id, ready, inert, meta, folded, openSecs]);

  /** Fold: open the section an index sits in before anything lands there. */
  const unfoldFor = (/** @type {number} */ at) => {
    if (!folded) return;
    let k = -1;
    rows.forEach((r, j) => { if (r.at <= at) k = j; });
    if (k >= 0 && !openSecs.has(k)) setOpenSecs((s) => new Set(s).add(k));
  };
  /** After the sheet has closed (and given focus back without scrolling): land under the head. */
  const landAfterClose = (/** @type {() => void} */ go) => {
    setSheet(null);
    requestAnimationFrame(() => requestAnimationFrame(() => { pinRef.current = Date.now() + 900; setShown(true); go(); }));
  };
  const jumpRow = (/** @type {number} */ k) => {
    const r = rows[k];
    if (!r) { setSheet(null); return; }
    unfoldFor(r.at);
    landAfterClose(() => {
      const root = mainRef.current;
      act.jump(r.at, { pulse: false, el: root && /** @type {HTMLElement | null} */ (root.querySelector('[data-ans-sec="' + k + '"]')) });
    });
  };
  const jumpExcerpt = (/** @type {number} */ srcAt) => {
    let i = srcAt - 1;
    while (i > 0 && !closesPassage(entry, meta, i - 1)) i--;
    const at = Math.max(0, i);
    unfoldFor(at);
    landAfterClose(() => act.jump(at, { pulse: true }));
  };

  const openShelf = (shelf) => {
    if (!shelf) return;
    if (shelf.kind === 'commandment') setSheet({ kind: 'cmd', shelf });
    else if (shelf.kind === 'other') nav.openGroup('other');
    else if (shelf.kind === 'tstl') nav.openGroup(String(shelf.num));
  };

  /** A sidecar link, in the app where it can be. */
  const openLink = (L) => {
    if (!L) return;
    if (L.kind === 'topic') {
      const k = L.id === entry.id && L.anchor ? rows.findIndex((r) => r.anchor === L.anchor) : -1;
      if (k >= 0) jumpRow(k); else nav.openTopic(L.id, L.anchor || null);
    } else if (L.kind === 'letter') {
      // the site's #:~:text= lands its letter on those words (G11): the letter marks and shows them
      const excerpt = answersFragmentStart(L.url);
      act.letter({ collection: L.collection, letterTitle: L.title, ...(excerpt ? { excerpt } : {}) });
    } else if (L.kind === 'study') nav.openStudy(L.id, L.url);
    else if (L.kind === 'search') nav.searchLibrary(L.query);
    else if (L.kind === 'scripture') act.cite(L.ref, null);
    else if (L.kind === 'contents') nav.openLanding();
    else if (L.kind === 'external' && L.url) window.open(L.url, '_blank', 'noopener');
  };
  const refNote = (pi, n) => (((meta && meta.refMeta) || {})[String(pi)] || []).find((x) => x.i === n - 1) || null;

  /** One handler for every tap in the frozen paragraphs (and the note sheet's words). */
  const onTap = (/** @type {any} */ e, /** @type {number | null} */ notePara) => {
    const el = e.target && e.target.closest ? e.target.closest('[data-ans]') : null;
    if (!el) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    const kind = el.getAttribute('data-ans');
    const pi = Number(el.getAttribute('data-p'));
    const pm = answersParaMeta(meta, pi);
    e.preventDefault();
    if (kind === 'cite') {
      if (notePara != null) setSheet(null);
      act.cite(el.getAttribute('data-ref'), refNote(pi, Number(el.getAttribute('data-n'))));
    } else if (kind === 'link') openLink(pm && pm.links[Number(el.getAttribute('data-l'))]);
    else if (kind === 'contents') nav.openLanding();
    else if (kind === 'bare') openLink(pm && pm.bare[Number(el.getAttribute('data-b'))]);
    else if (kind === 'alsosee') {
      // the plain render's row (no sidecar yet): it is one link's target only when the line has one
      const ls = pm ? pm.links.filter((l) => l.kind !== 'contents') : [];
      if (ls.length === 1) openLink(ls[0]);
    }
    else if (kind === 'fdtruth') {
      const from = Number(el.getAttribute('data-from')), to = Number(el.getAttribute('data-to'));
      openLink(pm && pm.links.find((l) => l.at >= from && l.at < to));
    } else if (kind === 'note') {
      const N = ((pm && pm.notes) || []).find((x) => String(x.at) === el.getAttribute('data-at'));
      if (N) setSheet((s) => ({ kind: 'note', N, back: notePara != null && s && s.kind === 'note' ? s : null }));
    } else if (kind === 'src') act.source(pi);
    else if (kind === 'srcns') {
      const a = meta && meta.attr && meta.attr[String(pi)];
      if (a && a.inApp) act.letter({ collection: a.inApp.collection, letterTitle: a.inApp.title });
    } else if (kind === 'fig') setSheet({ kind: 'chart', chart: { src: el.getAttribute('data-src'), title: el.getAttribute('data-title') }, from: el });
  };

  const setFold = (on) => { setFoldOn(on); writeFold(entry.id, on); setOpenSecs(new Set()); };
  const toggleSec = (k) => setOpenSecs((x) => { const y = new Set(x); if (y.has(k)) y.delete(k); else y.add(k); return y; });

  /* The body: plain first, decorated once the sidecar is in. Memoised: the head's state never re-renders it. */
  const body = React.useMemo(() => {
    if (!ready) return null;
    const ps = entry.paragraphs;
    const start = main ? 1 : 0;
    const end = Math.min(tcAt, ps.length);
    const secAt = new Map(rows.map((r, k) => [r.at, k]));
    const synth = new Map(((meta && meta.sections) || []).filter((s) => s.synthetic).map((s) => [s.at, s]));
    const metaKey = meta ? ':m' : ':p';
    /** @type {any[]} */
    const out = [];
    /** @type {{ k: number, items: any[] } | null} */
    let group = null;
    const flush = () => {
      if (!group) return;
      const g = group;
      // hidden="until-found": the browser's find opens it (beforematch); React knows only boolean hidden
      out.push(
        <div key={'fold' + g.k} className="ans-fold" ref={(el) => {
          if (!el) return;
          if (openSecs.has(g.k)) el.removeAttribute('hidden'); else el.setAttribute('hidden', 'until-found');
          if (!el.dataset.bm) { el.dataset.bm = '1'; el.addEventListener('beforematch', () => setOpenSecs((s) => new Set(s).add(g.k))); }
        }}>{g.items}</div>,
      );
      group = null;
    };
    for (let i = start; i < end; i++) {
      const k = secAt.has(i) ? /** @type {number} */ (secAt.get(i)) : null;
      if (k != null && folded) flush();
      const s = synth.get(i);
      const first = i === start;
      const head = s ? <h2 key={'syn' + i} className={'ans-sh' + (first ? ' is-first' : '')} id={s.anchor} tabIndex={-1} data-ans-sec={k == null ? undefined : k}>{s.title}</h2> : null;
      const para = (
        <Para key={entry.id + ':' + i + metaKey} entry={entry} meta={meta} metaAll={metaAll} byId={byId} i={i}
          landed={landedPara === i} first={first && !s} ts2={ts2} secIdx={s ? null : k} />
      );
      if (folded && k != null) {
        const r = rows[k];
        const btn = <FoldBtn key={'fb' + k} n={r.ex.length} open={openSecs.has(k)} onClick={() => toggleSec(k)} />;
        if (s) { out.push(head, btn); group = { k, items: [para] }; } else { out.push(para, btn); group = { k, items: [] }; }
        continue;
      }
      const into = group ? group.items : out;
      if (head) into.push(head);
      into.push(para);
    }
    flush();
    if (String((ps[end - 1] && ps[end - 1].text) || '').trim() !== '✦') out.push(<p key="orn" className="ans-orn" aria-hidden="true">✦</p>);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entry.paragraphs is corpus data; entry.id names it
  }, [entry.id, meta, ready, landedPara, ts2, folded, openSecs, rows, byId]);

  const tcBody = React.useMemo(() => {
    if (!ready || tcAt >= entry.paragraphs.length) return null;
    const out = [];
    for (let i = tcAt; i < entry.paragraphs.length; i++) {
      const k = rows.findIndex((r) => r.at === i);
      out.push(<Para key={entry.id + ':' + i + (meta ? ':m' : ':p')} entry={entry} meta={meta} metaAll={metaAll} byId={byId} i={i}
        landed={landedPara === i} first={false} ts2={ts2} secIdx={k >= 0 ? k : null} />);
    }
    return <div className="ans-reading">{out}</div>;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as the body
  }, [entry.id, meta, ready, landedPara, ts2, tcAt, rows, byId]);

  // The Main Page's H1 is its own first paragraph (keyed, C2), drawn at the title's size.
  const h1 = main ? (
    <h1 className={'letter-para ans-display is-long' + (landedPara === 0 ? ' pulse' : '')} id={(rows[0] && rows[0].anchor) || 'Answers_Only_God_Can_Give'} tabIndex={-1}
      data-hl-key={wtlbHlKey(entry.id, 0)} data-hl-dom={true} data-ans-sec={rows.length && rows[0].at === 0 ? 0 : undefined}>
      <StaticSubtree>{renderNodes(answersInline(String(entry.paragraphs[0].text || ''), null, { noBold: true }), 0, 'h')}</StaticSubtree>
    </h1>
  ) : null;

  const curRow = counted.length ? (answersTocRowAt(rows, rows[cur] ? rows[cur].at : 0) || counted[0]) : null;
  const curK = curRow ? rows.indexOf(curRow) : 0;
  const short = answersRunTitle(entry);
  // under two sections the head names the page and shows the bar; it opens nothing
  const btn = counted.length >= 2 && !!curRow;
  const runhead = !inert && layoutEl && ready ? ReactDOM.createPortal(h(btn ? 'button' : 'div', btn ? {
    type: 'button', className: 'ans-runhead' + (shown ? '' : ' is-hidden'), 'aria-haspopup': 'dialog',
    'aria-label': 'Contents: ' + short + ', section ' + curRow.num + ' ' + curRow.title, onClick: () => setSheet({ kind: 'contents' }),
  } : { className: 'ans-runhead' + (shown ? '' : ' is-hidden') },
  <span className="ans-runhead-text">
    {btn ? <span className="ans-runhead-s"><span className="ans-runhead-num">{curRow.num}</span> <span className="ans-runhead-sec">{curRow.title}</span></span> : null}
    <span className="ans-runhead-t">{btn ? short + NBSP + '·' + NBSP : short}</span>
  </span>,
  btn ? <AnsIcon name="list" /> : null, <span className="ans-runhead-bar" ref={barRef} />), layoutEl) : null;

  const top = meta ? answersTopSections(meta).length : 0;
  const passages = answersPassageCount(entry);
  const sheetMeta = entry.id === ANSWERS_FD_INDEX_ID ? pl(top, 'category') : [pl(top, 'section'), passages ? pl(passages, 'passage') : ''].filter(Boolean).join(SEP);

  return (
    <div className="ans-page">
      <div className="ans-topic">
        {!inert && rows.length ? (
          <nav className="ans-rail" aria-label="Contents">
            <p className="ans-label">Contents</p>
            {foldable ? <FoldRow on={!!foldOn} onChange={setFold} /> : null}
            <div className="ans-rail-track"><span className="ans-runhead-bar" ref={railBarRef} /></div>
            <TocRows rows={rows} cur={curK} withEx={false} onSection={jumpRow} onExcerpt={jumpExcerpt} />
          </nav>
        ) : null}
        <div className="ans-topic-main" ref={mainRef} data-copy-key={'wtlb:' + entry.id} data-mark-entry={'wtlb:' + entry.id + ':'}
          data-mark-blocks={entry.paragraphs.length} onClick={(e) => onTap(e, null)} onKeyDown={(e) => onTap(e, null)}>
          <Hero entry={entry} entries={entries} meta={meta} pending={!metaAll && !metaFailed} heroRef={heroRef} onEyebrow={openShelf} onContents={() => setSheet({ kind: 'contents' })} h1={h1} />
          <div className="ans-reading">{body}</div>
          {/* Reading-end sentinel: end of body text, before the foot. */}
          <div className="reading-end" />
          {ready && entries ? (
            <Foot entry={entry} entries={entries} meta={meta} metaAll={metaAll} byId={byId} isRead={isRead} pathOn={pathOn} nav={nav} onShelf={openShelf}
              onLetter={act.letter} tc={tcBody} />
          ) : null}
          {ready && site ? (
            <p className="ans-credit">
              From answersonlygodcangive.com<br />{'Captured ' + site.capturedAt}<br />{site.copyright}
              {entry.siteUrl ? <><br /><a href={entry.siteUrl} target="_blank" rel="noopener noreferrer">View this page on the site<AnsIcon name="ext" /></a></> : null}
            </p>
          ) : null}
        </div>
      </div>
      {runhead}
      {sheet && sheet.kind === 'contents' ? (
        <AnswersContentsSheet title={entry.title} rows={rows} cur={curK} meta={sheetMeta} foldable={foldable} foldOn={!!foldOn} ts2={ts2}
          onFold={setFold} onSection={jumpRow} onExcerpt={jumpExcerpt} onClose={() => setSheet(null)} />
      ) : null}
      {sheet && sheet.kind === 'cmd' && entries ? (
        <CommandmentSheet shelf={sheet.shelf} meta={metaAll} isRead={(id) => !!pathOn && isRead(id)} tall={ts2} onClose={() => setSheet(null)}
          onOpenTopic={(id) => { setSheet(null); nav.openTopic(id, null); }} onGoToRef={nav.goToRef ? (ref) => { setSheet(null); nav.goToRef(ref); } : undefined} />
      ) : null}
      {sheet && sheet.kind === 'chart' ? (
        <ChartViewer chart={sheet.chart} onClose={() => { const f = sheet.from; setSheet(null); if (f && f.focus) f.focus({ preventScroll: true }); }} />
      ) : null}
      {sheet && sheet.kind === 'note' ? (
        <NoteSheet entry={entry} meta={meta} state={sheet} onTap={onTap} onClose={() => setSheet(null)}
          onBack={() => setSheet(sheet.back)} onShow={(at) => landAfterClose(() => act.jump(at, { pulse: true }))} />
      ) : null}
    </div>
  );
}

function FoldBtn({ n, open, onClick }) {
  return (
    <button type="button" className="ans-textbtn" aria-expanded={open} onClick={onClick}>
      {open ? 'Show fewer' : n ? 'Show ' + pl(n, 'passage') : 'Show section'}<Chev dir={open ? 'up' : 'down'} />
    </button>
  );
}

/**
 * O3: a note's own words (refs live), then "Show in the page ›". A marker inside it replaces the
 * content and adds "‹ Back to note 1" (sheets never stack).
 */
function NoteSheet({ entry, meta, state, onTap, onClose, onBack, onShow }) {
  const N = state.N;
  const raw = String((entry.paragraphs[N.note] && entry.paragraphs[N.note].text) || '');
  const r = answersNoteRange(raw, N.marker);
  const label = answersNoteLabel(N.marker);
  const nodes = answersInline(raw, answersParaMeta(meta, N.note), { from: r.from, to: r.to, noSmall: true });
  return (
    <AnsSheet label={label} onClose={onClose} head={<p className="ans-label">{label}</p>}>
      <div className="ans-note-sheet" onClick={(e) => onTap(e, N.note)} onKeyDown={(e) => onTap(e, N.note)}>
        {state.back ? <button type="button" className="ans-textbtn ans-note-back" onClick={onBack}><Chev dir="left" />{'Back to ' + answersNoteLabel(state.back.N.marker).toLowerCase()}</button> : null}
        <p className="ans-quote ans-note-text">{renderNodes(nodes, N.note, 's')}</p>
        <button type="button" className="ans-textbtn" onClick={() => onShow(N.note)}>Show in the page<Chev /></button>
      </div>
    </AnsSheet>
  );
}

/* ── Foot (f09) ─────────────────────────────────────────────────────── */

/** A navigation row with a kicker over its title ("Next in 6. Thus Says The Lord...", "‹ Previous"). */
/** @param {{ kicker?: any, title: any, sub?: any, onClick?: () => void, prev?: boolean, href?: string }} props */
function KRow({ kicker, title, sub, onClick, prev, href }) {
  const body = (
    <>
      <span className="ans-row-body">
        <span className="ans-row-sub">{prev ? <><AnsIcon name="left" className="ans-chev ans-kick" />Previous</> : kicker}</span>
        <span className="ans-row-title">{title}</span>
        {sub ? <span className="ans-row-sub">{sub}</span> : null}
      </span>
      {prev ? null : href ? <AnsIcon name="ext" /> : <Chev />}
    </>
  );
  if (href) return <a className="ans-row is-2" href={href} target="_blank" rel="noopener noreferrer">{body}</a>;
  return <button type="button" className="ans-row is-2" onClick={onClick}>{body}</button>;
}

const RELATED_SHOWN = 6;

function Foot({ entry, entries, meta, metaAll, byId, isRead, pathOn, nav, onShelf, onLetter, tc }) {
  const [all, setAll] = React.useState(false);
  React.useEffect(() => { setAll(false); }, [entry.id]);
  const topicSub = (id) => {
    const e = byId.get(id);
    if (!e) return null;
    return <>{answersRowSub(e, metaAll && metaAll[id])}{pathOn && isRead(id) ? <>{SEP}<ReadMark /></> : null}</>;
  };
  const topicRow = (id, key) => {
    const e = byId.get(id);
    return e ? <AnsRow key={key} title={<LeadTitle title={e.title} />} sub={topicSub(id)} onClick={() => nav.openTopic(id, null)} /> : null;
  };
  // a section link names its page; a letter link its collection
  const moreRow = (r, key) => {
    const e = r.id ? byId.get(r.id) : null;
    const sub = e ? 'In ' + (r.id === ANSWERS_FD_INDEX_ID ? 'the ' + ANSWERS_FD_INDEX_SHORT : answersShortTitle(e.title)) : ((r.letter && r.letter.collection) || 'Letter');
    const go = () => {
      if (r.id) nav.openTopic(r.id, r.anchor || null);
      else if (r.letter) onLetter({ collection: r.letter.collection, letterTitle: r.letter.title });
    };
    return <AnsRow key={key} title={r.title} sub={sub} onClick={go} />;
  };
  const parts = [];
  for (const part of answersFootOrder(entry, meta)) {
    if (part === 'videos') {
      const v = answersFootMedia(meta);
      if (!v.length) continue;
      parts.push(
        <React.Fragment key="v">
          <div className="ans-sechead"><h2 className="ans-h2">Videos</h2></div>
          {v.map((m) => (
            <a key={m.url} className="ans-media" href={m.url} target="_blank" rel="noopener noreferrer">
              {mediaInner(m)}
            </a>
          ))}
        </React.Fragment>,
      );
    } else if (part === 'related') {
      const groups = meta && meta.relatedGroups;
      if (groups && groups.length) {
        parts.push(
          <React.Fragment key="r">
            <div className="ans-sechead"><h2 className="ans-h2">Related Topics</h2></div>
            {groups.map((g, gi) => (
              <React.Fragment key={'g' + gi}>
                {g.label ? <h3 className="ans-foot-h3">{g.label}</h3> : null}
                {g.items.map((it, j) => (it.anchor ? moreRow(it, gi + ':' + j) : topicRow(it.id, gi + ':' + j)))}
              </React.Fragment>
            ))}
          </React.Fragment>,
        );
        continue;
      }
      const R = answersRelated(entry, meta).filter((r) => r.more || byId.has(r.id));
      if (!R.length) continue;
      const vis = R.length > RELATED_SHOWN && !all ? R.slice(0, RELATED_SHOWN) : R;
      parts.push(
        <React.Fragment key="r">
          <div className="ans-sechead"><h2 className="ans-h2">Related Topics</h2></div>
          {vis.map((r, k) => (r.more ? moreRow(r, 'm' + k) : topicRow(r.id, 't' + k)))}
          {R.length > RELATED_SHOWN ? (
            <button type="button" className="ans-textbtn" aria-expanded={all} onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : 'Show all ' + R.length}<Chev dir={all ? 'up' : 'down'} />
            </button>
          ) : null}
        </React.Fragment>,
      );
    } else if (part === 'nav') {
      const sn = answersSiteNav(entries, entry.id);
      const fd = entry.id === ANSWERS_FD_INDEX_ID;
      const main = entry.id === ANSWERS_MAIN_PAGE_ID;
      const rows = [];
      if (sn && sn.next && byId.has(sn.next)) {
        const nx = byId.get(sn.next);
        rows.push(<KRow key="n" kicker={'Next in ' + answersEyebrow(entries, nx).text} title={<LeadTitle title={nx.title} />} sub={topicSub(sn.next)} onClick={() => nav.go(sn.next)} />);
      }
      if (sn && sn.prev && byId.has(sn.prev)) {
        const pv = byId.get(sn.prev);
        rows.push(<KRow key="p" prev title={<LeadTitle title={pv.title} />} sub={topicSub(sn.prev)} onClick={() => nav.go(sn.prev)} />);
      }
      if (sn && sn.end && sn.proceed) {
        const pr = sn.proceed;
        rows.push(
          <div key="e" className="ans-end">
            <h3 className="ans-foot-h3">{sn.end}</h3>
            <KRow kicker="Proceed to:" title={pr.title} onClick={() => nav.go(pr.id)} />
          </div>,
        );
      }
      if (sn && sn.ret) rows.push(<KRow key="ret" kicker="Return to:" title="Main Page" onClick={() => nav.go(sn.ret)} />);
      const ext = fd && meta && meta.siteNav && meta.siteNav.proceed && meta.siteNav.proceed.kind === 'external' ? meta.siteNav.proceed : null;
      if (ext) rows.push(<KRow key="x" kicker="Proceed to:" title={ext.title} href={ext.url} />);
      const shelf = answersSiteShelfOf(entries, entry.id);
      if (shelf && shelf.kind !== 'index' && !main) {
        // the count the shelf it opens shows (Other Topics lists the page outside the site's menu too)
        const browse = shelf.kind === 'commandment' ? null : answersShelfByKey(entries, shelf.kind === 'other' ? 'other' : String(shelf.num));
        const n = (browse ? browse.topics : shelf.topics).length;
        rows.push(<AnsRow key="g" title="All topics in this group" sub={answersPlaceOf(entries, entry.id) + SEP + pl(n, 'topic')} onClick={() => onShelf(shelf)} />);
      }
      if (!main && !fd) rows.push(<a key="h" className="ans-textbtn" href="#" onClick={(e) => { e.preventDefault(); nav.openTopic(ANSWERS_MAIN_PAGE_ID, null); }}>Home: Main Page<Chev /></a>);
      parts.push(
        <nav key="nav" className="ans-foot-nav" aria-labelledby={'ans-nav-' + entry.id}>
          <h2 className="sr-only" id={'ans-nav-' + entry.id}>Navigation</h2>
          {rows}
        </nav>,
      );
    } else if (part === 'tc' && tc) {
      parts.push(<React.Fragment key="tc">{tc}</React.Fragment>);
    }
  }
  return <section className="ans-foot">{parts}</section>;
}

/** Test seam: the paragraph renderer. */
export const AnswersPara = Para;
