/* ReadingPages - Settings > Reading and its Bible translation page (mw7, v2-gaps 14; pictures 7d-reading, 7e-translation).

   Reading re-shows main's Reading settings in design's five groups (The Bible, On the page, Your reading record, Copy and
   share, Search): a switch flips main's key, a choice opens a sheet of main's options (or, for the translation, its own
   page), and Clear asks first in main's confirm strip. Auto-scroll's speed and pause rows appear only while it is on
   (main collapses them). Bible translation lists main's eleven, English then Español; a pick saves it and goes Back.
   A gate boot shows states.json's facts and every control is inert. */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { writeSetting } from '../settings-pages.js';
import {
  READING_SWITCHES, SHARE_OPTIONS, translationGroups, translationLine, AI_NOTE, lpmLabel, dwellLabel, lpmOptions,
  dwellOptions, liveReading, gateReading, clearHistory, historyCount, placesLine,
} from '../reading-settings.js';
import { ChoiceSheet, OpenRow, SwitchRow } from './SettingsPages.jsx';

/** @param {import('../places.js').PlaceProps} props */
export function ReadingPage({ gate, desktop, go, onReady }) {
  const [f, setF] = React.useState(() => (gate ? (gate.facts && gate.facts.reading) || gateReading() : liveReading()));
  const [open, setOpen] = React.useState(/** @type {null | 'share' | 'lpm' | 'dwell'} */ (null));
  const [asking, setAsking] = React.useState(false);
  React.useEffect(() => { onReady(); }, [onReady]);

  /** Main's key changed here and on the page (never on a gate boot). @param {string} key @param {any} val */
  const set = (key, val) => {
    if (gate) return;
    if (writeSetting(key, val)) setF(liveReading());
  };
  const sheets = {
    share: { title: 'Share includes', key: 'shareLink', options: SHARE_OPTIONS, value: f.shareLink },
    lpm: { title: 'Scroll speed', key: 'autoScrollLpm', options: lpmOptions(f.lpm), value: String(f.lpm) },
    dwell: { title: 'Pause before the next page', key: 'autoScrollEndMs', options: dwellOptions(f.endMs), value: String(f.endMs) },
  };
  const sheet = open ? sheets[open] : null;
  const sw = (x) => <SwitchRow key={x.key} t={x.t} s={x.s} on={f.switches[x.key]} onFlip={() => set(x.key, !f.switches[x.key])} />;
  const share = SHARE_OPTIONS.find((o) => o.id === f.shareLink) || SHARE_OPTIONS[0];
  const clear = () => {
    setAsking(false);
    if (gate) return;
    clearHistory();
    setF({ ...liveReading(), history: historyCount() });
  };
  return (
    <>
      <div className="page-head g"><h1 className="display">Reading</h1></div>
      <div className="g settings">
        <span className="label">The Bible</span>
        <OpenRow t="Bible translation" s={translationLine(f.translation)} onOpen={() => go({ place: 'settings/translation' })} />
        {READING_SWITCHES.bible.map(sw)}
        <span className="label">On the page</span>
        {READING_SWITCHES.page.map(sw)}
        {f.switches.autoScroll && (
          <>
            <OpenRow t="Scroll speed" s={lpmLabel(f.lpm)} onOpen={() => setOpen('lpm')} />
            <SwitchRow t="Auto-continue" s="At the end, count down and turn to the next page" on={f.autoNext}
              onFlip={() => set('autoScrollNext', !f.autoNext)} />
            {f.autoNext && <OpenRow t="Pause before the next page" s={dwellLabel(f.endMs)} onOpen={() => setOpen('dwell')} />}
          </>
        )}
        <span className="label">Your reading record</span>
        {READING_SWITCHES.record.map(sw)}
        <div className="srow">
          {/* a div row: the shell stacks .t over .s only inside buttons (shell.css), so its words are divs, as 7d draws */}
          <div className="tx"><div className="t">Clear reading history</div><div className="s">{placesLine(f.history)}</div></div>
          {!asking && (
            <button type="button" className="btn2 sm" disabled={!gate && !f.history} onClick={() => { if (!gate) setAsking(true); }}>Clear</button>
          )}
        </div>
        {asking && (
          <div className="cfs" role="group" aria-label="Clear reading history">
            <p className="fine">Clear all reading history?</p>
            <div className="cfb">
              <button type="button" className="btn2 sm" onClick={() => setAsking(false)}>Cancel</button>
              <button type="button" className="pill sm" onClick={clear}>Yes, clear</button>
            </div>
          </div>
        )}
        <span className="label">Copy and share</span>
        <OpenRow t="Share includes" s={share.line} onOpen={() => setOpen('share')} />
        {READING_SWITCHES.share.map(sw)}
        <span className="label">Search</span>
        {READING_SWITCHES.search.map(sw)}
      </div>
      {sheet && (
        <ChoiceSheet title={sheet.title} options={sheet.options} value={sheet.value} desktop={desktop}
          onPick={(id) => { setOpen(null); set(sheet.key, id); }} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

/** @param {import('../places.js').PlaceProps} props */
export function TranslationPage({ gate, facts, pop, onReady }) {
  const [value] = React.useState(() => (gate ? (gate.facts && gate.facts.translation) || 'nkjv' : (facts && facts.translation) || 'nkjv'));
  React.useEffect(() => { onReady(); }, [onReady]);
  const pick = (id) => {
    if (gate) return;
    if (id !== value) writeSetting('translation', id);
    pop();
  };
  return (
    <>
      <div className="page-head g">
        <h1 className="display">Bible translation</h1>
        <p className="lede">The verse text of the Bible. Headings stay in place in every translation; the Matthew Study Bible keeps its own text.</p>
      </div>
      {translationGroups().map((grp) => (
        <React.Fragment key={grp.label}>
          <div className="g trn"><span className="label">{grp.label}</span></div>
          <div className="opts trn" role="radiogroup" aria-label={grp.label + ' translations'}>
            {grp.rows.map((r) => {
              const on = r.id === value;
              return (
                <button key={r.id} type="button" role="radio" aria-checked={on} className={'srow opt gt' + (on ? ' on' : '')}
                  onClick={() => pick(r.id)}>
                  <span className="tx">
                    <span className="t">{r.name}<span className="sz num">{r.code}</span></span>
                    {r.s ? <span className="s">{r.s}</span> : null}
                  </span>
                  {on && <span className="ck"><Icon name="check" /></span>}
                </button>
              );
            })}
          </div>
        </React.Fragment>
      ))}
      <p className="fine g trf">{AI_NOTE}</p>
    </>
  );
}

definePlace('settings/reading', { Screen: ReadingPage, title: () => 'Reading' });
definePlace('settings/translation', { Screen: TranslationPage, title: () => 'Bible translation' });
