/* ═══════════════════════════════════════════════════════════════════════
   useJourney — every way the reader has gone through the web (the trail).
   Cluster F (bundle-d), used by ui/screens/ScriptureWebScreen.jsx.
   The navigation stream owns this file (CONTRACTS.md section 7).
   ═══════════════════════════════════════════════════════════════════════

   One trail per screen: the navigation stream records each arrival (a Follow,
   the go-to, a book name, an edge chip), the panel draws the trail bar and the
   paths over it, and the selection hook carries it (use-web-selection.js
   returns it) so the panel reaches it where it reaches everything else.

   THE TRAIL IS A TREE OF STOPS (Corbin, 2026-11-03: "going from link to link
   to link, to back a couple to a different link, and follow any number of
   paths through the bible"). A stop is a place the reader arrived at: a verse
   by a thread (its `via`), or a place they jumped to. Going back and taking
   another thread starts a branch beside the old one, and the old one stays,
   so every path the reader has walked is still there to walk again.

     stop    { id, verse, label, open?, span?, via?, parent, kids, last }:
             verse a graph verse id, label what the trail bar says ("John
             3:16"); open the panel spec to open again on arriving there (null
             closes the panel; with a `lit` list, those threads light again);
             span the canon x the view held, [x0, x1], so a return restores
             the zoom too; via the thread the reader came along ({ arc,
             prophecy? }: an OpenBible arc id, or a prophecy pair's index),
             absent for a jump; parent the stop before (-1 for where the trail
             set out); kids the stops gone on to from here, oldest first; last
             the one gone on to most recently (Forward's way, -1 for none).
     at      the stop the reader is at (-1: no trail yet).
     path    what the trail bar shows: from where the trail set out, through
             where the reader is, on along each stop's `last`, so after a
             Back the way ahead is still in the bar (pathOf).

     push(entry, origin?)   records an arrival from where the reader is.
             origin (additive) is where the reader set out from: it seeds an
             empty trail, so the first Follow already has somewhere to come
             back to; left out, the trail asks the go-to where the reader is
             (connect's here). An entry with a `via` is a thread, and its
             origin is the thread's near end: a thread that sets out from
             somewhere other than where the reader is gets that end as a stop
             of its own first, so the stop before an arrival is always the
             verse its thread came from. An entry with no `open` (undefined; a
             book name's is null, as it closes the panel) records what is open
             at the push, so a return puts the panel back as it was there.
             Arriving where the reader already is changes nothing but the
             stop's panel; arriving at the stop before is a step back (Follow
             on the same line, end to end); arriving where the reader went on
             to before is that stop again, not a second one.
     back()  where the reader came from: the stop before, or, when the panel
             is showing something else (a line tapped on the way, a closed
             panel), the stop the reader is at, first. Returns the stop it
             goes to, or null with nowhere to go.
     forward()  the stop gone on to last from here, or null.
     go(id)  any stop of the trail, in one flight (a crumb, a path's stop).
             Each of the three flies the camera there (flyTo, centred in the
             canvas area beside the panel; its span when it has one), and on
             landing the stop's `open` opens again. A flight cut short (a
             finger took the camera) puts the reader back where they were, so
             Back still goes where it said (s26.5); unless the trail moved on.
     clear() empties it (a mode change, Reset view)
     connect(panel)  what the trail reaches the panel through, merged in by
             each stream that has a part: the go-to's openPanel, closePanel,
             lightThreads and here, the selection's isAt (does the panel show
             this stop?) and onTravel (a step takes the camera: the way back to
             a zoom a choice left goes)
     snapshot()  the trail as plain data for the resume point (trailForStorage)

   State, not a ref (the panel renders the trail), and a ref beside it so a
   push and a back in the same event see each other. The panel's Back calls
   back() and nothing else: it flies and reopens by itself. */

