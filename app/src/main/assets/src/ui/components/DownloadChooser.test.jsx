// @ts-nocheck -- classic-global screen contract (OfflineAudio, AudioPlayer, COLLECTIONS, the Bible tables are bundle globals).
/* The Downloads screen's Choose tab (downloads brief 2026-10-23, D3; pictures 03-07): a tick means "on this phone
   after Apply", the footer totals Apply, Apply asks once, a chapter grid takes ranges, and a big Apply on mobile data
   asks about Wi-Fi first. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { DownloadChooser } from './DownloadChooser.jsx';

const U = (id) => 'https://example.test/' + id + '.mp3';

function fakeStore() {
  const st = { saved: new Map(), status: new Map(), sizes: new Map(), free: 5e9 };
  return {
    st,
    statusOf: (u) => (st.saved.has(u) ? 'saved' : st.status.get(u) || 'none'),
    sizeOf: (u) => st.sizes.get(u) || null,
    freeBytes: () => st.free,
    download: vi.fn(() => true),
    remove: vi.fn(),
    cancel: vi.fn(),
  };
}

/** Volume One: two letters (Christmas in two parts); Volume Two: one; the KJV with Ruth (4 chapters). */
const LETTERS = {
  v1: [{ id: 'warning', title: 'A Word of Warning' }, { id: 'christmas', title: 'Christmas' }],
  v2: [{ id: 'one', title: 'Letter One' }],
};
function tracksOf(volKey, item) {
  if (volKey === 'v1' && item.id === 'christmas') return [{ url: U('xmas-1'), key: 'v1:christmas', partLabel: 'Part 1' }, { url: U('xmas-2'), key: 'v1:christmas', partLabel: 'Part 2' }];
  if (volKey === 'bible-kjv') {
    return item.id === 'ruth' ? [1, 2, 3, 4].map((n) => ({ url: U('ruth-' + n), key: 'bible-kjv:ruth', title: 'Ruth ' + n, partLabel: 'Chapter ' + n })) : [];
  }
  return [{ url: U(volKey + '-' + item.id), key: volKey + ':' + item.id }];
}

let off;
beforeEach(() => {
  off = fakeStore();
  for (const [id, b] of [['xmas-1', 5e6], ['xmas-2', 6e6], ['v2-one', 7e6], ['v1-warning', 3e6]]) off.st.sizes.set(U(id), b);
  for (const n of [1, 2, 3, 4]) off.st.sizes.set(U('ruth-' + n), 3e6);
  globalThis.COLLECTIONS = [{ volKey: 'v1', label: 'Volume One', cardId: 'v1' }, { volKey: 'v2', label: 'Volume Two', cardId: 'v2' }];
  globalThis.colPreface = () => null;
  globalThis.colLetterArr = (col) => LETTERS[col.volKey];
  globalThis.AudioPlayer = { playbackTracks: tracksOf, renditionsFor: () => [] };
  globalThis.BIBLE_AUDIO_EDITIONS = { kjv: { volKey: 'bible-kjv', short: 'KJV · BRM', label: 'KJV' } };
  globalThis.BIBLE_AUDIO_BOOKS = [['ruth', 'Ruth']];
});
afterEach(() => {
  cleanup();
  for (const k of ['COLLECTIONS', 'colPreface', 'colLetterArr', 'AudioPlayer', 'BIBLE_AUDIO_EDITIONS', 'BIBLE_AUDIO_BOOKS']) delete globalThis[k];
  delete window.navigator.connection;
});

const footer = (c) => c.querySelector('.dl-footer');
const box = (c, name) => within(c).getByRole('checkbox', { name });

