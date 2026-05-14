function useDwellTimer(settings, setActiveReadKeyRaw) {
  const dwellTimerRef = React.useRef(null);
  const dwellAccRef = React.useRef(0);
  const dwellStartRef = React.useRef(null);
  const dwellKeyRef = React.useRef(null);
  const pendingReadCommitRef = React.useRef(null);

  const DWELL_MS = () => settings.dwellMs ? Number(settings.dwellMs) : 20000;

  const commitDwellNow = React.useCallback(() => {
    if (!dwellKeyRef.current) return;
    if (dwellTimerRef.current) {clearTimeout(dwellTimerRef.current);dwellTimerRef.current = null;}
    if (pendingReadCommitRef.current) {pendingReadCommitRef.current();pendingReadCommitRef.current = null;}
    setActiveReadKeyRaw(dwellKeyRef.current);
    dwellAccRef.current = 0;dwellStartRef.current = null;dwellKeyRef.current = null;
  }, [setActiveReadKeyRaw]);

  const cancelDwell = React.useCallback(() => {
    if (dwellTimerRef.current) {clearTimeout(dwellTimerRef.current);dwellTimerRef.current = null;}
    dwellAccRef.current = 0;dwellStartRef.current = null;dwellKeyRef.current = null;
    pendingReadCommitRef.current = null;
  }, []);

  const scheduleDwell = React.useCallback(() => {
    if (!dwellKeyRef.current || dwellTimerRef.current) return;
    const remaining = DWELL_MS() - dwellAccRef.current;
    dwellStartRef.current = Date.now();
    dwellTimerRef.current = setTimeout(() => {
      if (pendingReadCommitRef.current) {pendingReadCommitRef.current();pendingReadCommitRef.current = null;}
      setActiveReadKeyRaw(dwellKeyRef.current);
      dwellTimerRef.current = null;dwellAccRef.current = 0;
      dwellStartRef.current = null;dwellKeyRef.current = null;
    }, remaining);
  }, [settings.dwellMs, setActiveReadKeyRaw]);

  const pauseDwell = React.useCallback(() => {
    if (!dwellTimerRef.current || !dwellStartRef.current) return;
    clearTimeout(dwellTimerRef.current);dwellTimerRef.current = null;
    dwellAccRef.current += Date.now() - dwellStartRef.current;
    dwellStartRef.current = null;
  }, []);

  const setActiveReadKey = React.useCallback((key, commitFn) => {
    cancelDwell();
    dwellKeyRef.current = key;
    pendingReadCommitRef.current = commitFn || null;
    if (document.visibilityState === 'visible') scheduleDwell();
  }, [cancelDwell, scheduleDwell]);

  return { commitDwellNow, cancelDwell, scheduleDwell, pauseDwell, setActiveReadKey };
}
