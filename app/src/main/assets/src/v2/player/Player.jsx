/* player/Player.jsx - the v2 player (rv1, 2026-10-14): the mini player every phone screen shares, Now playing (a
   full screen on the phone, a panel docked right on the laptop, D3), its three sheets (speed, sleep timer, up next;
   dialogs on the laptop, D4), its ... (2f: a sheet on the phone, D6's menu in the laptop's panel) and the laptop's player
   bar. Pictures: design's v2-step2 gate-refs 2b, 2f, 6a, 6b, 6c, 2a, desktop/2b, desktop/2f and desktop/1b (the bar).
   The player is shell chrome, not a place: V2App renders these in its slots. */
import { Icon } from '../Icon.jsx';
import { Menu } from '../Menu.jsx';
import { askVotCorpus } from '../corpus.js';
import { pushListening } from '../settings-pages.js';
import { realSource, fakeSource, silentSource } from './source.js';
import { stillWashes } from './read-along.jsx';
import {
  trackInfo, miniLine, clock, timeLeft, progressPct, rateLabel, speedWords, ratePct, clampRate, sleepChip, sleepChoice,
  upNextRows, RATE_MIN, RATE_MAX, RATE_PICKS, SLEEP_OPTIONS,
} from './view.js';

/** A row dragged this far sideways is removed from up next. */
export const SWIPE_REMOVE_PX = 96;

/**
 * @typedef {{ np: boolean, sheet: null | 'speed' | 'sleep' | 'up-next' | 'more' }} PlayerUi
 * @typedef {{ source: import('./source.js').PlayerSource, st: import('./source.js').PlayerState, track: any,
 *   ui: PlayerUi, ready: boolean, playing: boolean,
 *   openNp: () => void, closeNp: () => void, openSheet: (s: PlayerUi['sheet']) => void, closeSheet: () => void,
 *   back: () => boolean }} PlayerModel
 */

/** @param {any} open the gate row's player.open @returns {PlayerUi} */
function seedUi(open) {
  if (open === 'speed' || open === 'sleep' || open === 'up-next' || open === 'more') return { np: true, sheet: open };
  return { np: open === 'now-playing', sheet: null };
}

/**
 * The player's state for V2App: the real engine, or on a gate boot the row's fake (no row `playing` = nothing plays).
 * @param {import('../gate.js').GateState | null} gate @returns {PlayerModel}
 */
export function usePlayer(gate) {
  const [source] = React.useState(() => {
    if (gate) return gate.playing ? fakeSource(gate.playing) : silentSource();
    return realSource() || silentSource();
  });
  React.useSyncExternalStore(source.subscribe, source.version);
  // a real boot hands the engine and the download stores the saved favourite reader and Wi-Fi switch (main's App did)
  React.useEffect(() => { if (!gate) pushListening(); }, [gate]);
  const [ui, setUi] = React.useState(() => seedUi(gate && gate.player ? gate.player.open : null));
  // A gate's playing letter lives in a lazy volume: ask for it (one ask with the screen's), then build the queue. A load
  // that fails or lands without the letter leaves nothing playing, and the player says ready all the same.
  const [asked, setAsked] = React.useState(false);
  // ...and a gate letter's still wash (read-along.jsx) holds it until the lit sentence is on the page.
  const washing = React.useSyncExternalStore(stillWashes.subscribe, stillWashes.pending) > 0;
  const sourceReady = source.ready() || asked;
  const ready = sourceReady && !washing;
  React.useEffect(() => {
    if (sourceReady) return undefined;
    let live = true;
    const settle = () => { if (live) setAsked(true); };
    askVotCorpus().then(settle, settle);
    return () => { live = false; };
  }, [sourceReady]);
  const st = source.state();
  const track = st.status !== 'idle' ? st.queue[st.qi] || null : null;
  // Playback that ends closes its player.
  React.useEffect(() => { if (!track && sourceReady) setUi((u) => (u.np || u.sheet ? { np: false, sheet: null } : u)); }, [track, sourceReady]);
  const uiRef = React.useRef(ui);
  uiRef.current = ui;
  return {
    source, st, track, ui, ready,
    playing: st.status === 'playing' || st.status === 'loading',
    openNp: () => setUi({ np: true, sheet: null }),
    closeNp: () => setUi({ np: false, sheet: null }),
    openSheet: (sheet) => setUi((u) => ({ np: u.np, sheet })),
    closeSheet: () => setUi((u) => ({ np: u.np, sheet: null })),
    // Android's back closes a sheet, then Now playing, before it leaves a page.
    back: () => {
      const u = uiRef.current;
      if (u.sheet) { setUi({ np: u.np, sheet: null }); return true; }
      if (u.np) { setUi({ np: false, sheet: null }); return true; }
      return false;
    },
  };
}

