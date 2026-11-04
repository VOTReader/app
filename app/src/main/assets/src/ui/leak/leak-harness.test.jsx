// @ts-nocheck — test-only
/* The leak harness catches what it says it catches (leak hunt, 2026-11-01).
   Each kind gets a component that starts one thing and never stops it; the harness
   must fail it and name the kind. The same component with its cleanup must pass, so a
   green screen gate means "nothing left running", not "the harness saw nothing". */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { installLeakHarness, expectNoLeaks } from './leak-harness.js';

let h;
/** Every stop a leaky probe kept, run after its test so one test's leak cannot reach the next. */
const stops = [];
const store = (() => { const l = new Set(); return { subscribe: (cb) => { l.add(cb); return () => { l.delete(cb); }; } }; })();
beforeEach(() => { globalThis.LeakTestStore = store; h = installLeakHarness(); });
afterEach(() => { h.restore(); while (stops.length) stops.pop()(); delete globalThis.LeakTestStore; });

/** A component whose effect starts `start()` and, when `clean`, returns its stop. */
const make = (start, clean) => function Probe() {
  React.useEffect(() => { const stop = start(); if (clean) return stop; stops.push(stop); return undefined; }, []);
  return <div className="probe">probe</div>;
};

const KINDS = {
  listener: () => { const f = () => {}; window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); },
  'listener (document, capture)': () => { const f = () => {}; document.addEventListener('pointerdown', f, true); return () => document.removeEventListener('pointerdown', f, true); },
  interval: () => { const id = setInterval(() => {}, 1000); return () => clearInterval(id); },
  timeout: () => { const id = setTimeout(() => {}, 300); return () => clearTimeout(id); },
  raf: () => { let id; let on = true; const loop = () => { if (on) id = requestAnimationFrame(loop); }; loop(); return () => { on = false; cancelAnimationFrame(id); }; },
  observer: () => { const o = new ResizeObserver(() => {}); o.observe(document.body); return () => o.disconnect(); },
  'observer (mutation)': () => { const o = new MutationObserver(() => {}); o.observe(document.body, { childList: true }); return () => o.disconnect(); },
  sub: () => globalThis.LeakTestStore.subscribe(() => {}),
  objecturl: () => { const u = URL.createObjectURL(new Blob(['x'])); return () => URL.revokeObjectURL(u); },
};
if (typeof BroadcastChannel === 'function') KINDS.broadcast = () => { const b = new BroadcastChannel('leak-test'); return () => b.close(); };

