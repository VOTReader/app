// @ts-nocheck -- the store is a plain stand-in.
/* The Downloads strip (downloads brief 2026-10-23, 3f; pictures 08-09): one line for the queue, from datasafe's dl-d2
   calls where the store has them and from pending() where it does not. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { DownloadStrip } from './DownloadStrip.jsx';

function store(extra = {}) {
  return { pending: () => ({ busy: 0, failed: [] }), cancelAll: vi.fn(), ...extra };
}
function setOnline(v) { Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => v }); }
afterEach(() => { cleanup(); setOnline(true); });

describe('DownloadStrip', () => {
  it('says nothing with nothing on its way', () => {
    const { container } = render(<DownloadStrip off={store()} />);
    expect(container.textContent).toBe('');
  });

  it('on a store without the queue calls: the count to go and Cancel all', () => {
    const off = store({ pending: () => ({ busy: 12, failed: [] }) });
    const { container, getByRole } = render(<DownloadStrip off={off} />);
    expect(container.textContent).toMatch(/^Downloading · 12 recordings to go/);
    fireEvent.click(getByRole('button', { name: 'Cancel all' }));
    expect(off.cancelAll).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('with dl-d2: "Downloading 3 of 30", the bytes left, a progress line, and Pause all', () => {
    const off = store({ paused: () => false, reason: () => null, left: () => ({ count: 28, bytes: 191e6 }), batch: () => ({ done: 2, total: 30, failed: 0 }), pause: vi.fn(() => true), resume: vi.fn() });
    const { container, getByRole } = render(<DownloadStrip off={off} />);
    expect(container.querySelector('.dl-strip-line1').textContent).toBe('Downloading 3 of 30');
    expect(container.querySelector('.dl-strip-line2').textContent).toBe('191 MB left');
    expect(getByRole('progressbar').getAttribute('aria-valuenow')).toBe('7');
    fireEvent.click(getByRole('button', { name: 'Pause all' }));
    expect(off.pause).toHaveBeenCalledTimes(1);
    expect(getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('paused: "Paused · 3 of 30" and Resume all', () => {
    const off = store({ paused: () => true, reason: () => 'paused', left: () => ({ count: 28, bytes: 191e6 }), batch: () => ({ done: 2, total: 30, failed: 0 }), pause: vi.fn(), resume: vi.fn() });
    const { container, getByRole, queryByRole } = render(<DownloadStrip off={off} />);
    expect(container.querySelector('.dl-strip-line1').textContent).toBe('Paused · 3 of 30');
    expect(queryByRole('button', { name: 'Pause all' })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Resume all' }));
    expect(off.resume).toHaveBeenCalledTimes(1);
  });

  it('waiting for storage space offers Make room; waiting for Wi-Fi says it starts on Wi-Fi', () => {
    const onMakeRoom = vi.fn();
    const base = { paused: () => false, left: () => ({ count: 27, bytes: 191e6 }), batch: () => ({ done: 3, total: 30, failed: 0 }), pause: vi.fn(), resume: vi.fn() };
    const { container, getByRole } = render(<DownloadStrip off={store({ ...base, reason: () => 'space' })} onMakeRoom={onMakeRoom} />);
    expect(container.textContent).toMatch(/Waiting for storage space · 27 leftNeeds 191 MB more room/);
    fireEvent.click(getByRole('button', { name: 'Make room' }));
    expect(onMakeRoom).toHaveBeenCalledTimes(1);
    cleanup();
    const wifi = render(<DownloadStrip off={store({ ...base, reason: () => 'wifi' })} />);
    expect(wifi.container.textContent).toMatch(/Waiting for Wi-Fi · 27 left191 MB · starts on Wi-Fi/);
    expect(within(wifi.container).queryByRole('progressbar')).toBeNull();
  });

  it('with no signal: No connection, and it starts again when online', () => {
    setOnline(false);
    const { container } = render(<DownloadStrip off={store({ pending: () => ({ busy: 4, failed: [] }) })} />);
    expect(container.textContent).toMatch(/No connection · 4 leftStarts again when you’re online/);
  });

  // Picture 09, last state: a browser runs nothing once the page is shut, so a queue found at open waits for a yes.
  it('stopped when the app closed (web): the line, what is left, and one Resume', () => {
    const off = store({ paused: () => true, reason: () => 'closed', left: () => ({ count: 27, bytes: 191e6 }), batch: () => ({ done: 3, total: 30, failed: 0 }), pause: vi.fn(), resume: vi.fn() });
    const { container, getByRole, queryByRole } = render(<DownloadStrip off={off} />);
    expect(container.querySelector('.dl-strip-line1').textContent).toBe('Downloads stopped when VOTReader closed.');
    expect(container.querySelector('.dl-strip-line2').textContent).toBe('27 recordings left · 191 MB');
    expect(queryByRole('button', { name: 'Pause all' })).toBeNull();
    expect(queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Resume' }));
    expect(off.resume).toHaveBeenCalledTimes(1);
  });

  it('paused with nothing left in line says nothing', () => {
    const off = store({ paused: () => true, reason: () => null, left: () => ({ count: 0, bytes: 0 }), batch: () => ({ done: 0, total: 0, failed: 0 }), pause: vi.fn(), resume: vi.fn() });
    const { container } = render(<DownloadStrip off={off} />);
    expect(container.textContent).toBe('');
  });
});
