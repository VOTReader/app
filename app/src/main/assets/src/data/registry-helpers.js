function colLetters(col)  { return col && typeof window[col.globalName] !== 'undefined' ? window[col.globalName] : null; }
function colPreface(col)  { return col && col.prefaceGlobal && typeof window[col.prefaceGlobal] !== 'undefined' ? window[col.prefaceGlobal] : null; }
function colLetterArr(col) { if (!col) return []; const arr = colLetters(col); return Array.isArray(arr) ? arr : []; }

function getColReadNavProps(volKey, clearSurprise, letterId, markRead, unmarkRead, isRead, setSurpriseAnchor, setLetterId, setActiveReadKey, setLastReadForVol, goColIdx) {
  var col = COL_BY_KEY.get(volKey);
  var rk = col.readKey;
  return {
    onMarkRead: () => markRead(rk, letterId),
    onUnmark: () => unmarkRead(rk, letterId),
    isRead: (id) => isRead(rk, id),
    onNavigate: (id) => { if (clearSurprise) setSurpriseAnchor(null); setLetterId(id); setActiveReadKey("vol:" + volKey, () => setLastReadForVol(volKey, id)); },
    onHome: () => goColIdx(volKey),
    collectionScriptures: col.normalized ? col.normalized.sharedScriptures : undefined
  };
}

function getColIdxProps(volKey, setLetterId, setActiveReadKey, setLastReadForVol, setScreen, settings, lastReadLetterMap, isRead) {
  var col = COL_BY_KEY.get(volKey);
  var nav = (id) => { setLetterId(id); setActiveReadKey("vol:" + volKey, () => setLastReadForVol(volKey, id)); setScreen(col.letterScreen); };
  return {
    onSelect: nav,
    onSelectPreface: col.prefaceGlobal ? nav : undefined,
    currentLetter: settings.showReadingDot && activeReadKey === ("vol:" + volKey) ? lastReadLetterMap[volKey] || null : null,
    isRead: (id) => isRead(col.readKey, id),
    markAsReadEnabled: settings.markAsRead
  };
}