/** @param {{ cover: { cn: string, cl: string | null, sm: boolean }, size: 's40' | 's48' | 'np-art' }} props */
function Cover({ cover, size }) {
  const big = size === 'np-art';
  return (
    <div className={'cover ' + size + (cover.sm && !big ? ' sm' : '')}>
      <span className="cn">{cover.cn}</span>
      {big && cover.cl && <span className="cl">{cover.cl}</span>}
    </div>
  );
}

/**
 * A scrub bar (the kit's .scrub): drag or tap to pick a point, arrow keys step. pct 0-100; onPick gets 0-1.
 * @param {{ className?: string, pct: number, label: string, valueText: string, onPick: (f: number) => void,
 *   onStep: (dir: number) => void }} props
 */
function Scrub({ className = 'scrub', pct, label, valueText, onPick, onStep }) {
  const ref = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const [drag, setDrag] = React.useState(/** @type {number | null} */ (null));
  const at = (e) => {
    const r = ref.current ? ref.current.getBoundingClientRect() : null;
    if (!r || !r.width) return 0;
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  const shown = drag == null ? pct : drag * 100;
  return (
    <div className={className} ref={ref} role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={Math.round(shown)} aria-valuetext={valueText}
      onPointerDown={(e) => { if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId); setDrag(at(e)); }}
      onPointerMove={(e) => { if (drag != null) setDrag(at(e)); }}
      onPointerUp={(e) => { const f = at(e); setDrag(null); onPick(f); }}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onStep(1); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onStep(-1); }
      }}>
      <div className="tr" /><div className="fi" style={{ width: shown + '%' }} /><div className="th" style={{ left: shown + '%' }} />
    </div>
  );
}

/** @param {{ player: PlayerModel }} props */
export function MiniPlayer({ player }) {
  const { st, track, source, playing } = player;
  if (!track) return null;
  const info = trackInfo(track);
  return (
    <div className="mini" data-zone="mini" onClick={player.openNp}>
      <div className="prog" style={{ width: progressPct(st.time, st.duration) + '%' }} />
      <Cover cover={info.cover} size="s40" />
      <div className="tx"><div className="t">{info.title}</div><div className="s">{miniLine(info, st)}</div></div>
      <button type="button" className="ic" aria-label={playing ? 'Pause' : 'Play'}
        onClick={(e) => { e.stopPropagation(); source.toggle(); }}>
        <Icon name={playing ? 'pause' : 'play'} size={24} />
      </button>
    </div>
  );
}

