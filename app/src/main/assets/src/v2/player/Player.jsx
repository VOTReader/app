/* player/Player.jsx - the v2 player (rv1, 2026-10-14): the mini player every phone screen shares, Now playing (a
   full screen on the phone, a panel docked right on the laptop, D3), its three sheets (speed, sleep timer, up next;
   dialogs on the laptop, D4) and the laptop's player bar. Pictures: design's v2-step2 gate-refs 2b, 6a, 6b, 6c, 2a,
   desktop/2b and desktop/1b (the bar). The player is shell chrome, not a place: V2App renders these in its slots. */
import { Icon } from '../Icon.jsx';
import { askVotCorpus } from '../corpus.js';
import { realSource, fakeSource, silentSource } from './source.js';
import {
  trackInfo, miniLine, clock, timeLeft, progressPct, rateLabel, speedWords, ratePct, clampRate, sleepChip, sleepChoice,
  upNextRows, RATE_MIN, RATE_MAX, RATE_PICKS, SLEEP_OPTIONS,
} from './view.js';

/** A row dragged this far sideways is removed from up next. */
export const SWIPE_REMOVE_PX = 96;

/**
 * @typedef {{ np: boolean, sheet: null | 'speed' | 'sleep' | 'up-next' }} PlayerUi
 * @typedef {{ source: import('./source.js').PlayerSource, st: import('./source.js').PlayerState, track: any,
 *   ui: PlayerUi, ready: boolean, playing: boolean,
 *   openNp: () => void, closeNp: () => void, openSheet: (s: PlayerUi['sheet']) => void, closeSheet: () => void,
 *   back: () => boolean }} PlayerModel
 */

/** @param {any} open the gate row's player.open @returns {PlayerUi} */
function seedUi(open) {
  if (open === 'speed' || open === 'sleep' || open === 'up-next') return { np: true, sheet: open };
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
  const [ui, setUi] = React.useState(() => seedUi(gate && gate.player ? gate.player.open : null));
  // A gate's playing letter lives in a lazy volume: ask for it (one ask with the screen's), then build the queue. A load
  // that fails or lands without the letter leaves nothing playing, and the player says ready all the same.
  const [asked, setAsked] = React.useState(false);
  const ready = source.ready() || asked;
  React.useEffect(() => {
    if (ready) return undefined;
    let live = true;
    const settle = () => { if (live) setAsked(true); };
    askVotCorpus().then(settle, settle);
    return () => { live = false; };
  }, [ready]);
  const st = source.state();
  const track = st.status !== 'idle' ? st.queue[st.qi] || null : null;
  // Playback that ends closes its player.
  React.useEffect(() => { if (!track && ready) setUi((u) => (u.np || u.sheet ? { np: false, sheet: null } : u)); }, [track, ready]);
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
  if (!ui.np || !track) return null;
  const info = trackInfo(track);
  const saved = source.isSaved(track.url);
  const left = source.sleepLeft();
  const route = readAlongRoute(info, track);
  const tb = (
    <div className="tb np-tb">
      <button type="button" className="ic" aria-label="Close the player" onClick={player.closeNp}><Icon name="down2" /></button>
      <span className="title np-title">Now playing</span>
      <button type="button" className="ic" aria-label="Up next" onClick={() => player.openSheet('up-next')}><Icon name="queue" /></button>
      <button type="button" className="ic" aria-label="More"><Icon name="more" /></button>
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
  if (desktop) return <aside className="panel" data-zone="panel">{tb}<div className="g np">{body}</div></aside>;
  return <div className="np-screen" role="dialog" aria-label="Now playing">{tb}<div className="content g np">{body}</div></div>;
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
        <div className="v num">{rateLabel(rate)}</div>
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
      <div className="tx">
        <div className="t">{row.title}</div>
        <div className="s">{row.current && <span className="eq"><i style={{ height: 7 }} /><i style={{ height: 12 }} /><i style={{ height: 9 }} /></span>}{row.sub}</div>
      </div>
      {!row.current && (
        <button type="button" className="ic grip" aria-label={'Move ' + row.title}
          onPointerDown={start('grip')} onPointerMove={move} onPointerUp={end}
          onKeyDown={(e) => {
            const by = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
            const to = row.index + by;
            if (by && to > st.qi && to < st.queue.length) { e.preventDefault(); source.move(row.index, to); }
          }}>
          <Icon name="grip" />
        </button>
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

const SHEETS = {
  speed: { cls: 'spd', label: 'Speed', Body: SpeedSheet },
  sleep: { cls: 'slp', label: 'Sleep timer', Body: SleepSheet },
  'up-next': { cls: 'tall upn', label: 'Up next', Body: UpNextSheet },
};

/**
 * The open sheet: pulled up from the bottom on the phone, a centred dialog on the laptop (D4).
 * @param {{ player: PlayerModel, desktop: boolean }} props
 */
export function PlayerSheet({ player, desktop }) {
  const sheet = player.ui.sheet ? SHEETS[player.ui.sheet] : null;
  if (!sheet || !player.track) return null;
  const { Body } = sheet;
  return (
    <>
      <div className="scrim" onClick={player.closeSheet} />
      <div className={(desktop ? 'dlg ' : 'sheet ') + sheet.cls} role="dialog" aria-modal="true" aria-label={sheet.label}>
        {!desktop && <div className="handle" />}
        <Body player={player} />
      </div>
    </>
  );
}
