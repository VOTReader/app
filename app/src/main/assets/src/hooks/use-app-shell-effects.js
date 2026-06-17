/* ═══════════════════════════════════════════════════════════════════════
   useAppShellEffects — AppShell-level effects (P7k)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS:
     - isOnline state (navigator.onLine + live events, zero egress U21)

   DOES NOT OWN:
     - theme state — App-local useState.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @returns {{ isOnline: boolean }}
 */
export function useAppShellEffects() {
  // Online status from navigator.onLine + the online/offline events (U21).
  // Was a no-cors fetch of thevolumesoftruth.com/favicon.ico — an EXTERNAL
  // egress that contradicted the self-contained/offline policy
  // ([[network-egress-minimization]]), only coarsely detected "network up"
  // anyway (no-cors), and contacted a third-party origin the user may not
  // expect. navigator.onLine is the same coarse signal with ZERO egress, and
  // the events keep it live (the old ping only re-checked on welcome-dismiss).
  const [isOnline, setIsOnline] = React.useState(
    () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)
  );
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const update = () => setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return { isOnline };
}