/** The laptop's player bar (D3): hidden while Now playing is docked. @param {{ player: PlayerModel }} props */
export function PlayerBar({ player }) {
  const { st, track, source, playing, ui } = player;
  if (!track || ui.np) return null;
  const info = trackInfo(track);
  return (
    <div className="pbar">
      <div className="prog" style={{ width: progressPct(st.time, st.duration) + '%' }} />
      <button type="button" className="now" data-zone="bar-now" aria-label="Open the player" onClick={player.openNp}>
        <Cover cover={info.cover} size="s48" />
        <span className="tx"><span className="t">{info.title}</span><span className="s">{miniLine(info, st)}</span></span>
      </button>
      <div className="tp" data-zone="bar-tp">
        <button type="button" className="ic" aria-label="Back 15 seconds" onClick={() => source.skip(-15)}><Icon name="back15" /></button>
        <button type="button" className="ic" aria-label="Previous" onClick={() => source.prev()}><Icon name="prev" /></button>
        <button type="button" className="pp" aria-label={playing ? 'Pause' : 'Play'} onClick={() => source.toggle()}>
          <Icon name={playing ? 'pause' : 'play'} size={22} />
        </button>
        <button type="button" className="ic" aria-label="Next" onClick={() => source.next()}><Icon name="next" /></button>
        <button type="button" className="ic" aria-label="Forward 15 seconds" onClick={() => source.skip(15)}><Icon name="fwd15" /></button>
      </div>
      <div className="xt" data-zone="bar-xt">
        <span className="tm num">{clock(st.time)} / {clock(st.duration)}</span>
        <button type="button" className="chip num" aria-label={'Speed ' + rateLabel(st.rate)} onClick={() => player.openSheet('speed')}>{rateLabel(st.rate)}</button>
        <button type="button" className="ic" aria-label="Sleep timer" onClick={() => player.openSheet('sleep')}><Icon name="moon" /></button>
        <button type="button" className="ic" aria-label="Up next" onClick={() => player.openSheet('up-next')}><Icon name="queue" /></button>
        <button type="button" className="ic open-np" aria-label="Open the player" onClick={player.openNp}><Icon name="down2" /></button>
      </div>
    </div>
  );
}

/** Where Read along goes: the playing letter (or chapter) as a route. */
export function readAlongRoute(info, track) {
  if (info.kind === 'letter' && info.collection && info.n) return { place: 'letter', collection: info.collection, n: info.n };
  if (info.kind === 'bible' && track && typeof track.key === 'string') {
    const m = /(\d+)\s*$/.exec(info.title);
    if (m) return { place: 'bible-chapter', book: track.key.slice(track.key.indexOf(':') + 1), chapter: Number(m[1]) };
  }
  return null;
}

/**
 * Now playing: the phone's player screen, or the laptop's docked panel.
 * @param {{ player: PlayerModel, desktop: boolean, go: (...routes: any[]) => void }} props
 */
export function NowPlaying({ player, desktop, go }) {
  const { st, track, source, playing, ui } = player;
  const moreRef = React.useRef(/** @type {HTMLButtonElement | null} */ (null));
  // A gate boot draws the laptop's menu open with no tap: focus stays put (no ring in the picture).
  const seeded = React.useRef(ui.sheet === 'more');
  if (!ui.np || !track) return null;
  const moreOpen = ui.sheet === 'more';
  const toggleMore = () => { seeded.current = false; if (moreOpen) player.closeSheet(); else player.openSheet('more'); };
  const info = trackInfo(track);
  const saved = source.isSaved(track.url);
  const left = source.sleepLeft();
  const route = readAlongRoute(info, track);
  const tb = (
    <div className="tb np-tb">
      <button type="button" className="ic" aria-label="Close the player" onClick={player.closeNp}><Icon name="down2" /></button>
      <span className="title np-title">Now playing</span>
      <button type="button" className="ic" aria-label="Up next" onClick={() => player.openSheet('up-next')}><Icon name="queue" /></button>
      <button ref={moreRef} type="button" className={'ic' + (desktop && moreOpen ? ' opn' : '')} aria-label="More"
        aria-haspopup={desktop ? 'menu' : 'dialog'} aria-expanded={moreOpen} onClick={toggleMore}><Icon name="more" /></button>
    </div>
  );
  const body = (
    <>
      <Cover cover={info.cover} size="np-art" />
      <div className="np-meta">
        <span className="overline">{info.overline}</span>
        <div className="np-t">{info.title}</div>
        <div className="np-s">{info.by}
          {saved && <><span className="dot">·</span><span className="st"><Icon name="checkCircle" />{desktop ? 'On this computer' : 'On this phone'}</span></>}
        </div>
      </div>
      <Scrub pct={progressPct(st.time, st.duration)} label="Position" valueText={clock(st.time) + ' of ' + clock(st.duration)}
        onPick={(f) => source.seek(f * st.duration)} onStep={(d) => source.skip(d * 15)} />
      <div className="times num"><span>{clock(st.time)}</span><span>{timeLeft(st.time, st.duration)}</span></div>
      <div className="ctrls">
        <button type="button" className="ic sk" aria-label="Back 15 seconds" onClick={() => source.skip(-15)}><Icon name="back15" /></button>
        <button type="button" className="ic" aria-label="Previous" onClick={() => source.prev()}><Icon name="prev" /></button>
        <button type="button" className="bigplay" aria-label={playing ? 'Pause' : 'Play'} onClick={() => source.toggle()}>
          <Icon name={playing ? 'pause' : 'play'} size={32} />
        </button>
        <button type="button" className="ic" aria-label="Next" onClick={() => source.next()}><Icon name="next" /></button>
        <button type="button" className="ic sk" aria-label="Forward 15 seconds" onClick={() => source.skip(15)}><Icon name="fwd15" /></button>
      </div>
      <div className="chips np-chips">
        <button type="button" className="chip num" onClick={() => player.openSheet('speed')}>{rateLabel(st.rate)} speed</button>
        <button type="button" className="chip" onClick={() => player.openSheet('sleep')}><Icon name="moon" />{sleepChip(st, left)}</button>
      </div>
      {route && (
        <button type="button" className="srow np-ra" onClick={() => { player.closeNp(); go(route); }}>
          <span className="lead"><Icon name="readalong" /></span>
          <span className="tx"><span className="t">Read along</span><span className="s">Opens the text with the line being read lit</span></span>
          <span className="chev"><Icon name="chev" /></span>
        </button>
      )}
    </>
  );
  if (desktop) {
    // D6: the ... hangs its menu inside the panel; a pick hands focus back to the ... (APG's menu button).
    const closeMenu = () => { player.closeSheet(); if (moreRef.current) moreRef.current.focus(); };
    return (
      <aside className="panel anc" data-zone="panel">{tb}<div className="g np">{body}</div>
        {moreOpen && (
          <Menu label="More" anchorRef={moreRef} onClose={player.closeSheet} className="np" focusFirst={!seeded.current}>
            <MoreItems player={player} menu close={closeMenu} />
          </Menu>
        )}
      </aside>
    );
  }
  return <div className="np-screen" role="dialog" aria-label="Now playing">{tb}<div className="content g np">{body}</div></div>;
}