/**
 * @typedef {{ arc: number, prophecy?: boolean }} Via
 * @typedef {{ verse: number, label: string, open?: any, span?: [number, number], via?: Via | null }} JourneyEntry
 * @typedef {JourneyEntry & { id: number, parent: number, kids: number[], last: number }} Stop
 * @typedef {{ stops: Stop[], at: number, next: number }} Trail
 * @typedef {{ stops: Stop[], here: number }} TrailPath
 * @typedef {{ from: Stop | null, stops: Stop[], current: boolean }} Branch
 * @typedef {{ openPanel?: (spec: any) => boolean, closePanel?: () => void,
 *   lightThreads?: (ids: ArrayLike<number> | null) => void, here?: () => JourneyEntry | null,
 *   isAt?: (stop: Stop) => boolean, onTravel?: () => void }} JourneyPanel
 * @typedef {{ trail: Trail, path: TrailPath, here: Stop | null, stack: Stop[],
 *   push: (entry: JourneyEntry, origin?: JourneyEntry | null) => void,
 *   back: () => Stop | null, forward: () => Stop | null, go: (id: number) => Stop | null, clear: () => void,
 *   connect: (panel: JourneyPanel | null) => void, snapshot: () => any }} Journey
 */

/** The most stops a trail keeps: past it, the oldest branch ends go first (never the way to where
 * the reader is). */
export const TRAIL_CAP = 160;

/** @type {Trail} */
export const EMPTY_TRAIL = Object.freeze({ stops: /** @type {Stop[]} */ (/** @type {unknown} */ (Object.freeze([]))), at: -1, next: 0 });

const valid = (e) => !!e && Number.isFinite(e.verse) && e.verse >= 0;

/** id → stop, once per stops array. @type {WeakMap<Stop[], Map<number, Stop>>} */
const INDEX = new WeakMap();
/** @param {Trail} t */
function indexOf(t) {
  let m = INDEX.get(t.stops);
  if (!m) {
    m = new Map();
    for (const s of t.stops) m.set(s.id, s);
    INDEX.set(t.stops, m);
  }
  return m;
}

/** A stop by its id, or null. @param {Trail} t @param {number} id @returns {Stop | null} */
export function stopOf(t, id) {
  return id >= 0 ? indexOf(t).get(id) || null : null;
}

/** The stops from where the trail set out to `id`, oldest first. @param {Trail} t @param {number} id */
export function chainTo(t, id) {
  /** @type {Stop[]} */
  const out = [];
  for (let s = stopOf(t, id); s; s = stopOf(t, s.parent)) out.push(s);
  return out.reverse();
}

/**
 * The line the trail bar shows: from where the trail set out, through where the reader is, on
 * along the way they went last from each stop (Forward's way). `here` is where the reader is on it.
 * @param {Trail} t
 * @returns {TrailPath}
 */
export function pathOf(t) {
  const stops = chainTo(t, t.at);
  const here = stops.length - 1;
  for (let s = stopOf(t, t.at); s && s.last >= 0;) {
    s = stopOf(t, s.last);
    if (s) stops.push(s);
  }
  return { stops, here };
}

/**
 * Every way the reader has gone, one branch a row (the paths view): the first runs from where the
 * trail set out along each stop's first way on; each other way on starts a branch of its own, `from`
 * the stop it forks at, listed after the branch it leaves. `current` marks the branch the reader is on.
 * @param {Trail} t
 * @returns {Branch[]}
 */
export function branchesOf(t) {
  /** @type {Branch[]} */
  const out = [];
  const roots = t.stops.filter((s) => s.parent < 0);
  for (const root of roots) {
    /** @type {{ stop: Stop, branch: Branch }[]} */
    const todo = [{ stop: root, branch: { from: null, stops: [], current: false } }];
    while (todo.length) {
      const { stop, branch } = /** @type {{ stop: Stop, branch: Branch }} */ (todo.pop());
      out.push(branch);
      // the branch's own line, depth first; its forks wait their turn
      /** @type {{ stop: Stop, branch: Branch }[]} */
      const forks = [];
      for (let s = /** @type {Stop | null} */ (stop); s;) {
        branch.stops.push(s);
        if (s.id === t.at) branch.current = true;
        const kids = s.kids.map((k) => stopOf(t, k)).filter(Boolean);
        for (let k = kids.length - 1; k >= 1; k--) forks.push({ stop: /** @type {Stop} */ (kids[k]), branch: { from: s, stops: [], current: false } });
        s = kids.length ? /** @type {Stop} */ (kids[0]) : null;
      }
      // the forks nearest the branch's end first, so a branch is read before the ones it holds
      for (const f of forks) todo.push(f);
    }
  }
  return out;
}

