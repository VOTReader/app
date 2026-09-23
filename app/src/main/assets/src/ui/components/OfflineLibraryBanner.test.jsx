/* OfflineLibraryBanner (B5) — what the reader sees for each phase of the
   offline library, and that Retry / dismiss drive the store. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { OfflineLibraryBanner } from './OfflineLibraryBanner.jsx';
import { OfflineLibrary } from '../../utils/offline-library.js';

function fakeWorker(answers) {
  return {
    postMessage(msg, ports) {
      const reply = answers[msg.type];
      if (reply !== undefined && ports && ports[0]) ports[0].postMessage(reply);
    },
  };
}
const status = (missing) => ({ type: 'OFFLINE_STATUS', total: 60, missing, complete: missing.length === 0 });
async function settle() {
  await act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
}

beforeEach(() => { OfflineLibrary._reset(); });
afterEach(() => { cleanup(); OfflineLibrary._reset(); });

describe('OfflineLibraryBanner (B5)', () => {
  it('shows nothing until a worker has answered (unknown)', () => {
    const { container } = render(<OfflineLibraryBanner />);
    expect(container.querySelector('.offline-library-banner')).toBeNull();
  });

  it('shows nothing for a complete library', async () => {
    const { container } = render(<OfflineLibraryBanner />);
    await act(async () => { await OfflineLibrary.check(() => fakeWorker({ CHECK_OFFLINE: status([]) }), 1000); });
    expect(container.querySelector('.offline-library-banner')).toBeNull();
  });

  it('an incomplete library says so, counts the files, and offers Retry', async () => {
    const { container, getByText } = render(<OfflineLibraryBanner />);
    await act(async () => { await OfflineLibrary.check(() => fakeWorker({ CHECK_OFFLINE: status(['a', 'b', 'c']) }), 1000); });
    const b = container.querySelector('.offline-library-banner');
    expect(b).not.toBeNull();
    expect(b && b.getAttribute('role')).toBe('status');
    expect(b && b.textContent).toContain('Offline library incomplete.');
    expect(b && b.textContent).toContain('3 files did not download.');
    expect(getByText('Retry')).toBeTruthy();
  });

  it('Retry repairs, shows "complete" only on the fresh complete read', async () => {
    const w = fakeWorker({ CHECK_OFFLINE: status(['a']), REPAIR_OFFLINE: status([]) });
    const { container, getByText } = render(<OfflineLibraryBanner />);
    await act(async () => { await OfflineLibrary.check(() => w, 1000); });
    expect(container.textContent).toContain('1 file did not download.');
    fireEvent.click(getByText('Retry'));
    await settle();
    expect(container.textContent).toContain('Offline library complete.');
  });

  it('a repair that fails says what is still missing and how to fix it', async () => {
    const w = fakeWorker({ CHECK_OFFLINE: status(['a', 'b']), REPAIR_OFFLINE: status(['a', 'b']) });
    const { container, getByText } = render(<OfflineLibraryBanner />);
    await act(async () => { await OfflineLibrary.check(() => w, 1000); });
    fireEvent.click(getByText('Retry'));
    await settle();
    expect(container.textContent).toContain('2 files are still missing.');
    expect(container.textContent).toContain('Connect to the internet, then retry.');
    expect(getByText('Retry')).toBeTruthy();
  });

  it('while retrying it can still be dismissed (refuter critique: a 3-minute strip with no close)', async () => {
    /** @type {(v: any) => void} */ let release = () => {};
    const w = {
      postMessage(msg, ports) {
        if (msg.type === 'CHECK_OFFLINE') ports[0].postMessage(status(['a']));
        else release = (v) => ports[0].postMessage(v);   // the repair answers later
      },
    };
    const { container, getByText, getByLabelText } = render(<OfflineLibraryBanner />);
    await act(async () => { await OfflineLibrary.check(() => w, 1000); });
    fireEvent.click(getByText('Retry'));
    await settle();
    expect(container.textContent).toContain('Downloading 1 missing file');
    fireEvent.click(getByLabelText('Dismiss'));
    expect(container.querySelector('.offline-library-banner')).toBeNull();
    await act(async () => { release(status([])); for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
    expect(container.textContent).toContain('Offline library complete.');
  });

  it('dismiss hides it for this session', async () => {
    const { container, getByLabelText } = render(<OfflineLibraryBanner />);
    await act(async () => { await OfflineLibrary.check(() => fakeWorker({ CHECK_OFFLINE: status(['a']) }), 1000); });
    fireEvent.click(getByLabelText('Dismiss'));
    expect(container.querySelector('.offline-library-banner')).toBeNull();
  });

  it('declares itself while it shows, so app.css can make room for it (b5l)', async () => {
    // jsdom has no layout: give the strip the 44.17 px it measured in the real app.
    const rect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      const h = this.classList.contains('offline-library-banner') ? 44.17 : 0;
      return /** @type {DOMRect} */ ({ x: 0, y: 0, top: 0, left: 0, right: 0, width: 0, bottom: h, height: h, toJSON() { return {}; } });
    };
    const root = document.documentElement;
    try {
      const { getByLabelText } = render(<OfflineLibraryBanner />);
      expect(document.body.classList.contains('offline-strip-open')).toBe(false);
      await act(async () => { await OfflineLibrary.check(() => fakeWorker({ CHECK_OFFLINE: status(['a']) }), 1000); });
      expect(document.body.classList.contains('offline-strip-open')).toBe(true);
      expect(root.style.getPropertyValue('--offline-strip-h')).toBe('44.2px');
      fireEvent.click(getByLabelText('Dismiss'));
      expect(document.body.classList.contains('offline-strip-open')).toBe(false);
      expect(root.style.getPropertyValue('--offline-strip-h')).toBe('');
    } finally {
      HTMLElement.prototype.getBoundingClientRect = rect;
    }
  });
});