/**
 * A typed speed as a rate, or null for "keep it" (empty, not a number). A whole number past the range is a percentage
 * ("125" = 1.25x); anything else outside it clamps.
 * @param {string} typed
 */
export function typedRate(typed) {
  const s = String(typed).trim().replace(/[×x%]$/i, '').trim();
  const n = s === '' ? NaN : Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return clampRate(n > RATE_MAX && Number.isInteger(n) && n >= 10 ? n / 100 : n);
}

/**
 * 6a's big number: tap it to type a speed (main's speed readout does the same). The box opens empty with the speed as
 * its placeholder, as main's does (Chrome gives a number box no selection, so a pre-filled "1.5" read "1.535" typed over).
 * @param {{ rate: number, onRate: (r: number) => void }} props
 */
function SpeedValue({ rate, onRate }) {
  const [typed, setTyped] = React.useState(/** @type {string | null} */ (null));
  // The box's text as last typed, and null once it is done: a blur that follows Enter or Escape (a removed box can
  // still blur) then finds nothing to set.
  const live = React.useRef(/** @type {string | null} */ (null));
  const open = () => { live.current = ''; setTyped(''); };
  const close = () => { live.current = null; setTyped(null); };
  const commit = () => {
    const r = live.current == null ? null : typedRate(live.current);
    close();
    if (r != null) onRate(r);
  };
  if (typed == null) {
    return <button type="button" className="v num" aria-label={'Speed ' + rateLabel(rate) + ', tap to type a value'} onClick={open}>{rateLabel(rate)}</button>;
  }
  return (
    <input type="number" inputMode="decimal" className="v num" aria-label="Speed" min={RATE_MIN} max={RATE_MAX} step={0.01}
      value={typed} placeholder={String(rate)} autoFocus
      onChange={(e) => { live.current = e.target.value; setTyped(e.target.value); }} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      }} />
  );
}

