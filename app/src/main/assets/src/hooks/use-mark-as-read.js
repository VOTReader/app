function useMarkAsRead(enabled, onMarkRead) {
  useEffect(() => {
    if (!enabled) return;
    window.__onReadingComplete = onMarkRead;
    return () => {window.__onReadingComplete = null;};
  }, [enabled, onMarkRead]);
}
