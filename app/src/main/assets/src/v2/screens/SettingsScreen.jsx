/* SettingsScreen - v2 Settings: six pages, each row saying what it holds (picture 4a-settings, kit .settings.cats). */
import { Icon } from '../Icon.jsx';
import { settingsRows } from '../settings-facts.js';

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
