// @ts-nocheck -- the store is a plain stand-in.
/* The Downloads strip (downloads brief 2026-10-23, 3f; pictures 08-09; dl-rework E): one line for the queue by count
   and by bytes, from the store's queue calls where it has them and from pending() where it does not. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { DownloadStrip } from './DownloadStrip.jsx';

function store(extra = {}) {
  return { pending: () => ({ busy: 0, failed: [] }), cancelAll: vi.fn(), ...extra };
}
function setOnline(v) { Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => v }); }
afterEach(() => { cleanup(); setOnline(true); });

const queue = (extra = {}) => store({
  paused: () => false, reason: () => null, left: () => ({ count: 28, bytes: 191e6 }), batch: () => ({ done: 2, total: 30, failed: 0 }),
  pause: vi.fn(() => true), resume: vi.fn(), ...extra,
});

describe('DownloadStrip', () => {
  it('says nothing with nothing on its way', () => {
    const { container } = render(<DownloadStrip off={store()} />);
    expect(container.textContent).toBe('');
  });

  it('on a store without the queue calls: the count to go, and Cancel all asks first', () => {
    const off = store({ pending: () => ({ busy: 12, failed: [] }) });
    const { container, getByRole } = render(<DownloadStrip off={off} />);
    expect(container.textContent).toMatch(/^Downloading · 12 recordings to go/);
    fireEvent.click(getByRole('button', { name: 'Cancel all' }));
    expect(off.cancelAll).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/Cancel all 12 downloads\?/);
    fireEvent.click(getByRole('button', { name: 'Cancel downloads' }));
    expect(off.cancelAll).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  // dl-rework E (defect 30): Cancel stopped everything at once.
  it('Cancel asks first; Keep downloading changes nothing', () => {
    const off = queue();
    const { getByRole, queryByRole } = render(<DownloadStrip off={off} />);
    fireEvent.click(getByRole('button', { name: 'Cancel' }));
    fireEvent.click(getByRole('button', { name: 'Keep downloading' }));
    expect(off.cancelAll).not.toHaveBeenCalled();
    expect(queryByRole('button', { name: 'Keep downloading' })).toBeNull();
  });

  it('with dl-d2: the count done of the batch, the bytes left, a progress line, and Pause all', () => {
    const off = queue();
    const { container, getByRole } = render(<DownloadStrip off={off} />);
    expect(container.querySelector('.dl-strip-line1').textContent).toBe('Downloading · 2 of 30 recordings');
    expect(container.querySelector('.dl-strip-line2').textContent).toBe('191 MB left');
    expect(getByRole('progressbar').getAttribute('aria-valuenow')).toBe('7');
    fireEvent.click(getByRole('button', { name: 'Pause all' }));
    expect(off.pause).toHaveBeenCalledTimes(1);
    expect(getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  // dl-rework E (defect 26): the bar counted recordings; a 1,189-file edition moved 1/1,189 per file.
  it('by bytes with both counts, and a rough time left once the rate is known', () => {
    const off = queue({
      left: () => ({ count: 877, bytes: 3.2e9, unknown: 0 }), batch: () => ({ done: 312, total: 1189, failed: 0 }),
      overall: () => ({ done: 312, total: 1189, doneBytes: 1.2e9, totalBytes: 4.4e9, rate: 1e6, secondsLeft: 3 * 3600 + 25 * 60 }),
    });
    const { container, getByRole } = render(<DownloadStrip off={off} />);
    expect(container.querySelector('.dl-strip-line1').textContent).toBe('Downloading · 312 of 1,189 recordings');
    expect(container.querySelector('.dl-strip-line2').textContent).toBe('1.2 of 4.4 GB · about 3 h 25 min left');
    expect(getByRole('progressbar').getAttribute('aria-valuenow')).toBe('27');
  });

  it('paused: "Paused · 2 of 30 recordings" and Resume all', () => {
    const off = queue({ paused: () => true, reason: () => 'paused' });
    const { container, getByRole, queryByRole } = render(<DownloadStrip off={off} />);
    expect(container.querySelector('.dl-strip-line1').textContent).toBe('Paused · 2 of 30 recordings');
    expect(queryByRole('button', { name: 'Pause all' })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Resume all' }));
    expect(off.resume).toHaveBeenCalledTimes(1);
  });

  // dl-rework E (defect 24): it said the bytes left, not the room missing.
  it('waiting for storage space says the real shortfall and offers Make room; waiting for Wi-Fi says it starts on Wi-Fi', () => {
    const onMakeRoom = vi.fn();
    const base = { left: () => ({ count: 27, bytes: 191e6 }), batch: () => ({ done: 3, total: 30, failed: 0 }) };
    const { container, getByRole } = render(<DownloadStrip off={queue({ ...base, reason: () => 'space', need: () => 34e6 })} onMakeRoom={onMakeRoom} />);
    expect(container.textContent).toMatch(/Waiting for storage space · 27 leftNeeds 34 MB more room/);
    fireEvent.click(getByRole('button', { name: 'Make room' }));
    expect(onMakeRoom).toHaveBeenCalledTimes(1);
    cleanup();
    const wifi = render(<DownloadStrip off={queue({ ...base, reason: () => 'wifi' })} />);
    expect(wifi.container.textContent).toMatch(/Waiting for Wi-Fi · 27 left191 MB · starts on Wi-Fi/);
    expect(within(wifi.container).queryByRole('progressbar')).toBeNull();
  });

  it('with no signal: No connection, and it starts again when online', () => {
    setOnline(false);
    const { container } = render(<DownloadStrip off={store({ pending: () => ({ busy: 4, failed: [] }) })} />);
    expect(container.textContent).toMatch(/No connection · 4 leftStarts again when you’re online/);
  });

  // dl-rework E (defect 25): offline turned "space" and "retrying" into "No connection".
  it('with no signal a wait for space or a retry keeps its own words', () => {
    setOnline(false);
    const space = render(<DownloadStrip off={queue({ reason: () => 'space', need: () => 5e6 })} />);
    expect(space.container.querySelector('.dl-strip-line1').textContent).toMatch(/^Waiting for storage space/);
    cleanup();
    const retry = render(<DownloadStrip off={queue({ reason: () => 'retrying' })} />);
    expect(retry.container.querySelector('.dl-strip-line1').textContent).toMatch(/^Trying again/);
  });

  // dl-rework D/E: only the store's will-try-again list is left.
  it('only the will-try-again list left: says so, and Retry now tries them all', () => {
    const failed = [{ url: 'a', key: '', title: 'A' }, { url: 'b', key: '', title: 'B' }];
    const off = queue({ pending: () => ({ busy: 0, failed }), left: () => ({ count: 0, bytes: 0 }), reason: () => 'later', later: () => failed, retryAll: vi.fn() });
    const { container, getByRole, queryByRole } = render(<DownloadStrip off={off} />);
    expect(container.querySelector('.dl-strip-line1').textContent).toBe('Didn’t download yet · 2 recordings');
    expect(queryByRole('button', { name: 'Pause all' })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Retry now' }));
    expect(off.retryAll).toHaveBeenCalledTimes(1);
  });

  it('paused with nothing left in line says nothing', () => {
    const off = store({ paused: () => true, reason: () => null, left: () => ({ count: 0, bytes: 0 }), batch: () => ({ done: 0, total: 0, failed: 0 }), pause: vi.fn(), resume: vi.fn() });
    const { container } = render(<DownloadStrip off={off} />);
    expect(container.textContent).toBe('');
  });
});