/** The verses the trail has stood at, once per trail. @type {WeakMap<Stop[], Set<number>>} */
const VISITED = new WeakMap();
/** @param {Trail} t @returns {Set<number>} */
export function visitedOf(t) {
  let s = VISITED.get(t.stops);
  if (!s) {
    s = new Set(t.stops.map((x) => x.verse));
    VISITED.set(t.stops, s);
  }
  return s;
}

/** The OpenBible threads the trail bar's path came along (the way to where the reader is, and on),
 * for the web to draw in the path's ink (focus.path). @param {Trail} t @returns {number[]} */
export function pathArcsOf(t) {
  const out = [];
  for (const s of pathOf(t).stops) if (s.via && !s.via.prophecy && s.via.arc >= 0) out.push(s.via.arc);
  return out;
}

/* ── the pure updates: a trail in, a new trail out (the old one is never changed) ── */

/** A working copy: the stops array copied, a stop copied before its first change. */
function draft(t) {
  const stops = t.stops.slice();
  const pos = new Map(stops.map((s, i) => [s.id, i]));
  const own = new Set();
  return {
    stops, at: t.at, next: t.next,
    /** @param {number} id @returns {Stop | null} */
    get(id) { const i = pos.get(id); return i === undefined ? null : stops[i]; },
    /** @param {number} id @returns {Stop} a stop of this draft's own to change */
    edit(id) {
      const i = /** @type {number} */ (pos.get(id));
      if (!own.has(id)) { stops[i] = Object.assign({}, stops[i], { kids: stops[i].kids.slice() }); own.add(id); }
      return stops[i];
    },
    /** @param {JourneyEntry} e @param {number} parent @returns {number} the new stop's id */
    add(e, parent) {
      const id = this.next++;
      /** @type {Stop} */
      const s = { verse: e.verse, label: typeof e.label === 'string' ? e.label : '', id, parent, kids: [], last: -1 };
      if (e.open !== undefined) s.open = e.open;
      if (e.span) s.span = e.span;
      if (e.via) s.via = e.via;
      pos.set(id, stops.length);
      stops.push(s);
      own.add(id);
      if (parent >= 0) { const p = this.edit(parent); p.kids.push(id); p.last = id; }
      return id;
    },
    /** @param {number} id */
    remove(id) {
      const i = pos.get(id);
      if (i === undefined) return;
      const s = stops[i];
      stops.splice(i, 1);
      pos.clear();
      stops.forEach((x, k) => pos.set(x.id, k));
      if (s.parent >= 0 && pos.has(s.parent)) {
        const p = this.edit(s.parent);
        p.kids = p.kids.filter((k) => k !== id);
        if (p.last === id) p.last = p.kids.length ? p.kids[p.kids.length - 1] : -1;
      }
    },
    /** @returns {Trail} */
    done() { return { stops: this.stops, at: this.at, next: this.next }; },
  };
}

/** A stop's fields an arrival refreshes: its panel, its zoom, its words; its thread when the
 * arrival names one. */
function refresh(d, id, e) {
  const s = d.edit(id);
  if (e.open !== undefined) s.open = e.open;
  if (e.span) s.span = e.span;
  if (typeof e.label === 'string' && e.label) s.label = e.label;
  if (e.via) s.via = e.via;
}

/** The stop gone on to from `from` at `verse`, or null. */
function kidAt(d, from, verse) {
  for (const k of from.kids) {
    const s = d.get(k);
    if (s && s.verse === verse) return s;
  }
  return null;
}

/** Point each stop on the way to `id` at the next one, so Forward from any of them walks on to it. */
function headTo(d, id) {
  let s = d.get(id);
  while (s && s.parent >= 0) {
    const p = d.get(s.parent);
    if (!p) break;
    if (p.last !== s.id) d.edit(p.id).last = s.id;
    s = p;
  }
  d.at = id;
}

