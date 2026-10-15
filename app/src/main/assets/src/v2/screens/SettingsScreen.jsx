/* SettingsScreen - v2 Settings: six pages, each row saying what it holds (picture 4a-settings, kit .settings.cats). */
import { Icon } from '../Icon.jsx';
import { settingsRows } from '../settings-facts.js';
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

/** The settings place: a row opens its page. */
function SettingsPlace({ facts, device, go, onReady }) {
  return <SettingsScreen facts={facts} device={device} onReady={onReady} onOpen={(id) => go({ place: SETTINGS_PAGES[id] })} />;
}

definePlace('settings', { Screen: SettingsPlace, title: () => 'Settings' });
