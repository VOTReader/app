/* ═══════════════════════════════════════════════════════════════════════
   WhatsNewSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   up1 (Corbin 2026-10-23): the plain list behind "Updated · What's new".
   Opened by the update toast (utils/update-toast.js) with what this release
   changed, and by Settings > Your Data's "What's new" row with the newest
   changes; both through the window event OPEN_EVENT (utils/whats-new.js),
   so bundle-b never imports this. Mounted once in AppShellSheets. The look is
   the footnote sheet's: the same sheet, handle and gold heading. */

import { inertAttr } from '../../utils/inert-attr.js';
import { OPEN_EVENT, byDay } from '../../utils/whats-new.js';
import { EmptyState, ListRow } from './UiParts.jsx';
import { LinkRow, tourLength, VersionKicker } from './about-parts.jsx';

export function WhatsNewSheet() {
  const [items, setItems] = React.useState(/** @type {{ t: number, text: string }[] | null} */ (null));
  const isOpen = items != null;
  const rail = useRailMode();
  const trapRef = useFocusTrap(isOpen, { modal: !rail });
  React.useEffect(() => {
    const open = (/** @type {any} */ e) => setItems(Array.isArray(e && e.detail && e.detail.items) ? e.detail.items : []);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);
  const close = () => setItems(null);
  // WS3 settings (ab-new): Back and Escape close the sheet first, not the screen under it (the modal-registry global).
  useModalRegistry({ id: 'whats-new-sheet', dismiss: close, active: isOpen });
  if (!isOpen) return null;   // nothing in the page until it is asked for
  const days = byDay(items);
  return ReactDOM.createPortal(
    <>
      {!rail && <div className={`fn-sheet-backdrop${isOpen ? ' open' : ''}`} aria-hidden="true" onClick={isOpen ? close : undefined} />}
      <div className={`fn-sheet whats-new-sheet${isOpen ? ' open' : ''}${rail ? ' rail' : ''}`} ref={trapRef} role="dialog"
        aria-modal={!rail && isOpen ? 'true' : undefined} aria-hidden={!isOpen} {...inertAttr(!isOpen)} aria-label="What's new">
        <SheetHandle onClose={close} />
        <div className="ui-sheet-head ws3-new-head"><div className="ws3-new-heading"><VersionKicker /><h2 className="ui-sheet-title">What&rsquo;s new</h2></div></div>
        {/* WS3 settings (ab-new): an empty list still leads somewhere. */}
        {!days.length && (
          <div className="ws3-new-empty">
            <EmptyState icon="spark" title="Nothing new to tell yet." text="When an update changes something you will notice, it is listed here, newest first." />
            <div className="ui-group is-inset">
              {typeof TourController !== 'undefined' ? (
                <ListRow icon="help" title="Show me around" meta={tourLength()} onClick={() => { close(); TourController.start('settings'); }} />
              ) : null}
              <LinkRow href="https://www.thevolumesoftruth.com" icon="out" title="thevolumesoftruth.com" meta="The canonical text, audio, video and PDFs" />
            </div>
          </div>
        )}
        {days.map((d) => (
          <section key={d.day} className="whats-new-day-group">
            <h3 className="whats-new-day">{d.day}</h3>
            <ul className="whats-new-list">
              {d.items.map((i) => <li key={i.t + ':' + i.text}>{i.text}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </>,
    document.body
  );
}