/** Past the cap, the oldest branch ends go: a stop no way leads on from, neither where the reader
 * is nor on the way there or on. */
function prune(d) {
  if (d.stops.length <= TRAIL_CAP) return;
  const keep = new Set();
  for (const s of pathOf(d.done()).stops) keep.add(s.id);
  while (d.stops.length > TRAIL_CAP) {
    const end = d.stops.find((s) => !s.kids.length && !keep.has(s.id));
    if (!end) break;
    d.remove(end.id);
  }
}

/**
 * The trail after an arrival (pure, so the rules have their own tests).
 * @param {Trail} t
 * @param {JourneyEntry} entry
 * @param {JourneyEntry | null} [origin]
 * @returns {Trail}
 */
export function arrive(t, entry, origin) {
  if (!valid(entry)) return t;
  const d = draft(t);
  let from = d.get(d.at);
  if (!from) {
    // the first arrival: where the reader set out from, then where they arrived
    const root = valid(origin) && origin.verse !== entry.verse ? d.add(/** @type {JourneyEntry} */ (origin), -1) : -1;
    d.at = d.add(entry, root);
    return d.done();
  }
  if (entry.via && valid(origin) && origin.verse !== from.verse) {
    // a thread that sets out from somewhere other than where the reader is: its near end first,
    // so the stop before the arrival is the verse its thread came from
    const there = kidAt(d, from, /** @type {JourneyEntry} */ (origin).verse);
    const id = there ? there.id : d.add(/** @type {JourneyEntry} */ (origin), from.id);
    headTo(d, id);
    from = /** @type {Stop} */ (d.get(id));
  }
  const back = from.parent >= 0 ? d.get(from.parent) : null;
  if (from.verse === entry.verse) {
    // where the reader is: one stop, its panel and zoom refreshed
    refresh(d, from.id, entry);
    headTo(d, from.id);
  } else if (back && back.verse === entry.verse) {
    // the way it came: a step back, not a longer trail
    refresh(d, back.id, Object.assign({}, entry, { via: null }));
    headTo(d, back.id);
  } else {
    const again = kidAt(d, from, entry.verse);
    if (again) { refresh(d, again.id, entry); headTo(d, again.id); } else headTo(d, d.add(entry, from.id));
  }
  prune(d);
  return d.done();
}

/**
 * The trail with the reader at stop `id` (Back, Forward, a crumb, a path's stop): the stops on
 * the way there point on to it, so Forward from any of them walks back to it.
 * @param {Trail} t @param {number} id @returns {Trail}
 */
export function moveTo(t, id) {
  if (!stopOf(t, id)) return t;
  const d = draft(t);
  headTo(d, id);
  // already there, and every stop on the way already pointing on to it: the same trail
  if (d.at === t.at && d.stops.every((s, i) => s === t.stops[i])) return t;
  return d.done();
}

/* ── the trail as plain data (the resume point; leaving for the reader and coming back) ── */

/** A panel spec as kept: the shapes openPanel opens, without the lit list (a verse lights its own
 * threads again as it opens). @param {any} o */
function keptOpen(o) {
  if (o === null) return null;
  if (!o || typeof o !== 'object') return undefined;
  const int = (x) => Number.isInteger(x) && x >= 0;
  if (o.mode === 'verse' && int(o.verse)) return int(o.verseEnd) ? { mode: 'verse', verse: o.verse, verseEnd: o.verseEnd } : { mode: 'verse', verse: o.verse };
  if (o.mode === 'group' && int(o.chapter)) return { mode: 'group', ids: [], label: typeof o.label === 'string' ? o.label : '', chapter: o.chapter };
  if (o.mode === 'connection' && int(o.arc)) return o.prophecy ? { mode: 'connection', arc: o.arc, prophecy: true } : { mode: 'connection', arc: o.arc };
  if (o.mode === 'letter' && typeof o.letterKey === 'string') return { mode: 'letter', letterKey: o.letterKey };
  return undefined;
}

