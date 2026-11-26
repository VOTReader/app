// @ts-nocheck
// Fix list #32: Open on a bookmark or link whose place is gone closed the sheet and opened nothing, silently.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';

vi.mock('../../utils/toast.js', async (orig) => ({ ...(await orig()), showToast: vi.fn() }));
import { showToast } from '../../utils/toast.js';
import { BookmarksScreen } from './BookmarksScreen.jsx';

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'BookmarkStore', 'relativeDate', 'ConfirmStrip', '_bookTitle',
  '_bookmarkSourceLabel', '_bookmarkSourceEndpoint'];

beforeEach(() => {
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.LibraryNav = () => null;
  globalThis.ConfirmStrip = () => null;
  globalThis.relativeDate = () => '';
  globalThis._bookTitle = (id) => id;
  globalThis._bookmarkSourceLabel = () => 'Gone place';
  globalThis._bookmarkSourceEndpoint = () => null;
  globalThis.BookmarkStore = {
    subscribe: () => () => {}, getVersion: () => 0, remove: () => {}, update: () => {},
    all: () => [{ id: 'g', hlKey: 'vot:gone:1', label: 'Old mark', created: 1, updated: 1 }],
    get: () => null,
  };
  vi.mocked(showToast).mockClear();
});
afterEach(() => { cleanup(); GLOBALS.forEach((k) => { delete globalThis[k]; }); });

describe('a bookmark whose place is gone', () => {
  it('says why instead of doing nothing', () => {
    const go = vi.fn();
    render(<BookmarksScreen onBack={() => {}} onNavigateToSource={go} onSearch={() => {}} onHistory={() => {}} theme="dark" onThemeChange={() => {}} />);
    fireEvent.click(document.querySelector('.bkm-row .ui-row-main'));
    expect(go).not.toHaveBeenCalled();
    expect(vi.mocked(showToast)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showToast).mock.calls[0][0].text).toBe('That place is no longer in the app.');
  });
});
