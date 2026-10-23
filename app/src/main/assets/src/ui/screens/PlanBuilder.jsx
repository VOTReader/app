/* ═══════════════════════════════════════════════════════════════════════
   PlanBuilder — build your own reading plan (mw18, Corbin 2026-10-22)
   ═══════════════════════════════════════════════════════════════════════
   Two steps inside the Plans screen, built to the round-1 mockups
   (lanes/myweb/out/mockups/mw18/r1-build-pick.png, r1-build-goal.png):
   1. What do you want to read? The Bible (whole, a testament, books, single
      chapters) and the letters (collections or single letters), mixed
      freely, with the picks and their size always in view.
   2. How do you want to read it? Minutes a day, items a day, a number of
      days or a finish date; which days; the order; for a mix, side by side
      (his pick, the default) or one after the other; a name; and the live
      breakdown: chapters + letters, words and minutes each day, the finish.
   The plan is an ordinary run (data/plan-builder.js), so missed days get
   the same behind / Catch me up / Spread it out as every plan.
   ═══════════════════════════════════════════════════════════════════════ */

import { useModalRegistry } from '../../hooks/use-modal-registry.js';
import { BIBLE_BOOKS } from '../../data/reading-plans.js';
import { BIBLE_GROUPS, chapterCount, pickName, defaultName, builderSpec, builderPreview } from '../../data/plan-builder.js';
import { LETTER_CHAIN } from '../../data/plan-catalog.js';
import { newRun, todayKey } from '../../data/plan-engine.js';
import { letterSource, saveRun, shortDate } from '../../utils/plan-runs-view.js';

/** @typedef {import('../../data/plan-builder.js').Pick} Pick */

