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

  useModalRegistry({ id: 'safari-7day-modal', dismiss: _dismiss, active: visible });

  function _dismiss() {
    StorageHealth.dismissScenario('safari-7day');
  }

  var [showInstructions, setShowInstructions] = React.useState(false);

  if (!visible) return null;

  var isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || '');

  return (
    <div className="sh-modal-backdrop" role="dialog" aria-modal="true" aria-label="Safari storage warning">
      <div className="sh-modal">
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

/**
 * Full-screen welcome card for iOS PWA with empty storage.
 * Shows once — gated by StateStore meta flag 'ios-pwa-welcomed'.
 *
 * @param {{ onNavigateSettings: () => void }} props
 */
export function IosPwaWelcomeCard({ onNavigateSettings }) {
  var platform = (typeof StorageHealth !== 'undefined') ? StorageHealth.getPlatform() : 'unknown';
  var [dismissed, setDismissed] = React.useState(false);

  var isIosPwa = platform === 'safari-pwa';
  var hasData = _hasAnyUserData();
  var flagKey = 'ios-pwa-welcomed';
  var alreadyWelcomed = (typeof StateStore !== 'undefined') && StateStore.get(flagKey);

  var visible = isIosPwa && !hasData && !alreadyWelcomed && !dismissed;

  useModalRegistry({ id: 'ios-pwa-welcome', dismiss: _skip, active: visible });

  function _skip() {
    if (typeof StateStore !== 'undefined') StateStore.set(flagKey, true);
    setDismissed(true);
  }

  function _goImport() {
    _skip();
    onNavigateSettings();
  }

  if (!visible) return null;

  return (
    <div className="sh-modal-backdrop sh-welcome-card" role="dialog" aria-modal="true" aria-label="Welcome to VOTReader">
      <div className="sh-modal">
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

function _hasAnyUserData() {
  var stores = [
    typeof AnnotationStore !== 'undefined' && AnnotationStore,
    typeof BookmarkStore !== 'undefined' && BookmarkStore,
    typeof JournalStore !== 'undefined' && JournalStore,
    typeof NoteStore !== 'undefined' && NoteStore,
  ];
  for (var s of stores) {
    if (s && typeof s.getAll === 'function') {
      var data = s.getAll();
      if (data && Object.keys(data).length > 0) return true;
    }
  }
  return false;
}