/** The trail as plain data: every stop's own fields, its panel without the lit list. @param {Trail} t */
export function trailForStorage(t) {
  if (!t || !t.stops.length) return null;
  return {
    v: 1, at: t.at,
    stops: t.stops.map((s) => {
      const o = { id: s.id, verse: s.verse, label: s.label, parent: s.parent, last: s.last };
      const open = keptOpen(s.open);
      if (open !== undefined) o.open = open;
      if (s.span) o.span = [s.span[0], s.span[1]];
      if (s.via) o.via = s.via.prophecy ? { arc: s.via.arc, prophecy: true } : { arc: s.via.arc };
      return o;
    }),
  };
}

/**
 * A kept trail back as a trail, or null when it is not one (checked field by field: it comes from
 * the resume point, which a later build may read). `total` (when known) is the canon's verse count.
 * @param {any} raw @param {number} [total] @returns {Trail | null}
 */
export function restoreTrail(raw, total) {
  if (!raw || raw.v !== 1 || !Array.isArray(raw.stops) || !raw.stops.length) return null;
  const int = (x) => Number.isInteger(x) && x >= 0;
  /** @type {Stop[]} */
  const stops = [];
  const ids = new Set();
  for (const r of raw.stops) {
    if (!r || !int(r.id) || ids.has(r.id) || !int(r.verse) || (total > 0 && r.verse >= total)) return null;
    // a stop's parent is an earlier stop (ids only grow), so a kept trail can hold no loop
    if (!(r.parent === -1 || (int(r.parent) && ids.has(r.parent)))) return null;
    ids.add(r.id);
    /** @type {Stop} */
    const s = { id: r.id, verse: r.verse, label: typeof r.label === 'string' ? r.label.slice(0, 80) : '', parent: r.parent, kids: [], last: -1 };
    const open = keptOpen(r.open);
    if (open !== undefined) s.open = open;
    if (Array.isArray(r.span) && r.span.length === 2 && r.span.every(Number.isFinite) && r.span[0] < r.span[1]) s.span = [r.span[0], r.span[1]];
    if (r.via && int(r.via.arc)) s.via = r.via.prophecy ? { arc: r.via.arc, prophecy: true } : { arc: r.via.arc };
    stops.push(s);
  }
  const byId = new Map(stops.map((s) => [s.id, s]));
  for (const s of stops) if (s.parent >= 0) /** @type {Stop} */ (byId.get(s.parent)).kids.push(s.id);
  const kept = new Map(raw.stops.map((r) => [r.id, r.last]));
  for (const s of stops) {
    const l = kept.get(s.id);
    s.last = s.kids.indexOf(l) >= 0 ? l : (s.kids.length ? s.kids[s.kids.length - 1] : -1);
  }
  const at = byId.has(raw.at) ? raw.at : stops[stops.length - 1].id;
  return { stops: stops.slice(0, TRAIL_CAP), at, next: Math.max(...ids) + 1 };
}

/**
 * The screen's trail. Its identity changes only when the trail does (the selection hook's
 * callbacks list it, and the panel re-renders on it).
 * @param {{ flyTo?: (target: object, opts?: object) => Promise<boolean>, initial?: any, total?: number,
 *   fresh?: boolean }} [deps]
 *   flyTo: the camera's (use-web-camera.js); without it a step only moves the trail. initial: a kept
 *   trail (trailForStorage) to start from, the resume point's or the saved spot's. fresh: the web
 *   opened somewhere of its own (a door in from the reader): the kept paths stay, but the reader is
 *   on none of them, so the next arrival sets out a new path beside them
 * @returns {Journey}
 */