const ALL_WEEK = [true, true, true, true, true, true, true];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** @param {{ state: boolean | 'mixed' }} props */
function Box({ state }) {
  return (
    <span className="today-check build-box" data-done={state === true ? '1' : state === 'mixed' ? 'some' : '0'} aria-hidden="true">
      {state === true ? <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12.5l4.2 4.2L19 7" /></svg> : null}
    </span>
  );
}

/** @param {{ label: string, value: number, min: number, step: number, unit: string, onChange: (n: number) => void }} props */
function Stepper({ label, value, min, step, unit, onChange }) {
  return (
    <span className="build-stepper">
      <button type="button" aria-label={'Less: ' + label} disabled={value - step < min} onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <span className="build-stepper-value">{value + unit}</span>
      <button type="button" aria-label={'More: ' + label} onClick={() => onChange(value + step)}>+</button>
    </span>
  );
}

/**
 * @param {{ step: 1 | 2, onStep: (s: 0 | 1 | 2) => void, lettersReady: boolean, onStarted?: (run: any) => void }} props
 *   step 0 closes the builder (back on the Plans screen); onStarted hears the run it began
 */
export function PlanBuilder({ step, onStep, lettersReady, onStarted }) {
  const [tab, setTab] = React.useState(/** @type {'bible' | 'letters'} */ ('bible'));
  const [picks, setPicks] = React.useState(/** @type {Pick[]} */ ([]));
  const [open, setOpen] = React.useState(/** @type {string | null} */ (null));
  const [mode, setMode] = React.useState(/** @type {'minutes' | 'items' | 'days' | 'by'} */ ('minutes'));
  const [minutes, setMinutes] = React.useState(15);
  const [items, setItems] = React.useState(1);
  const [days, setDays] = React.useState(365);
  const [by, setBy] = React.useState('');
  const [weekdays, setWeekdays] = React.useState(ALL_WEEK);
  const [order, setOrder] = React.useState(/** @type {'picked' | 'canonical'} */ ('picked'));
  const [share, setShare] = React.useState(/** @type {'side' | 'serial'} */ ('side'));
  const [name, setName] = React.useState('');
  // The phone's Back steps back through the builder, as the screen's Back does.
  useModalRegistry({ id: 'plan-builder', dismiss: () => onStep(step === 2 ? 1 : 0) });

  const src = lettersReady ? letterSource() : null;
  const now = new Date();
  const goal = mode === 'minutes' ? { mode, n: minutes } : mode === 'items' ? { mode, n: items } : mode === 'days' ? { mode, n: days }
    : { mode: /** @type {'by'} */ ('by'), date: by };
  const spec = builderSpec({ picks, order, share, goal: /** @type {any} */ (by || mode !== 'by' ? goal : { mode: 'days', n: days }), weekdays, name }, src);
  const preview = picks.length ? builderPreview(spec, now) : null;
  const mixed = picks.some((p) => p.t === 'b') && picks.some((p) => p.t === 'l');

  // ── picks ────────────────────────────────────────────────────────────
  const keyOf = (/** @type {Pick} */ p) => (p.t === 'b' ? 'b:' + p.bid : 'l:' + p.volKey);
  const find = (/** @type {string} */ key) => picks.find((p) => keyOf(p) === key) || null;
  /** Replace, add (at the end) or remove (null) the pick under `key`, keeping the order picked. @param {string} key @param {Pick | null} next */
  const put = (key, next) => setPicks((cur) => {
    const i = cur.findIndex((p) => keyOf(p) === key);
    if (!next) return i < 0 ? cur : cur.filter((_, j) => j !== i);
    if (i < 0) return [...cur, next];
    const out = cur.slice(); out[i] = next; return out;
  });
  const bookState = (/** @type {string} */ bid) => { const p = /** @type {any} */ (find('b:' + bid)); return !p ? false : p.ch ? 'mixed' : true; };
  const toggleBook = (/** @type {string} */ bid) => put('b:' + bid, bookState(bid) === true ? null : { t: 'b', bid, ch: null });
  const toggleChapter = (/** @type {string} */ bid, /** @type {number} */ c) => {
    const p = /** @type {any} */ (find('b:' + bid));
    const n = chapterCount(bid);
    const have = new Set(p ? (p.ch || Array.from({ length: n }, (_, i) => i + 1)) : []);
    if (have.has(c)) have.delete(c); else have.add(c);
    put('b:' + bid, !have.size ? null : { t: 'b', bid, ch: have.size >= n ? null : [...have].sort((a, b) => a - b) });
  };
  const groupState = (/** @type {string[]} */ books) => {
    const states = books.map(bookState);
    return states.every((s) => s === true) ? true : states.some(Boolean) ? 'mixed' : false;
  };
  const toggleGroup = (/** @type {string[]} */ books) => {
    const all = groupState(books) === true;
    setPicks((cur) => {
      const rest = cur.filter((p) => !(p.t === 'b' && books.includes(p.bid)));
      if (all) return rest;
      const kept = cur.filter((p) => p.t === 'b' && books.includes(p.bid)).map((p) => ({ ...p, ch: null }));
      const add = books.filter((b) => !kept.some((/** @type {any} */ p) => p.bid === b)).map((bid) => /** @type {Pick} */ ({ t: 'b', bid, ch: null }));
      return [...rest, ...kept, ...add];
    });
  };
  const cols = src ? LETTER_CHAIN.map((k) => src.colByKey.get(k)).filter((c) => c && c.letterScreen) : [];
  const colEntries = (/** @type {any} */ col) => { const pref = src ? src.preface(col) : null; return (pref ? [pref] : []).concat(src ? src.letters(col) || [] : []).filter((e) => e && e.id); };
  const colState = (/** @type {string} */ volKey) => { const p = /** @type {any} */ (find('l:' + volKey)); return !p ? false : p.ids ? 'mixed' : true; };
  const toggleCol = (/** @type {string} */ volKey) => put('l:' + volKey, colState(volKey) === true ? null : { t: 'l', volKey, ids: null });
  const toggleLetter = (/** @type {any} */ col, /** @type {string} */ id) => {
    const p = /** @type {any} */ (find('l:' + col.volKey));
    const all = colEntries(col).map((e) => e.id);
    const have = new Set(p ? (p.ids || all) : []);
    if (have.has(id)) have.delete(id); else have.add(id);
    put('l:' + col.volKey, !have.size ? null : { t: 'l', volKey: col.volKey, ids: have.size >= all.length ? null : all.filter((x) => have.has(x)) });
  };

  const start = () => {
    if (!preview) return;
    const run = newRun(spec, new Date());
    saveRun(run);
    if (onStarted) onStarted(run);
    onStep(0);
  };

  if (step === 1) {
    return (
      <div className="plans-build">
        <header className="study-head">
          <span className="today-eyebrow">Step 1 of 2</span>
          <h1 className="study-head-title">What do you want to read?</h1>
          <p className="study-head-sub">Pick books, chapters, collections or single letters, in any mix.</p>
        </header>
        <div className="build-tabs" role="tablist" aria-label="What to pick from">
          <button type="button" role="tab" aria-selected={tab === 'bible'} onClick={() => setTab('bible')}>The Bible</button>
          <button type="button" role="tab" aria-selected={tab === 'letters'} onClick={() => setTab('letters')}>The Letters</button>
        </div>
        {tab === 'bible' ? (
          <ul className="build-list" aria-label="The Bible">
            {BIBLE_GROUPS.map((g) => (
              <li key={g.id}>
                <button type="button" className="build-row" role="checkbox" aria-checked={groupState(g.books)} onClick={() => toggleGroup(g.books)}>
                  <Box state={groupState(g.books)} />
                  <span className="build-row-text"><span className="build-row-name">{g.name}</span><span className="build-row-sub">{g.sub}</span></span>
                </button>
              </li>
            ))}
            {BIBLE_BOOKS.map(([b0, title, n]) => {
              const bid = String(b0);
              const st = bookState(bid);
              const p = /** @type {any} */ (find('b:' + bid));
              const isOpen = open === 'b:' + bid;
              return (
                <li key={bid}>
                  <div className="build-row-wrap">
                    <button type="button" className="build-row" role="checkbox" aria-checked={st} onClick={() => toggleBook(bid)}>
                      <Box state={st} />
                      <span className="build-row-text">
                        <span className="build-row-name">{title}</span>
                        <span className="build-row-sub">{st === 'mixed' && p ? 'Chapters ' + pickName(p, null).slice(String(title).length + 1) : n + (Number(n) === 1 ? ' chapter' : ' chapters')}</span>
                      </span>
                    </button>
                    {Number(n) > 1 ? (
                      <button type="button" className="build-expand" aria-expanded={isOpen} aria-label={'Pick chapters of ' + title}
                        onClick={() => setOpen(isOpen ? null : 'b:' + bid)}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={isOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} /></svg>
                      </button>
                    ) : null}
                  </div>
                  {isOpen ? (
                    <div className="build-grid" role="group" aria-label={'Chapters of ' + title}>
                      {Array.from({ length: Number(n) }, (_, i) => i + 1).map((c) => {
                        const on = st === true || (!!p && !!p.ch && p.ch.includes(c));
                        return <button key={c} type="button" aria-pressed={on} aria-label={title + ' ' + c} onClick={() => toggleChapter(bid, c)}>{c}</button>;
                      })}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : !src ? (
          <p className="plans-note" role="status">Loading the Volumes…</p>
        ) : (
          <ul className="build-list" aria-label="The Letters">
            {cols.map((col) => {
              const st = colState(col.volKey);
              const p = /** @type {any} */ (find('l:' + col.volKey));
              const entries = colEntries(col);
              const isOpen = open === 'l:' + col.volKey;
              return (
                <li key={col.volKey}>
                  <div className="build-row-wrap">
                    <button type="button" className="build-row" role="checkbox" aria-checked={st} onClick={() => toggleCol(col.volKey)}>
                      <Box state={st} />
                      <span className="build-row-text">
                        <span className="build-row-name">{col.label}</span>
                        <span className="build-row-sub">{st === 'mixed' && p ? p.ids.length + ' of ' + entries.length + ' letters' : entries.length + ' letters'}</span>
                      </span>
                    </button>
                    <button type="button" className="build-expand" aria-expanded={isOpen} aria-label={'Pick letters of ' + col.label}
                      onClick={() => setOpen(isOpen ? null : 'l:' + col.volKey)}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={isOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} /></svg>
                    </button>
                  </div>
                  {isOpen ? (
                    <ul className="build-letters" aria-label={'Letters of ' + col.label}>
                      {entries.map((e) => {
                        const on = st === true || (!!p && !!p.ids && p.ids.includes(e.id));
                        return (
                          <li key={e.id}>
                            <button type="button" className="build-row build-letter" role="checkbox" aria-checked={on} onClick={() => toggleLetter(col, e.id)}>
                              <Box state={on} /><span className="build-row-name">{e.title || e.id}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <div className="build-bar">
          {picks.length ? (
            <ul className="build-chips" aria-label="Your picks">
              {picks.map((p) => (
                <li key={keyOf(p)} className="build-chip">
                  <span>{pickName(p, src)}</span>
                  <button type="button" aria-label={'Remove ' + pickName(p, src)} onClick={() => put(keyOf(p), null)}>×</button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="build-bar-row">
            <span className="build-summary" role="status">{preview ? preview.picked : 'Nothing picked yet'}</span>
            <button type="button" className="today-btn" disabled={!preview} onClick={() => onStep(2)}>Next</button>
          </div>
        </div>
      </div>
    );
  }

  const radio = (/** @type {typeof mode} */ m) => ({ role: 'radio', 'aria-checked': mode === m, onClick: () => setMode(m) });
  return (
    <div className="plans-build">
      <header className="study-head">
        <span className="today-eyebrow">Step 2 of 2</span>
        <h1 className="study-head-title">How do you want to read it?</h1>
        <p className="study-head-sub">{preview ? preview.picked : ''}</p>
      </header>
      <section className="build-card" role="radiogroup" aria-label="Your goal">
        <h2 className="build-card-title">Your goal</h2>
        <div className="build-goal">
          <button type="button" className="build-radio" {...radio('minutes')}><Box state={mode === 'minutes'} /><span>About {minutes} minutes a day</span></button>
          {mode === 'minutes' ? <Stepper label="minutes a day" value={minutes} min={5} step={5} unit=" min" onChange={setMinutes} /> : null}
        </div>
        <div className="build-goal">
          <button type="button" className="build-radio" {...radio('items')}><Box state={mode === 'items'} /><span>{items + (items === 1 ? ' chapter or letter a day' : ' chapters or letters a day')}</span></button>
          {mode === 'items' ? <Stepper label="chapters or letters a day" value={items} min={1} step={1} unit="" onChange={setItems} /> : null}
        </div>
        <div className="build-goal">
          <button type="button" className="build-radio" {...radio('days')}><Box state={mode === 'days'} /><span>In {days} days</span></button>
          {mode === 'days' ? (
            <input className="build-input" type="number" inputMode="numeric" min={1} aria-label="Number of days" value={days}
              onChange={(e) => setDays(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
          ) : null}
        </div>
        <div className="build-goal">
          <button type="button" className="build-radio" {...radio('by')}><Box state={mode === 'by'} /><span>Finish by a date</span></button>
          {mode === 'by' ? (
            <input className="build-input" type="date" aria-label="Finish by" min={todayKey(now)} value={by} onChange={(e) => setBy(e.target.value)} />
          ) : null}
        </div>
      </section>
      <section className="build-card" aria-label="Which days">
        <h2 className="build-card-title">Which days</h2>
        <div className="build-days">
          {DAY_NAMES.map((d, i) => (
            <button key={d} type="button" aria-pressed={weekdays[i]} disabled={weekdays[i] && weekdays.filter(Boolean).length === 1}
              onClick={() => setWeekdays(weekdays.map((v, j) => (j === i ? !v : v)))}>{d}</button>
          ))}
        </div>
      </section>
      <section className="build-card" role="radiogroup" aria-label="Order">
        <h2 className="build-card-title">Order</h2>
        <button type="button" className="build-radio" role="radio" aria-checked={order === 'picked'} onClick={() => setOrder('picked')}>
          <Box state={order === 'picked'} /><span className="build-row-text"><span>As picked</span><span className="build-row-sub">In the order you chose</span></span>
        </button>
        <button type="button" className="build-radio" role="radio" aria-checked={order === 'canonical'} onClick={() => setOrder('canonical')}>
          <Box state={order === 'canonical'} /><span className="build-row-text"><span>Bible order</span><span className="build-row-sub">Genesis to Revelation, the Volumes in order</span></span>
        </button>
      </section>
      {mixed ? (
        <section className="build-card" role="radiogroup" aria-label="Bible and letters on the same day?">
          <h2 className="build-card-title">Bible and letters on the same day?</h2>
          <button type="button" className="build-radio" role="radio" aria-checked={share === 'side'} onClick={() => setShare('side')}>
            <Box state={share === 'side'} /><span className="build-row-text"><span>Side by side</span><span className="build-row-sub">Some Bible and some letters each day; both finish together</span></span>
          </button>
          <button type="button" className="build-radio" role="radio" aria-checked={share === 'serial'} onClick={() => setShare('serial')}>
            <Box state={share === 'serial'} /><span className="build-row-text"><span>One after the other</span><span className="build-row-sub">{order === 'canonical' || picks[0].t === 'b' ? 'All the Bible first, then the letters' : 'All the letters first, then the Bible'}</span></span>
          </button>
        </section>
      ) : null}
      <section className="build-card" aria-label="Name">
        <h2 className="build-card-title">Name</h2>
        <input className="build-input build-name" type="text" aria-label="Plan name" maxLength={60} value={name}
          placeholder={defaultName(picks, src)} onChange={(e) => setName(e.target.value)} />
      </section>
      <section className="build-card build-each" aria-label="Each day">
        <h2 className="build-card-title">Each day</h2>
        {preview ? (
          <>
            <p className="build-each-main">{preview.each}</p>
            <p className="build-row-sub">{'about ' + preview.dayWords.toLocaleString('en-US') + ' words · about ' + preview.dayMinutes + ' min'}</p>
            <p className="build-row-sub">{'Finishes ' + shortDate(preview.finish) + ' · ' + preview.days + (preview.days === 1 ? ' reading day' : ' reading days')}</p>
          </>
        ) : null}
        <button type="button" className="today-btn today-btn-wide" disabled={!preview || (mode === 'by' && !by)} onClick={start}>Start plan</button>
      </section>
    </div>
  );
}