describe('Choose: ticks and the footer', () => {
  it('what is on the phone starts ticked; parents read all, some or none', () => {
    off.st.saved.set(U('v1-warning'), {});
    const { container } = render(<DownloadChooser off={off} />);
    expect(box(container, 'Volume One').getAttribute('aria-checked')).toBe('mixed');
    expect(box(container, 'Volume Two').getAttribute('aria-checked')).toBe('false');
    expect(box(container, 'The Volumes of Truth').getAttribute('aria-checked')).toBe('mixed');
    expect(footer(container).textContent).toMatch(/Tick what you want on this phone/);
    expect(within(footer(container)).getByRole('button').disabled).toBe(true);
  });

  it('ticking a collection adds it: the footer counts recordings (Christmas once), bytes, and Download asks once', () => {
    const { container, getByRole } = render(<DownloadChooser off={off} />);
    fireEvent.click(box(container, 'Volume One'));
    expect(footer(container).textContent).toMatch(/Add 2 recordings · 14 MB/);
    expect(footer(container).textContent).toMatch(/5 GB free on this phone/);
    const go = within(footer(container)).getByRole('button');
    expect(go.textContent).toBe('Download 14 MB');
    fireEvent.click(go);
    expect(off.download).not.toHaveBeenCalled();
    const sheet = getByRole('dialog');
    expect(sheet.textContent).toMatch(/Download these\?/);
    expect(sheet.textContent).toMatch(/Volume One2 recordings · 14 MB/);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Apply' }));
    expect(off.download).toHaveBeenCalledWith([
      { url: U('v1-warning'), key: 'v1:warning', title: 'A Word of Warning' },
      { url: U('xmas-1'), key: 'v1:christmas', title: 'Christmas · Part 1' },
      { url: U('xmas-2'), key: 'v1:christmas', title: 'Christmas · Part 2' },
    ]);
  });

  it('a tap on a dash selects everything under it', () => {
    off.st.saved.set(U('v1-warning'), {});
    const { container } = render(<DownloadChooser off={off} />);
    fireEvent.click(box(container, 'Volume One'));
    expect(box(container, 'Volume One').getAttribute('aria-checked')).toBe('true');
  });

  it('unticking a letter on the phone reads Will be removed, and Apply removes it after one confirm', () => {
    off.st.saved.set(U('v2-one'), {});
    const { container, getByRole } = render(<DownloadChooser off={off} />);
    fireEvent.click(within(container).getByRole('button', { name: /^Volume Two/ }));
    fireEvent.click(box(container, 'Letter One'));
    expect(container.querySelector('.dl-unit').textContent).toMatch(/Will be removed/);
    expect(box(container, 'Volume Two').className).toMatch(/is-remove/);
    expect(footer(container).textContent).toMatch(/Remove 1 recording · 7 MB/);
    fireEvent.click(within(footer(container)).getByRole('button', { name: 'Apply' }));
    const sheet = getByRole('dialog');
    expect(sheet.textContent).toMatch(/Remove these\?/);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Apply' }));
    expect(off.remove).toHaveBeenCalledWith([U('v2-one')]);
    expect(off.download).not.toHaveBeenCalled();
  });

  it('adding and removing together: Apply, the removal on its own line', () => {
    off.st.saved.set(U('v2-one'), {});
    const { container } = render(<DownloadChooser off={off} />);
    fireEvent.click(box(container, 'Volume Two'));
    fireEvent.click(box(container, 'Volume One'));
    expect(footer(container).textContent).toMatch(/^Add 2 · 14 MB/);
    expect(container.querySelector('.dl-footer-warn').textContent).toBe('Remove 1 · 7 MB');
    expect(within(footer(container)).getByRole('button').textContent).toBe('Apply');
  });

  it('not enough room: Apply is off and the footer says how much more is needed', () => {
    off.st.free = 210e6;
    off.st.sizes.set(U('v2-one'), 300e6);
    const { container } = render(<DownloadChooser off={off} />);
    fireEvent.click(box(container, 'Volume Two'));
    expect(footer(container).textContent).toMatch(/Needs 300 MB more room\. Untick some, or remove downloads you’ve finished\./);
    expect(within(footer(container)).getByRole('button', { name: 'Apply' }).disabled).toBe(true);
  });
});

