// @ts-nocheck - a hand-made offline store
/* Fix list 13: picking a voice whose files are all on the phone turned the whole control into 'On this phone',
   sheet and all, so the reader could not switch back to the voice they wanted. Whether the collection is on the
   phone is decided for the voice Listen plays; a picked voice that is all there says so in the sheet. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';

const SAVED = new Set();
const off = {
  statusOf: (u) => (SAVED.has(u) ? 'saved' : 'none'),
  sizeOf: () => 1000,
  progressOf: () => null,
  freeBytes: () => 1e9,
  refresh: () => {},
  requestSizes: () => {},
  runsClosed: () => false,
};
vi.mock('./OfflineAudioControls.jsx', async (orig) => ({ ...(await orig()), useOfflineAudio: () => off, useOnline: () => true }));
const { CollectionDownload } = await import('./CollectionDownload.jsx');

afterEach(() => { cleanup(); SAVED.clear(); });

const unitsFor = (voice) => ['a', 'b'].map((id) => ({ name: id, tracks: [{ url: (voice || 'B') + '-' + id + '.mp3', key: 'v:' + id }] }));

describe('CollectionDownload voice pick (fix list 13)', () => {
  it('picking a voice already on the phone keeps the sheet, says so, and lets the reader pick back', () => {
    SAVED.add('T-a.mp3'); SAVED.add('T-b.mp3');
    render(<CollectionDownload label="Volume One" unitsFor={unitsFor} readers={['B', 'T']} onOpenDownloads={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download Volume One' }));
    fireEvent.click(screen.getByText('Voice'));
    fireEvent.click(screen.getByText('Timothy'));
    expect(screen.queryByText('On this phone')).toBeNull();
    expect(screen.getByText('All on this phone')).toBeTruthy();
    fireEvent.click(screen.getByText('Voice'));
    fireEvent.click(screen.getByText('The one Listen plays'));
    expect(screen.getByText('2 recordings')).toBeTruthy();
  });

  it('the voice Listen plays all on the phone still shows On this phone', () => {
    SAVED.add('B-a.mp3'); SAVED.add('B-b.mp3');
    render(<CollectionDownload label="Volume One" unitsFor={unitsFor} readers={['B', 'T']} onOpenDownloads={() => {}} />);
    expect(screen.getByText('On this phone')).toBeTruthy();
  });
});
