/* SettingsPages - the Settings pages (zv1; pictures 7a-listening, 7b-your-data, 7c-help): Listening, Your data, Help and
   about, and Credits under it.

   Each page re-shows main's own settings and changes them the way main's Settings does (settings-pages.js): a choice
   opens a sheet of main's options, a switch flips main's key, Your data runs main's own backup flow (utils/backup-flow.js:
   export, import with its overwrite question, check a file, clear everything behind a typed DELETE). A gate boot shows
   states.json's facts and every control is inert. */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { GATE_NOW } from '../gate.js';
import { Sheet } from '../Sheet.jsx';
import { createBackupFlow } from '../../utils/backup-flow.js';
import {
  READERS, PLAY_SWITCHES, SONG_SWITCH, liveListening, readerLine, editionOptions, editionLine, rateLabel, rateOptions,
  writeSetting, writeRate, liveData, here, safeCard, weeklyLine, versionLine, readVersion, updateLine, gateListening, gateData,
} from '../settings-pages.js';

const g = /** @type {any} */ (globalThis);
const PRIVACY_URL = 'https://votreader.github.io/app/privacy.html';

/**
 * One of main's choices as a sheet (a centred dialog on the laptop): tap a row to pick it.
 * @param {{ title: string, options: Array<{ id: string, label: string, s?: string }>, value: string, desktop: boolean,
 *   onPick: (id: string) => void, onClose: () => void }} props
 */
