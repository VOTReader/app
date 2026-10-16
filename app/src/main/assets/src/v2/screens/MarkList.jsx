/* MarkList - one row of what the reader marked (the kit's .mark) and the marks a page lists: the Notes tab (zv1) and a
   notebook's page (mw9d, 3j) share them. A real boot reads main's stores read only (notes-facts.js readMarks); a gate
   boot shows the seeded marks. */
import { Icon } from '../Icon.jsx';
import { askVotCorpus, askAudioSyncSections } from '../corpus.js';
import { metaLine, readMarks } from '../notes-facts.js';

const g = /** @type {any} */ (globalThis);

/** @param {{ mark: import('../notes-facts.js').Mark, now: number, onOpen: (m: any) => void }} props */
export function MarkRow({ mark: m, now, onOpen }) {
  const open = m.open ? () => onOpen(m.open) : undefined;
  const keys = open ? { role: 'button', tabIndex: 0, onClick: open,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } } : {};
  let body;
  if (m.kind === 'highlight') {
    body = <div className="mq"><span className={'hl ' + (m.colour || 'gold')}>{m.text}</span></div>;
  } else if (m.kind === 'note') {
    body = <>{m.quote ? <div className="mq">{m.quote}</div> : null}{m.note ? <div className="mn">{m.note}</div> : null}</>;
  } else {
    const icon = m.kind === 'journal' ? 'journal' : m.kind === 'bookmark' ? 'bm' : 'link';
    body = <><div className="mt"><Icon name={icon} on={m.kind === 'bookmark'} />{m.title}</div>{m.text ? <div className="mx">{m.text}</div> : null}</>;
  }
  return <div className="mark" {...keys}>{body}<div className="mm">{metaLine(m, now)}</div></div>;
}

/** What a page lists, and whether the letters behind some titles are still loading. */
export function useMarks(gate) {
  const [state, setState] = React.useState(() => (gate ? { marks: (gate.facts && gate.facts.marks) || [], pending: false, unnamed: false } : readMarks()));
  const waiting = state.pending;
  React.useEffect(() => {
    if (!waiting) return undefined;
    let live = true;
    const settle = () => { if (live) setState({ ...readMarks(), pending: false }); };
    const load = g.__loadVotCorpus;
    Promise.resolve(typeof load === 'function' ? load() : null).then(settle, settle);
    return () => { live = false; };
  }, [waiting]);
  // a saved Words To Live By compilation is named by its first entry once the VOT corpus (the section list) and the
  // compilation timings are here: ask for both and read again when they land, never holding Notes' ready (v2g11b)
  const unnamed = state.unnamed;
  React.useEffect(() => {
    if (!unnamed) return undefined;
    let live = true;
    const named = () => { if (live) setState((s) => ({ ...readMarks(), pending: s.pending, unnamed: false })); };
    Promise.all([askVotCorpus(), askAudioSyncSections()].map((p) => p.catch(() => undefined))).then(named, named);
    return () => { live = false; };
  }, [unnamed]);
  return state;
}
