/* SettingsScreen - v2 Settings: six pages, each row saying what it holds (picture 4a-settings, kit .settings.cats). */
import { Icon } from '../Icon.jsx';
import { settingsRows, downloadFacts } from '../settings-facts.js';
import { definePlace } from '../places.js';

/** Each row's page (states.json place names; builder B registers them). */
export const SETTINGS_PAGES = {
  text: 'settings/text', reading: 'settings/reading', listening: 'settings/listening',
  downloads: 'settings/downloads', data: 'settings/your-data', help: 'settings/help',
};

/**
 * @param {{ facts: import('../settings-facts.js').SettingsFacts, device: 'phone' | 'computer',
 *   onOpen?: (id: string) => void, onReady?: () => void }} props
 */
export function SettingsScreen({ facts, device, onOpen, onReady }) {
  React.useEffect(() => { if (onReady) onReady(); }, [onReady]);
  const rows = settingsRows(facts, { device });
  return (
    <>
      <div className="page-head g"><h1 className="display">Settings</h1></div>
      <div className="g settings cats">
        {rows.map((r) => (
          <button key={r.id} type="button" className="srow" onClick={() => onOpen && onOpen(r.id)}>
            <span className="tx"><span className="t">{r.title}</span><span className="s">{r.sub}</span></span>
            <span className="chev"><Icon name="chev" /></span>
          </button>
        ))}
      </div>
    </>
  );
}

const NO_SUB = () => () => {};
const ZERO = () => 0;

/** The facts with the Downloads row's read live from main's OfflineAudio on a real boot, again each time the store
 *  changes (v2lis, v2-gaps 15); a gate boot keeps its picture's. */
function useDownloads(facts, gate) {
  const off = gate ? null : /** @type {any} */ (globalThis).OfflineAudio;
  const live = !!(off && typeof off.subscribe === 'function' && typeof off.getVersion === 'function');
  React.useSyncExternalStore(live ? off.subscribe : NO_SUB, live ? off.getVersion : ZERO);
  return live ? { ...facts, downloads: downloadFacts() } : facts;
}

/** The settings place: a row opens its page. */
export function SettingsPlace({ facts, device, gate, go, onReady }) {
  const shown = useDownloads(facts, gate);
  return <SettingsScreen facts={shown} device={device} onReady={onReady} onOpen={(id) => go({ place: SETTINGS_PAGES[id] })} />;
}

definePlace('settings', { Screen: SettingsPlace, title: () => 'Settings' });
