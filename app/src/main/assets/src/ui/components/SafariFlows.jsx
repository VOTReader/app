/* ═══════════════════════════════════════════════════════════════════════
   SafariFlows — W2.7e Safari-specific storage modals
   ═══════════════════════════════════════════════════════════════════════
   Two components:
   1. Safari7DayModal — fires once per session on first data-creating
      gesture in Safari tabs. Warns about 7-day eviction.
   2. IosPwaWelcomeCard — shows on boot in iOS PWA with empty storage.
      Guides user to import data from Safari.
   ═══════════════════════════════════════════════════════════════════════ */

export function Safari7DayModal() {
  React.useSyncExternalStore(StorageHealth.subscribe, StorageHealth.getVersion);
  var report = StorageHealth.getReport();

  var visible = report.safariGateBlocked && !StorageHealth.isDismissed('safari-7day');
  var trapRef = useFocusTrap(visible);

  useModalRegistry({ id: 'safari-7day-modal', dismiss: _dismiss, active: visible });

  function _dismiss() {
    StorageHealth.dismissScenario('safari-7day');
  }

  var [showInstructions, setShowInstructions] = React.useState(false);

  if (!visible) return null;

  // iPadOS Safari reports navigator.platform 'MacIntel' too (sweep v065); a touch screen is what
  // tells it apart (a Mac reports 0 touch points), as InstallCard's touchMac does.
  var isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || '')
    && !((navigator.maxTouchPoints || 0) > 1);

  return (
    <div className="sh-modal-backdrop">
      <div className="sh-modal" ref={trapRef} role="dialog" aria-modal="true" aria-label="Safari storage warning">
        <h3 className="sh-modal-title">Before you start saving</h3>
        <p className="sh-modal-text">
          {"Safari may delete your saved notes and highlights if you don't visit for 7 days. "}
          {"To keep your data safe, add VOTReader to your Home Screen."}
        </p>
        {showInstructions && (
          <div className="sh-modal-instructions">
            {isMac
              ? <p className="sh-modal-text">In Safari: <strong>File</strong> {'>'} <strong>Add to Dock</strong></p>
              : <p className="sh-modal-text">Tap the <strong>Share</strong> button {'>'} <strong>Add to Home Screen</strong></p>
            }
          </div>
        )}
        <div className="sh-modal-actions">
          {!showInstructions && (
            <button className="sh-modal-btn sh-modal-btn-primary" onClick={() => setShowInstructions(true)}>
              How to add to Home Screen
            </button>
          )}
          <button className="sh-modal-btn sh-modal-btn-secondary" onClick={_dismiss}>
            I understand the risk
          </button>
        </div>
      </div>
    </div>
  );
}

/** Its own localStorage key (a vot-* key, so Clear All wipes it and no backup carries it). */
var WELCOMED_KEY = 'vot-ios-pwa-welcomed';

/** True when the card was answered before - or when storage throws, since then a skip could
 *  never be remembered and the card would come back on every launch. */
function _alreadyWelcomed() {
  try { return !!localStorage.getItem(WELCOMED_KEY); } catch (_e) { return true; }
}

function _rememberWelcomed() {
  try { localStorage.setItem(WELCOMED_KEY, '1'); } catch (_e) { /* no storage: the session state hides it */ }
}

/**
 * Full-screen welcome card for iOS PWA with empty storage.
 * Shows once — gated by its own localStorage key, WELCOMED_KEY.
 *
 * W13 (sweep 2026-10-13): it was gated on StateStore.get('ios-pwa-welcomed'),
 * but StateStore.get() takes no key and returns the whole vot-state (always
 * truthy), so the card never showed; and StateStore.set('ios-pwa-welcomed',
 * true) replaces the whole vot-state, so fixing only the guard would have
 * turned the reader's tabs, settings and read marks into a string.
 *
 * @param {{ onNavigateSettings: () => void }} props
 */
export function IosPwaWelcomeCard({ onNavigateSettings }) {
  var platform = (typeof StorageHealth !== 'undefined') ? StorageHealth.getPlatform() : 'unknown';
  var [dismissed, setDismissed] = React.useState(false);

  var isIosPwa = platform === 'safari-pwa';
  var visible = isIosPwa && !dismissed && !_alreadyWelcomed() && _knownEmpty();
  var trapRef = useFocusTrap(visible);

  useModalRegistry({ id: 'ios-pwa-welcome', dismiss: _skip, active: visible });

  function _skip() {
    _rememberWelcomed();
    setDismissed(true);
  }

  function _goImport() {
    _skip();
    onNavigateSettings();
  }

  if (!visible) return null;

  return (
    <div className="sh-modal-backdrop sh-welcome-card">
      <div className="sh-modal" ref={trapRef} role="dialog" aria-modal="true" aria-label="Welcome to VOTReader">
        <h3 className="sh-modal-title">Welcome to VOTReader!</h3>
        <p className="sh-modal-text">
          {"If you've been using VOTReader in Safari, your saved data "}
          {"didn't transfer automatically. To bring your data over:"}
        </p>
        <ol className="sh-modal-steps">
          <li>Open VOTReader in Safari (not this app)</li>
          <li>Go to Settings {'>'} Export</li>
          <li>Come back here {'>'} Settings {'>'} Import</li>
        </ol>
        <div className="sh-modal-actions">
          <button className="sh-modal-btn sh-modal-btn-primary" onClick={_goImport}>
            {"I'll import my data"}
          </button>
          <button className="sh-modal-btn sh-modal-btn-secondary" onClick={_skip}>
            {"I'm new — skip this"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * True only when every data store has really loaded and holds nothing. A store
 * that is still pending or degraded reads as its empty default, which says
 * nothing about the reader's data, so the card waits (HydrationGate remounts
 * the app when a late store loads, and this runs again). A missing store is
 * unknown, not empty. (W13: this used to call a getAll() no store has.)
 */
function _knownEmpty() {
  var stores = [
    typeof AnnotationStore !== 'undefined' ? AnnotationStore : null,
    typeof BookmarkStore !== 'undefined' ? BookmarkStore : null,
    typeof JournalStore !== 'undefined' ? JournalStore : null,
    typeof NoteStore !== 'undefined' ? NoteStore : null,
  ];
  for (var s of stores) {
    if (!s || typeof s.raw !== 'function') return false;
    if (typeof s.isReady === 'function' && !s.isReady()) return false;
    if (_hasEntries(s.raw())) return false;
  }
  return true;
}

/**
 * Does a store's snapshot hold anything? Each shape the data stores use:
 * an array (bookmarks), `{ list: [] }` (journal), or a map whose values are
 * arrays (annotations per verse key) or records (notes).
 * @param {any} v
 * @returns {boolean}
 */
function _hasEntries(v) {
  if (!v || typeof v !== 'object') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (Array.isArray(v.list)) return v.list.length > 0;
  return Object.keys(v).some(function (k) {
    var x = v[k];
    return Array.isArray(x) ? x.length > 0 : x != null;
  });
}