/** @param {{ player: PlayerModel }} props */
function SpeedSheet({ player }) {
  const { st, source } = player;
  const rate = clampRate(st.rate);
  return (
    <>
      <div className="sh">Speed</div>
      <div className="spd-now">
        <button type="button" className="stepb" aria-label="Slower by 1 %" onClick={() => source.setRate(clampRate(rate - 0.01))}><Icon name="minus" /></button>
        <SpeedValue rate={rate} onRate={(r) => source.setRate(r)} />
        <button type="button" className="stepb" aria-label="Faster by 1 %" onClick={() => source.setRate(clampRate(rate + 0.01))}><Icon name="plus" /></button>
      </div>
      <p className="spd-s">{speedWords(rate)}</p>
      <Scrub className="scrub spd-sl" pct={ratePct(rate)} label="Speed" valueText={rateLabel(rate)}
        onPick={(f) => source.setRate(clampRate(RATE_MIN + f * (RATE_MAX - RATE_MIN)))}
        onStep={(d) => source.setRate(clampRate(rate + d * 0.01))} />
      <div className="times num"><span>{rateLabel(RATE_MIN)}</span><span>{rateLabel(RATE_MAX)}</span></div>
      <div className="chips spd-chips">
        {RATE_PICKS.map((r) => {
          const on = Math.abs(r - rate) < 0.005;
          return <button key={r} type="button" className={'chip num' + (on ? ' on' : '')} aria-pressed={on} onClick={() => source.setRate(r)}>{rateLabel(r)}</button>;
        })}
      </div>
      <button type="button" className="pill block done" onClick={player.closeSheet}>Done</button>
    </>
  );
}

/** @param {{ player: PlayerModel }} props */
function SleepSheet({ player }) {
  const { st, source } = player;
  const left = source.sleepLeft();
  const choice = sleepChoice(st, left);
  const pick = (id) => {
    if (id === 'off') source.clearSleep();
    else if (id === 'end') source.sleepAtEnd();
    else source.setSleep(id);
    player.closeSheet();
  };
  return (
    <>
      <div className="sh">Sleep timer</div>
      <div className="opts">
        {SLEEP_OPTIONS.map((o) => {
          const on = choice === o.id;
          return (
            <button key={o.id} type="button" className={'srow opt' + (on ? ' on' : '')} aria-pressed={on} onClick={() => pick(o.id)}>
              <span className="tx">
                <span className="t">{o.label}</span>
                {on && typeof o.id === 'number' && left > 0 && <span className="s">{Math.max(1, Math.ceil(left / 60))} min left</span>}
              </span>
              {on && <span className="ck"><Icon name="check" /></span>}
            </button>
          );
        })}
      </div>
      <p className="fine">When it runs out, playback pauses and a note says so.</p>
    </>
  );
}

/**
 * One up-next row: tap plays it; its grip drags it up or down; a sideways swipe removes it.
 * @param {{ row: any, player: PlayerModel }} props
 */