describe('the leak harness', () => {
  for (const [kind, start] of Object.entries(KINDS)) {
    it(`fails a component that leaves a ${kind} running`, async () => {
      const Leaky = make(start, false);
      await expect(expectNoLeaks(h, () => render(<Leaky />), { cycles: 3, label: 'Leaky' }))
        .rejects.toThrow(new RegExp('still running: ' + kind.split(' ')[0] + ' \\+'));
    });
    it(`passes the same component when it cleans the ${kind} up`, async () => {
      const Tidy = make(start, true);
      await expectNoLeaks(h, () => render(<Tidy />), { cycles: 3, label: 'Tidy' });
    });
  }

  it('fails an IndexedDB connection left open, passes one closed', async () => {
    const open = (close) => function Db() {
      React.useEffect(() => {
        let db = null; let gone = false;
        const req = indexedDB.open('leak-test-db');
        req.onsuccess = () => { db = req.result; if (gone && close) db.close(); };
        if (!close) stops.push(() => { if (db) db.close(); });
        return () => { gone = true; if (close && db) db.close(); };
      }, []);
      return null;
    };
    const Leaky = open(false), Tidy = open(true);
    await expect(expectNoLeaks(h, () => render(<Leaky />), { cycles: 2, label: 'Db' })).rejects.toThrow(/still running: idb \+1/);
    await expectNoLeaks(h, () => render(<Tidy />), { cycles: 2, label: 'Db' });
  });

  it('a listener on an element that leaves with the screen is not a leak', async () => {
    function Own() {
      const ref = React.useRef(null);
      React.useEffect(() => { ref.current.addEventListener('click', () => {}); }, []);
      return <button ref={ref}>x</button>;
    }
    await expectNoLeaks(h, () => render(<Own />), { cycles: 3 });
  });

  it('a timer started by an interaction and left pending at unmount is caught', async () => {
    function Debounced() {
      const t = React.useRef(null);
      return <input aria-label="q" onChange={() => { clearTimeout(t.current); t.current = setTimeout(() => {}, 250); }} />;
    }
    const { fireEvent } = await import('@testing-library/react');
    await expect(expectNoLeaks(h, () => render(<Debounced />), {
      cycles: 2, interact: () => fireEvent.change(document.querySelector('input'), { target: { value: 'a' } }),
    })).rejects.toThrow(/still running: timeout \+1/);
  });

  it('a short timer that runs after the unmount is caught, though it is gone by the count', async () => {
    // Armed by a tap and unmounted in the same task, so it runs inside the 40 ms settle after the unmount whatever the
    // load: it fires before the settle's own (later, longer) sleep. A 60 ms timer armed at mount raced the mount's
    // settle instead and ran while the probe was still there on a busy machine (land 11-04).
    function Late() {
      return <button type="button" onClick={() => { setTimeout(() => {}, 5); }}>x</button>;
    }
    const { fireEvent } = await import('@testing-library/react');
    await expect(expectNoLeaks(h, () => render(<Late />), {
      cycles: 2, unmountAt: 'interact', interact: () => fireEvent.click(document.querySelector('button')),
    })).rejects.toThrow(/timeout after 5 ms, ran after the unmount/);
  });

  it('a timer an unmount itself schedules (a cleanup deferral) is not', async () => {
    const Defer = make(() => () => { setTimeout(() => {}, 0); }, true);
    await expectNoLeaks(h, () => render(<Defer />), { cycles: 2 });
  });

  it('a zero-delay deferral queued just before an immediate unmount is not counted', async () => {
    function Deferring() {
      return <button type="button" onClick={() => { setTimeout(() => {}, 0); }}>x</button>;
    }
    const { fireEvent } = await import('@testing-library/react');
    await expectNoLeaks(h, () => render(<Deferring />), {
      cycles: 3, unmountAt: 'interact', interact: () => fireEvent.click(document.querySelector('button')),
    });
  });

  // A stand-in for a library: its frames read as node_modules, as a real dependency's do. It keeps
  // the ids it arms so a test can stop them.
  const libIds = [];
  const lib = new Function('ids', 'ms', 'ids.push(setTimeout(function () {}, ms));\n//# sourceURL=/repo/node_modules/fake-lib/index.js');
  /** The library's own continuation: a microtask calls it straight, with no app frame under it. */
  const libLater = () => queueMicrotask(lib.bind(null, libIds, 4000));
  afterEach(() => { while (libIds.length) clearTimeout(libIds.pop()); });

  it('a library timer the screen arms itself is the screen\'s: its effect is under it in the stack', async () => {
    const Leaky = make(() => { lib(libIds, 4000); return () => {}; }, false);
    await expect(expectNoLeaks(h, () => render(<Leaky />), { cycles: 2 })).rejects.toThrow(/still running: timeout \+1[\s\S]*leak-harness\.test\.jsx/);
  });

  it('one unattributed stray (no app frame: a library continuation landing mid-cycle) is reported, not failed, and named', async () => {
    let n = 0;
    const Once = make(() => { if (++n === 2) libLater(); return () => {}; }, true);   // the first counted mount only
    const r = await expectNoLeaks(h, () => render(<Once />), { cycles: 3 });
    expect(r.strays.map((x) => x.desc)).toEqual(['after 4000 ms']);
    expect(r.strays[0].stack).toMatch(/node_modules\/fake-lib\/index\.js/);
  });

  it('unattributed strays that pile up, one per mount, still fail', async () => {
    const Pile = make(() => { libLater(); return () => {}; }, true);
    await expect(expectNoLeaks(h, () => render(<Pile />), { cycles: 4 })).rejects.toThrow(/still running: timeout \+2[\s\S]*fake-lib/);
  });
});
