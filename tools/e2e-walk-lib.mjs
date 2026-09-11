/* e2e-walk-lib — helpers shared by the update-reload / kill-cadence walks.
   RED form: this is what the walk does TODAY, written as a module — one sample is the
   reading, and whatever a relaunch restored is never counted. The tests say why that is
   wrong; the next commit makes them green. */

export async function settleRead(read) {
  const y = await read();
  return { y, settled: true, waitedMs: 0, stillMs: 0, samples: [{ t: 0, y }] };
}

export function classifyRestoredPages(urls) {
  return { total: urls.length, appTabs: 0, appUrls: [], others: urls.slice() };
}