function ChoiceSheet({ title, options, value, desktop, onPick, onClose }) {
  return (
    <Sheet kind="pick" label={title} onClose={onClose} desktop={desktop}>
      <div className="sh">{title}</div>
      <div className="opts">
        {options.map((o) => {
          const on = o.id === value;
          return (
            <button key={o.id} type="button" className={'srow opt' + (on ? ' on' : '')} aria-pressed={on} onClick={() => onPick(o.id)}>
              <span className="tx"><span className="t">{o.label}</span>{o.s ? <span className="s">{o.s}</span> : null}</span>
              {on && <span className="ck"><Icon name="check" /></span>}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

/** A row that opens something: title, what it holds, a chevron. */
function OpenRow({ t, s, onOpen }) {
  return (
    <button type="button" className="srow" onClick={onOpen}>
      <span className="tx"><span className="t">{t}</span><span className="s">{s}</span></span>
      <span className="chev"><Icon name="chev" /></span>
    </button>
  );
}

/** A row with a switch: the whole row flips it. */
function SwitchRow({ t, s, on, onFlip }) {
  return (
    <button type="button" className="srow" role="switch" aria-checked={on} onClick={onFlip}>
      <span className="tx"><span className="t">{t}</span><span className="s">{s}</span></span>
      <span className={'switch' + (on ? ' on' : '')} />
    </button>
  );
}

/** @param {import('../places.js').PlaceProps} props */
export function ListeningPage({ gate, desktop, onReady }) {
  const [f, setF] = React.useState(() => (gate ? (gate.facts && gate.facts.listening) || gateListening() : liveListening()));
  const [open, setOpen] = React.useState(/** @type {null | 'reader' | 'bible' | 'speed'} */ (null));
  React.useEffect(() => { onReady(); }, [onReady]);

  /** Main's key changed here and on the page (never on a gate boot). @param {string} key @param {any} val */
  const set = (key, val) => {
    if (gate) return;
    if (writeSetting(key, val)) setF(liveListening());
  };
  const pick = (id) => {
    const what = open;
    setOpen(null);
    if (gate) return;
    if (what === 'speed') { if (writeRate(Number(id))) setF(liveListening()); } else set(what === 'reader' ? 'letterReader' : 'bibleAudio', id);
  };
  const sheets = {
    reader: { title: 'Favourite reader', options: READERS, value: f.reader },
    bible: { title: 'Bible audio', options: editionOptions(), value: f.bibleAudio },
    speed: { title: 'Starting speed', options: rateOptions(f.rate), value: String(f.rate) },
  };
  const sheet = open ? sheets[open] : null;
  const sw = (x) => (
    <SwitchRow key={x.key} t={x.t} s={x.s} on={f[x.key]} onFlip={() => set(x.key, !f[x.key])} />
  );
  return (
    <>
      <div className="page-head g"><h1 className="display">Listening</h1></div>
      <div className="g settings">
        <span className="label">Who reads</span>
        <OpenRow t="Favourite reader" s={readerLine(f.reader)} onOpen={() => setOpen('reader')} />
        <OpenRow t="Bible audio" s={editionLine(f.bibleAudio)} onOpen={() => setOpen('bible')} />
        <OpenRow t="Starting speed" s={rateLabel(f.rate)} onOpen={() => setOpen('speed')} />
        <span className="label">While it plays</span>
        {PLAY_SWITCHES.filter((x) => !x.needs || f[x.needs]).map(sw)}
        <span className="label">Songs</span>
        {sw(SONG_SWITCH)}
      </div>
      {sheet && <ChoiceSheet {...sheet} desktop={desktop} onPick={pick} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * Main's backup flow bound to this page: busy while one runs, its overwrite question as a sheet, its file check's answer
 * under the row. Built once; each handler reads the page's state when it runs (backup-flow.js's contract).
 */
function useBackup() {
  const [busy, setBusy] = React.useState(false);
  const [report, setReport] = React.useState(/** @type {null | { message: string, level: 'ok' | 'warn' }} */ (null));
  const [ask, setAsk] = React.useState(/** @type {null | { message: string }} */ (null));
  const answer = React.useRef(/** @type {null | ((yes: boolean) => void)} */ (null));
  const busyRef = React.useRef(false);
  const reloadPendingRef = React.useRef(false);
  const reloadTimerRef = React.useRef(0);
  const flow = React.useMemo(() => createBackupFlow({
    busyRef, reloadPendingRef, reloadTimerRef, setBusy, setVerifyReport: setReport, diagnosticLog: [],
    confirmImport: (message) => new Promise((resolve) => { answer.current = resolve; setAsk({ message }); }),
  }), []);
  // A sheet left open when the page goes still answers: an import never waits on a page that is gone.
  React.useEffect(() => () => { if (answer.current) answer.current(false); }, []);
  const settle = (yes) => { const a = answer.current; answer.current = null; setAsk(null); if (a) a(yes); };
  return { flow, busy, report, setReport, ask, settle };
}

/** @param {import('../places.js').PlaceProps} props */
export function YourDataPage({ gate, device, desktop, onReady }) {
  const [f, setF] = React.useState(() => (gate ? (gate.facts && gate.facts.data) || gateData(GATE_NOW) : liveData()));
  const [wipe, setWipe] = React.useState(/** @type {null | string} */ (null));
  const b = useBackup();
  React.useEffect(() => { onReady(); }, [onReady]);

  const run = (op, locked = true) => {
    if (gate || b.busy) return;
    const fl = b.flow;
    Promise.resolve(locked ? fl._runLockedBackupOperation(op) : fl._runBackupOperation(op)).then(() => setF(liveData()), () => setF(liveData()));
  };
  const weekly = () => {
    if (gate || !g.DataSafety || typeof g.DataSafety.setWeeklyOn !== 'function') return;
    Promise.resolve(g.DataSafety.setWeeklyOn(!f.weekly)).then(() => setF(liveData()), () => setF(liveData()));
  };
  const card = safeCard(f, device);
  const wipeOk = (wipe || '').trim().toUpperCase() === 'DELETE';
  return (
    <>
      <div className="page-head g">
        <h1 className="display">Your data</h1>
        <p className="lede">Your notes, journal and highlights stay on {here(device)}.</p>
      </div>
      <div className="g">
        <div className="safe">
          <span className="si"><Icon name="shield" /></span>
          <div className="tx"><div className="t">{card.t}</div><div className="s">{card.s}</div></div>
        </div>
        <div className="stack">
          <button type="button" className="pill block" disabled={b.busy} onClick={() => run(b.flow.exportPersonalData)}>
            <span>Export a backup</span><Icon name="fileOut" />
          </button>
          <button type="button" className="btn2 block" disabled={b.busy} onClick={() => run(b.flow.importPersonalData, false)}>
            <Icon name="fileIn" />Import a backup
          </button>
        </div>
        <p className="fine">Export saves one file to Downloads. Import asks before it replaces anything.</p>
        <div className="settings">
          {f.weekly !== null && <SwitchRow t="Weekly copy" s={weeklyLine(f.weekly)} on={!!f.weekly} onFlip={weekly} />}
          <OpenRow t="Check a backup file" s="Without importing it" onOpen={() => { if (!gate) b.setReport(null); run(b.flow.verifyBackupFile); }} />
        </div>
        {b.report && (
          <div className={'report ' + b.report.level} role="status">
            <p className="fine">{b.report.message}</p>
            <button type="button" className="textbtn sm" onClick={() => b.setReport(null)}>Dismiss</button>
          </div>
        )}
        <button type="button" className="textbtn danger-t" disabled={b.busy} onClick={() => { if (!gate) setWipe(''); }}>Clear all personal data…</button>
      </div>
      {b.ask && (
        // the scrim, Escape and Back keep what is there (the safe answer)
        <Sheet kind="ask" label="Import a backup" onClose={() => b.settle(false)} desktop={desktop}>
          <div className="sh">Import a backup</div>
          <p className="fine">{b.ask.message}</p>
          <div className="stack">
            <button type="button" className="pill block danger" onClick={() => b.settle(true)}><span>Import and replace</span></button>
            <button type="button" className="btn2 block" onClick={() => b.settle(false)}>Keep what I have</button>
          </div>
        </Sheet>
      )}
      {wipe !== null && (
        <Sheet kind="ask" label="Clear all personal data" onClose={() => setWipe(null)} desktop={desktop}>
          <div className="sh">Clear all personal data</div>
          <p className="fine">Every note, highlight, bookmark, journal entry, link and setting on {here(device)} is deleted, and
            the saved recordings with them. Export a backup first if you may want them back. Type DELETE to confirm.</p>
          <input className="wipe" type="text" value={wipe} aria-label="Type DELETE to confirm" autoComplete="off"
            autoCapitalize="characters" spellCheck={false} onChange={(e) => setWipe(e.currentTarget.value)} />
          <div className="stack">
            <button type="button" className="pill block danger" disabled={!wipeOk || b.busy}
              onClick={() => { setWipe(null); run(b.flow.clearAllPersonalData); }}><span>Delete everything</span></button>
            <button type="button" className="btn2 block" onClick={() => setWipe(null)}>Keep my data</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** @param {import('../places.js').PlaceProps} props */
export function HelpPage({ gate, device, go, onReady }) {
  const [ver, setVer] = React.useState(/** @type {string | null | undefined} */ (undefined));
  React.useEffect(() => {
    let live = true;
    Promise.resolve(readVersion()).then((v) => { if (live) setVer(versionLine(v)); }, () => { if (live) setVer(null); });
    return () => { live = false; };
  }, []);
  // ready once the version line has its words (or has none to show)
  React.useEffect(() => { if (ver !== undefined) onReady(); }, [ver, onReady]);
  const open = (url) => { if (!gate && typeof g.open === 'function') g.open(url, '_blank', 'noopener,noreferrer'); };
  return (
    <>
      <div className="page-head g">
        <h1 className="display long">Help and about</h1>
        <p className="lede">The Volumes of Truth are the Word of The Lord, given through His servant Timothy.</p>
      </div>
      <div className="g settings">
        <OpenRow t="Show me around" s="A short tour that points at the real buttons" onOpen={() => go({ place: 'welcome' })} />
        <OpenRow t="Privacy" s={'Nothing you write leaves ' + here(device)} onOpen={() => open(PRIVACY_URL)} />
        <OpenRow t="Credits" s="OpenBible.info, and the songs of the flock" onOpen={() => go({ place: 'settings/credits' })} />
      </div>
      <p className="fine g">This reader was made by a disciple for personal study; it is not the canonical source.</p>
      <div className="ver g num">
        <span className="label">Version</span>
        <div>{ver || (ver === null ? 'Not known on ' + here(device) : '…')}</div>
        <div className="s">{updateLine()}</div>
      </div>
    </>
  );
}

/** @param {import('../places.js').PlaceProps} props */
function CreditsPage({ onReady }) {
  React.useEffect(() => { onReady(); }, [onReady]);
  return (
    <>
      <div className="page-head g"><h1 className="display">Credits</h1></div>
      <div className="g credits">
        <p>Cross-reference data from <a href="https://www.openbible.info/labs/cross-references/" target="_blank" rel="noopener noreferrer">OpenBible.info</a>, used under CC-BY.</p>
        <p>AI Songs of the Letters: songs made by members of the flock with Suno (suno.com), from the words of The Volumes of Truth. Shared freely, never sold.</p>
        <p>For the canonical text, audio, video and PDFs, visit <a href="https://www.thevolumesoftruth.com" target="_blank" rel="noopener noreferrer">thevolumesoftruth.com</a>.</p>
      </div>
    </>
  );
}

definePlace('settings/listening', { Screen: ListeningPage, title: () => 'Listening' });
definePlace('settings/your-data', { Screen: YourDataPage, title: () => 'Your data' });
definePlace('settings/help', { Screen: HelpPage, title: () => 'Help and about' });
definePlace('settings/credits', { Screen: CreditsPage, title: () => 'Credits' });
