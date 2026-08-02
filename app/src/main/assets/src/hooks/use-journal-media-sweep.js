/* ═══════════════════════════════════════════════════════════════════════
   useJournalMediaSweep — one-time journal media orphan sweep (boot, +4 s)
   ═══════════════════════════════════════════════════════════════════════
   Extracted verbatim from App() 2026-08-02 (composition-root headroom —
   the one App() effect with ZERO closure dependencies).

   JournalStore.remove() deliberately does NOT delete media blobs (an embed
   in another entry may still reference the source's image/audio —
   shared-media protection). The trade-off is that the owning entry's
   deletion orphans its blobs in IndexedDB. collectAllMediaIds() walks
   EVERY entry (source + embeds), so a blob survives as long as any entry
   still references it; only truly unreferenced blobs are pruned. Deferred
   4 s so it never competes with the first paint.

   PARAMS: none. WINDOW: none. Reads the JournalStore / JournalMediaStore
   bare globals (bundle-b), both typeof-guarded.
   ═══════════════════════════════════════════════════════════════════════ */

/** Mount-only: schedule the orphan sweep once, 4 s after boot. */
export function useJournalMediaSweep() {
  React.useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (typeof JournalStore === 'undefined' || typeof JournalMediaStore === 'undefined') return;
        // U1: only sweep when the journal store is fully hydrated. If it is
        // still pending/degraded (slow IDB, or a fresh import that hasn't
        // rebased yet), collectAllMediaIds() under-reports referenced blobs and
        // the prune would irreversibly delete real (or just-imported) media.
        // Skipping is safe: an orphan blob is harmless leftover space, swept on
        // a later boot once the store loads in time.
        if (!JournalStore.isReady()) {
          console.info('Journal media orphan sweep skipped — store not ready (' + JournalStore.getState() + ')');
          return;
        }
        // STORE-2: stamp the snapshot moment and pass it as the prune cutoff so a
        // blob captured AFTER this snapshot (but read by prune's async IDB pass)
        // is never reclaimed — it's too new to be a real orphan.
        const sweepStart = Date.now();
        const referenced = JournalStore.collectAllMediaIds();
        JournalMediaStore.pruneOrphans(referenced, sweepStart).then((n) => {
          if (n) console.info('Journal media orphan sweep removed', n, 'blob(s)');
        }).catch((e) => console.warn('Journal media orphan sweep failed', e));
      } catch (e) { console.warn('Journal media orphan sweep threw', e); }
    }, 4000);
    return () => clearTimeout(t);
  }, []);
}