describe('Choose: the Bible', () => {
  it('a range in the chapter grid ticks its run; the sheet names it by chapters', () => {
    off.st.saved.set(U('ruth-4'), {});
    const { container, getByRole } = render(<DownloadChooser off={off} />);
    fireEvent.click(within(container).getByRole('button', { name: /^Old Testament/ }));
    fireEvent.click(within(container).getByRole('button', { name: /^Ruth/ }));
    const chip4 = within(container).getByRole('button', { name: 'Chapter 4, on this phone' });
    expect(chip4.className).toMatch(/is-kept/);
    fireEvent.click(within(container).getByRole('button', { name: 'Range' }));
    fireEvent.click(within(container).getByRole('button', { name: 'Chapter 1' }));
    fireEvent.click(within(container).getByRole('button', { name: 'Chapter 2' }));
    expect(within(container).getByRole('button', { name: 'Chapter 1, to download' }).className).toMatch(/is-add/);
    expect(footer(container).textContent).toMatch(/Add 2 chapters · 6 MB/);
    fireEvent.click(within(footer(container)).getByRole('button'));
    expect(getByRole('dialog').textContent).toMatch(/Ruth 1-22 chapters · 6 MB/);
  });

  it('a chapter tap toggles it; unticking one on the phone marks it for removal', () => {
    off.st.saved.set(U('ruth-4'), {});
    const { container } = render(<DownloadChooser off={off} />);
    fireEvent.click(within(container).getByRole('button', { name: /^Old Testament/ }));
    fireEvent.click(within(container).getByRole('button', { name: /^Ruth/ }));
    fireEvent.click(within(container).getByRole('button', { name: 'Chapter 4, on this phone' }));
    expect(within(container).getByRole('button', { name: 'Chapter 4, will be removed' }).className).toMatch(/is-remove/);
    expect(footer(container).textContent).toMatch(/Remove 1 chapter · 3 MB/);
  });
});

describe('Choose: mobile data', () => {
  it('over 100 MB on mobile data asks first: Download now goes ahead', () => {
    Object.defineProperty(window.navigator, 'connection', { configurable: true, value: { type: 'cellular', addEventListener: vi.fn(), removeEventListener: vi.fn() } });
    off.st.sizes.set(U('v2-one'), 150e6);
    const { container, getByRole } = render(<DownloadChooser off={off} />);
    fireEvent.click(box(container, 'Volume Two'));
    fireEvent.click(within(footer(container)).getByRole('button'));
    fireEvent.click(within(getByRole('dialog')).getByRole('button', { name: 'Apply' }));
    const ask = getByRole('dialog');
    expect(ask.textContent).toMatch(/Download 150 MB on mobile data\?/);
    fireEvent.click(within(ask).getByRole('button', { name: 'Download now' }));
    expect(off.download).toHaveBeenCalledTimes(1);
  });

  it('Wait for Wi-Fi holds it until the connection is no longer mobile data', () => {
    const conn = { type: 'cellular', listeners: [], addEventListener: (_e, f) => conn.listeners.push(f), removeEventListener: vi.fn() };
    Object.defineProperty(window.navigator, 'connection', { configurable: true, value: conn });
    off.st.sizes.set(U('v2-one'), 150e6);
    const { container, getByRole } = render(<DownloadChooser off={off} />);
    fireEvent.click(box(container, 'Volume Two'));
    fireEvent.click(within(footer(container)).getByRole('button'));
    fireEvent.click(within(getByRole('dialog')).getByRole('button', { name: 'Apply' }));
    fireEvent.click(within(getByRole('dialog')).getByRole('button', { name: 'Wait for Wi-Fi' }));
    expect(off.download).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/Waiting for Wi-Fi · 1 recording/);
    conn.type = 'wifi';
    conn.listeners.forEach((f) => f());
    expect(off.download).toHaveBeenCalledWith([{ url: U('v2-one'), key: 'v2:one', title: 'Letter One' }]);
  });
});