function QueueRow({ row, player }) {
  const { source, st } = player;
  const ref = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const drag = React.useRef(/** @type {null | { x: number, y: number, mode: 'grip' | 'swipe' }} */ (null));
  const [shift, setShift] = React.useState({ x: 0, y: 0 });
  const rowHeight = () => (ref.current && ref.current.getBoundingClientRect().height) || 64;
  const start = (mode) => (e) => {
    if (row.current) return;
    if (mode === 'grip') e.stopPropagation();
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, mode };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'grip') setShift({ x: 0, y: e.clientY - d.y });
    else if (Math.abs(e.clientX - d.x) > Math.abs(e.clientY - d.y)) setShift({ x: e.clientX - d.x, y: 0 });
  };
  const end = (e) => {
    const d = drag.current;
    drag.current = null;
    setShift({ x: 0, y: 0 });
    if (!d) return;
    if (d.mode === 'grip') {
      const by = Math.round((e.clientY - d.y) / rowHeight());
      const to = Math.max(st.qi + 1, Math.min(st.queue.length - 1, row.index + by));
      if (to !== row.index) source.move(row.index, to);
    } else if (Math.abs(e.clientX - d.x) >= SWIPE_REMOVE_PX) {
      source.remove(row.index);
    } else if (Math.abs(e.clientX - d.x) < 8 && Math.abs(e.clientY - d.y) < 8) {
      source.playAt(row.index);
    }
  };
  const style = shift.x || shift.y ? { transform: 'translate(' + shift.x + 'px,' + shift.y + 'px)', position: /** @type {'relative'} */ ('relative'), zIndex: 1 } : undefined;
  return (
    <div ref={ref} className={'row num-row' + (row.current ? ' playing qcur' : '')} style={style}
      onPointerDown={row.current ? undefined : start('swipe')} onPointerMove={move} onPointerUp={end}
      onPointerCancel={() => { drag.current = null; setShift({ x: 0, y: 0 }); }}>
      <span className="no">{row.no}</span>
      {/* Keys and screen readers reach what a finger does by tap or swipe: the words play the row (a pointer's tap is
          the row's own; detail 0 is a click no pointer made), the grip moves it or Deletes it, a hidden Remove button. */}
      <div className="tx" {...(row.current ? {} : {
        role: 'button', tabIndex: 0, 'aria-label': 'Play now: ' + row.title,
        onClick: (e) => { if (e.detail === 0) source.playAt(row.index); },
        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); source.playAt(row.index); } },
      })}>
        <div className="t">{row.title}</div>
        <div className="s">{row.current && <span className="eq"><i style={{ height: 7 }} /><i style={{ height: 12 }} /><i style={{ height: 9 }} /></span>}{row.sub}</div>
      </div>
      {!row.current && (
        <button type="button" className="ic grip" aria-label={'Move ' + row.title} aria-keyshortcuts="ArrowUp ArrowDown Delete"
          onPointerDown={start('grip')} onPointerMove={move} onPointerUp={end}
          onKeyDown={(e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); source.remove(row.index); return; }
            const by = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
            const to = row.index + by;
            if (by && to > st.qi && to < st.queue.length) { e.preventDefault(); source.move(row.index, to); }
          }}>
          <Icon name="grip" />
        </button>
      )}
      {!row.current && (
        <button type="button" className="rm" aria-label={'Remove ' + row.title + ' from up next'}
          onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}
          onClick={() => source.remove(row.index)}>Remove</button>
      )}
    </div>
  );
}

/** @param {{ player: PlayerModel }} props */
function UpNextSheet({ player }) {
  const { rows, count } = upNextRows(player.st);
  return (
    <>
      <div className="upn-h">
        <div className="sh">Up next</div>
        <span className="cnt num">{count}</span>
        <button type="button" className="textbtn sm" disabled={rows.length < 2} onClick={() => player.source.clearUpcoming()}>Clear upcoming</button>
      </div>
      <div className="rows q">{rows.map((r) => <QueueRow key={r.index + ':' + r.title} row={r} player={player} />)}</div>
    </>
  );
}

/** Main's confirm strip words: a voice rebuilds the queue, so a queue changed by hand (or one lone recording) asks first. */
const VOICE_ASK = 'Switching voice rebuilds this queue and drops your changes to it. Continue?';
const VOICE_ASK_ONE = 'Switching voice rebuilds this into a full queue. Continue?';

/**
 * The ...'s items (2f; main's AudioManagerSheet): Save recording, then the voices when there are two or more. A voice
 * starts the recording again in it, the queue following; with up next changed by hand it asks first. `menu`: the
 * laptop's D6 menu (menu item roles), else the phone sheet's toggle button and radio group (main's semantics).
 * @param {{ player: PlayerModel, menu?: boolean, close: () => void }} props
 */