export function useJourney(deps) {
  const flyTo = deps && deps.flyTo;
  const [trail, setTrail] = React.useState(() => {
    const kept = deps ? restoreTrail(deps.initial, deps.total) : null;
    if (!kept) return EMPTY_TRAIL;
    return deps && deps.fresh ? Object.assign({}, kept, { at: -1 }) : kept;
  });
  const trailRef = React.useRef(trail);
  const panelRef = React.useRef(/** @type {JourneyPanel | null} */ (null));
  const flyRef = React.useRef(flyTo);
  flyRef.current = flyTo;

  const set = React.useCallback((/** @type {Trail} */ next) => {
    if (next === trailRef.current) return;
    trailRef.current = next.stops.length ? next : EMPTY_TRAIL;
    setTrail(trailRef.current);
  }, []);

  const push = React.useCallback((entry, origin) => {
    const t = trailRef.current;
    const p = panelRef.current;
    const now = p && p.here ? p.here() : null;
    const from = origin !== undefined ? origin : (t.at < 0 ? now : null);
    // an arrival that opens nothing keeps what is open (the panel stays up through a book's fly)
    const at = entry && entry.open === undefined && now ? Object.assign({}, entry, { open: now.open }) : entry;
    set(arrive(t, at, from));
  }, [set]);

  const clear = React.useCallback(() => { if (trailRef.current.stops.length) set(EMPTY_TRAIL); }, [set]);

  // each stream connects its part (the go-to the panel API, the selection isAt): merged, not swapped
  const connect = React.useCallback((panel) => {
    panelRef.current = panel ? Object.assign({}, panelRef.current, panel) : null;
  }, []);

  /** Take the reader to the trail `next` puts them at: the camera flies there and the stop's panel
   * opens on landing; a flight cut short puts the trail back as it was (`was`). */
  const travel = React.useCallback((/** @type {Trail} */ was, /** @type {Trail} */ next) => {
    const to = stopOf(next, next.at);
    if (!to) return null;
    set(next);
    const left = trailRef.current;
    const p0 = panelRef.current;
    if (p0 && typeof p0.onTravel === 'function') p0.onTravel();
    const missed = () => { if (trailRef.current === left) set(was); };
    const arrived = () => {
      const p = panelRef.current;
      if (!p || to.open === undefined) return;
      if (to.open === null) { if (p.closePanel) p.closePanel(); return; }
      // a verse stop opens with the thread the reader came along chosen again (its way in)
      const spec = to.via && to.open.mode === 'verse' && to.open.verse === to.verse ? Object.assign({}, to.open, { via: to.via }) : to.open;
      if (p.openPanel) p.openPanel(spec);
      if (to.open.lit && p.lightThreads) p.lightThreads(to.open.lit);
    };
    const fly = flyRef.current;
    if (typeof fly === 'function') {
      // a stop is a verse; the camera centres its middle, where a foot stands (v + 0.5), as Follow does
      const target = to.span ? { x0: to.span[0], x1: to.span[1] } : { x: to.verse + 0.5 };
      Promise.resolve(fly(target)).then((ok) => { if (ok) arrived(); else missed(); }, missed);
    } else arrived();
    return to;
  }, [set]);

  /** Whether the panel shows the stop the reader is at (no panel connected: it does). */
  const showing = React.useCallback((/** @type {Stop} */ s) => {
    const p = panelRef.current;
    return !p || typeof p.isAt !== 'function' || !!p.isAt(s);
  }, []);

  const back = React.useCallback(() => {
    const t = trailRef.current;
    const here = stopOf(t, t.at);
    if (!here) return null;
    // the panel moved on from where the reader stands (a line tapped on the way, the panel closed):
    // Back is the way back to it first
    if (!showing(here)) return travel(t, t);
    return here.parent >= 0 ? travel(t, moveTo(t, here.parent)) : null;
  }, [travel, showing]);

  const forward = React.useCallback(() => {
    const t = trailRef.current;
    const here = stopOf(t, t.at);
    return here && here.last >= 0 ? travel(t, moveTo(t, here.last)) : null;
  }, [travel]);

  const go = React.useCallback((/** @type {number} */ id) => {
    const t = trailRef.current;
    const s = stopOf(t, id);
    if (!s) return null;
    if (id === t.at && showing(s)) return s;
    return travel(t, moveTo(t, id));
  }, [travel, showing]);

  const snapshot = React.useCallback(() => trailForStorage(trailRef.current), []);

  return React.useMemo(() => ({
    trail, path: pathOf(trail), here: stopOf(trail, trail.at), stack: chainTo(trail, trail.at),
    push, back, forward, go, clear, connect, snapshot,
  }), [trail, push, back, forward, go, clear, connect, snapshot]);
}
