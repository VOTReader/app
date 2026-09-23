/* copy-share — the outcome words are the contract SelectionToolbar and
   NoteSheet act on (A15). Every path resolves; nothing rejects. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { copyText, shareText, copyFromSelection } from './copy-share.js';

/** @type {PropertyDescriptor | undefined} */ let origClipboard;
/** @type {PropertyDescriptor | undefined} */ let origShare;
/** @type {any} */ let origExec;

beforeEach(() => {
  origClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  origShare = Object.getOwnPropertyDescriptor(navigator, 'share');
  origExec = /** @type {any} */ (document).execCommand;
});

afterEach(() => {
  if (origClipboard) Object.defineProperty(navigator, 'clipboard', origClipboard);
  else delete /** @type {any} */ (navigator).clipboard;
  if (origShare) Object.defineProperty(navigator, 'share', origShare);
  else delete /** @type {any} */ (navigator).share;
  /** @type {any} */ (document).execCommand = origExec;
});

/** @param {any} value */
function setClipboard(value) {
  Object.defineProperty(navigator, 'clipboard', { value, writable: true, configurable: true });
}
/** @param {any} value */
function setShare(value) {
  Object.defineProperty(navigator, 'share', { value, writable: true, configurable: true });
}
/** @param {string} name */
function rejectWith(name) {
  return () => Promise.reject(Object.assign(new Error(name), { name }));
}

describe('copyText', () => {
  it("resolves 'copied' when the clipboard accepts the text", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });
    await expect(copyText('Grace')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('Grace');
  });

  it("resolves 'failed' (never rejects) when the browser refuses", async () => {
    setClipboard({ writeText: rejectWith('NotAllowedError') });
    await expect(copyText('Grace')).resolves.toBe('failed');
  });

  it("resolves 'failed' when there is no Clipboard API (insecure page, old WebView)", async () => {
    setClipboard(undefined);
    await expect(copyText('Grace')).resolves.toBe('failed');
  });

  it("resolves 'failed' when writeText throws synchronously", async () => {
    setClipboard({ writeText: () => { throw new TypeError('Illegal invocation'); } });
    await expect(copyText('Grace')).resolves.toBe('failed');
  });
});

describe('shareText', () => {
  it("resolves 'shared' when the native share sheet completes", async () => {
    const share = vi.fn(() => Promise.resolve());
    setShare(share);
    await expect(shareText('Peace')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'Peace' });
  });

  it("resolves 'cancelled' on AbortError and copies nothing", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });
    setShare(rejectWith('AbortError'));
    await expect(shareText('Peace')).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies instead when the share fails for another reason: 'copied-instead'", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });
    setShare(rejectWith('NotAllowedError'));
    await expect(shareText('Peace')).resolves.toBe('copied-instead');
    expect(writeText).toHaveBeenCalledWith('Peace');
  });

  it("resolves 'failed' when the share fails and the copy is refused too", async () => {
    setClipboard({ writeText: rejectWith('NotAllowedError') });
    setShare(rejectWith('DataError'));
    await expect(shareText('Peace')).resolves.toBe('failed');
  });

  it("copies when there is no share sheet at all: 'copied-instead'", async () => {
    setShare(undefined);
    setClipboard({ writeText: () => Promise.resolve() });
    await expect(shareText('Peace')).resolves.toBe('copied-instead');
  });

  it('treats a share() that throws synchronously like a failed share', async () => {
    setShare(() => { throw new TypeError('share is not allowed'); });
    setClipboard({ writeText: () => Promise.resolve() });
    await expect(shareText('Peace')).resolves.toBe('copied-instead');
  });
});

describe('copyFromSelection (the Try again path)', () => {
  it("copies the selected field with execCommand inside the tap: 'copied', no async call", async () => {
    const field = document.createElement('textarea');
    field.value = 'Hope';
    document.body.appendChild(field);
    const select = vi.spyOn(field, 'select');
    /** @type {any} */ (document).execCommand = vi.fn(() => true);
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });
    await expect(copyFromSelection(field, 'Hope')).resolves.toBe('copied');
    expect(select).toHaveBeenCalled();
    expect(/** @type {any} */ (document).execCommand).toHaveBeenCalledWith('copy');
    expect(writeText).not.toHaveBeenCalled();
    field.remove();
  });

  it('falls back to the async API when execCommand is refused', async () => {
    /** @type {any} */ (document).execCommand = vi.fn(() => false);
    setClipboard({ writeText: () => Promise.resolve() });
    await expect(copyFromSelection(null, 'Hope')).resolves.toBe('copied');
  });

  it('falls back to the async API when execCommand throws, and reports a refusal', async () => {
    /** @type {any} */ (document).execCommand = vi.fn(() => { throw new Error('nope'); });
    setClipboard({ writeText: rejectWith('NotAllowedError') });
    await expect(copyFromSelection(null, 'Hope')).resolves.toBe('failed');
  });
});