function MoreItems({ player, menu = false, close }) {
  const { source, st } = player;
  const [pending, setPending] = React.useState(/** @type {string | null} */ (null));
  const yesRef = React.useRef(/** @type {HTMLButtonElement | null} */ (null));
  const rows = React.useRef(/** @type {Record<string, HTMLButtonElement | null>} */ ({}));
  React.useEffect(() => { if (pending && yesRef.current) yesRef.current.focus(); }, [pending]);
  const saved = source.recordingSaved();
  const voices = source.voices();
  const edition = !!voices && voices.kind === 'edition';
  const asking = pending && voices ? voices.choices.find((c) => c.id === pending) || null : null;
  const item = menu ? { role: 'menuitem', tabIndex: -1 } : {};
  const pick = (c) => {
    if (c.active) { close(); return; }
    if (source.voiceNeedsConfirm()) { setPending(c.id); return; }
    source.pickVoice(c.id);
    close();
  };
  const keep = () => { const row = pending ? rows.current[pending] : null; setPending(null); if (row) row.focus(); };
  return (
    <>
      <button type="button" className={'srow act' + (saved ? ' on' : '')} {...(menu ? item : { 'aria-pressed': saved })}
        onClick={() => source.toggleRecordingSaved()}>
        <span className="lead"><Icon name="bookmark" /></span>
        <span className="tx"><span className="t">{saved ? 'Remove from saved recordings' : 'Save recording'}</span></span>
      </button>
      {voices && (
        <>
          <span className="label mlab">{edition ? 'Audio Bible' : 'Voice'}</span>
          <div className="opts mv" role={menu ? 'group' : 'radiogroup'} aria-label={edition ? 'Recorded edition for this chapter' : 'Reader for this recording'}>
            {voices.choices.map((c) => (
              <button key={c.id} ref={(el) => { rows.current[c.id] = el; }} type="button" className={'srow opt' + (c.active ? ' on' : '')}
                role={menu ? 'menuitemradio' : 'radio'} aria-checked={c.active} tabIndex={menu ? -1 : undefined} onClick={() => pick(c)}>
                <span className="tx"><span className="t">{c.label}</span></span>
                {c.active && <span className="ck"><Icon name="check" /></span>}
              </button>
            ))}
          </div>
          {asking ? (
            <>
              <p className="fine mvn" id="v2-mvq">{st.queue.length < 2 ? VOICE_ASK_ONE : VOICE_ASK}</p>
              <div className="mvc">
                <button ref={yesRef} type="button" className="pill sm" {...item} aria-describedby="v2-mvq"
                  onClick={() => { setPending(null); source.pickVoice(asking.id); close(); }}>Yes, switch</button>
                <button type="button" className="btn2 sm" {...item} onClick={keep}>Cancel</button>
              </div>
            </>
          ) : (
            <p className="fine mvn">Switches this {edition ? 'chapter' : 'recording'} — starts it again, and the queue follows.</p>
          )}
        </>
      )}
    </>
  );
}

/** The phone's ... sheet: titled by the recording, Cancel at its foot. @param {{ player: PlayerModel }} props */
function MoreSheet({ player }) {
  return (
    <>
      <div className="sh">{trackInfo(player.track).title}</div>
      <MoreItems player={player} close={player.closeSheet} />
      <button type="button" className="textbtn cancel" onClick={player.closeSheet}>Cancel</button>
    </>
  );
}

/** @type {Record<string, { cls: string, label: string, Body: (props: { player: PlayerModel }) => any, scrim?: string }>} */
const SHEETS = {
  speed: { cls: 'spd', label: 'Speed', Body: SpeedSheet },
  sleep: { cls: 'slp', label: 'Sleep timer', Body: SleepSheet },
  'up-next': { cls: 'tall upn', label: 'Up next', Body: UpNextSheet },
  more: { cls: 'mor', label: 'More', Body: MoreSheet, scrim: 'light' },
};

/**
 * The open sheet: pulled up from the bottom on the phone, a centred dialog on the laptop (D4).
 * @param {{ player: PlayerModel, desktop: boolean }} props
 */
export function PlayerSheet({ player, desktop }) {
  const sheet = player.ui.sheet ? SHEETS[player.ui.sheet] : null;
  // The laptop's ... is D6's menu in Now playing's panel, not a dialog.
  if (!sheet || !player.track || (desktop && player.ui.sheet === 'more')) return null;
  const { Body } = sheet;
  return (
    <>
      <div className={'scrim' + (sheet.scrim ? ' ' + sheet.scrim : '')} onClick={player.closeSheet} />
      <div className={(desktop ? 'dlg ' : 'sheet ') + sheet.cls} role="dialog" aria-modal="true" aria-label={sheet.label}>
        {!desktop && <div className="handle" />}
        <Body player={player} />
      </div>
    </>
  );
}
