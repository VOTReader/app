/* Your data's Storage group (dz25 7h): design's words for each of main's states (README "Added 10-15 (dz25"), the rows in
   order, and the 7h picture's facts. */
import { describe, it, expect } from 'vitest';
import { spaceStatus, protectionLine, spaceLine, exportLine, growthLine, browserLine, logLine, spaceRows, gateSpace } from './storage-facts.js';

const NOW = Date.UTC(2026, 9, 14, 12);
const READY = { lastAssessedAt: NOW, quota: 2147483648, usage: 222717542, persisted: false, risks: [] };

describe('Protection (main\'s StorageHealth)', () => {
  it('each state in design\'s words; Protect now only on a browser that asks, not yet protected or refused', () => {
    expect(spaceStatus(null)).toBe('loading');
    expect(spaceStatus({ lastAssessedAt: 0 })).toBe('loading');
    expect(spaceStatus({ lastAssessedAt: NOW, quota: null, usage: null })).toBe('unavailable');
    expect(spaceStatus(READY)).toBe('ready');
    expect(protectionLine({ lastAssessedAt: 0 }, false, 'this phone')).toEqual({ s: 'Checking…', protect: false });
    expect(protectionLine({ lastAssessedAt: NOW, quota: null, usage: null }, false, 'this phone'))
      .toEqual({ s: "This browser can't protect it. Export a backup now and then.", protect: false });
    expect(protectionLine({ ...READY, risks: ['not-persisted'] }, false, 'this phone'))
      .toEqual({ s: 'Not active: the browser may clear it to free space', protect: true });
    expect(protectionLine({ ...READY, risks: ['not-persisted'] }, true, 'this phone'))
      .toEqual({ s: 'The browser said no. Export a backup now and then.', protect: false });
    expect(protectionLine({ ...READY, persisted: true }, false, 'this phone'))
      .toEqual({ s: "Active: the browser won't clear it on its own", protect: false });
    expect(protectionLine(READY, false, 'this phone')).toEqual({ s: 'Saved on this phone. Export a backup now and then.', protect: false });
    expect(protectionLine(READY, false, 'this computer').s).toBe('Saved on this computer. Export a backup now and then.');
  });
});

describe('Space used, What Export saves, Growth, Browser, Diagnostic log', () => {
  it('Space used: of the quota, without one, or not said', () => {
    expect(spaceLine(READY)).toBe('About 212.4 MB of 2.0 GB, the offline library, kept songs and Garden pages included');
    expect(spaceLine({ ...READY, quota: null })).toBe('About 212.4 MB, the offline library, kept songs and Garden pages included');
    expect(spaceLine({ lastAssessedAt: NOW, quota: null, usage: null })).toBe("This browser doesn't say.");
    expect(spaceLine({ ...READY, usage: null })).toBe("This browser doesn't say.");
    expect(spaceLine(null)).toBe('Checking…');
  });

  it('What Export saves: measuring, then about X, journal items counted', () => {
    expect(exportLine(null)).toBe('Measuring…');
    expect(exportLine({ total: 1468006, mediaCount: 0 })).toBe('About 1.4 MB: highlights, notes, journal, bookmarks, links, progress and history');
    expect(exportLine({ total: 9 * 1024 * 1024, mediaCount: 3 }))
      .toBe('About 9.0 MB, 3 journal items among them: highlights, notes, journal, bookmarks, links, progress and history');
    expect(exportLine({ total: 2048, mediaCount: 1 })).toBe('About 2.0 KB, 1 journal item among them: highlights, notes, journal, bookmarks, links, progress and history');
  });

  it('Growth: none before the first sample, one sample, then grown, shrunk or the same since the first day', () => {
    const sep20 = new Date(2026, 8, 20).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    expect(growthLine([])).toBe(null);
    expect(growthLine([{ d: '2026-10-15', b: 1468006 }])).toBe('First measured today · 1.4 MB');
    expect(growthLine([{ d: '2026-09-20', b: 1148518 }, { d: '2026-10-15', b: 1468006 }])).toBe('Grown by 312.0 KB since ' + sep20 + ' · now 1.4 MB');
    expect(growthLine([{ d: '2026-09-20', b: 2048 }, { d: '2026-10-15', b: 1024 }])).toBe('Shrunk by 1.0 KB since ' + sep20 + ' · now 1.0 KB');
    expect(growthLine([{ d: '2026-09-20', b: 2048 }, { d: '2026-10-15', b: 2048 }])).toBe('No change since ' + sep20 + ' · 2.0 KB');
  });

  it('Browser: main\'s platforms in design\'s words; the diagnostic log\'s entries', () => {
    expect(['chrome', 'firefox', 'edge', 'safari-tab', 'safari-pwa', 'android-webview', 'unknown'].map(browserLine))
      .toEqual(['Chrome', 'Firefox', 'Edge', 'Safari', 'Safari, from the Home Screen', 'Installed app', 'Web browser']);
    expect(logLine(12)).toBe('12 entries: warnings, errors and timings, file paths left out. It goes into your next export.');
    expect(logLine(1)).toBe('1 entry: warnings, errors and timings, file paths left out. It goes into your next export.');
  });
});

describe('the rows', () => {
  it('in design\'s order; Growth once measured; the diagnostic log last, on the APK with entries only', () => {
    const f = { report: READY, platform: 'chrome', userData: null, samples: [], denied: false, log: 0, android: false };
    expect(spaceRows(f, 'this phone').map((r) => r.t)).toEqual(['Protection', 'Space used', 'What Export saves', 'Browser']);
    expect(spaceRows({ ...f, samples: [{ d: '2026-10-15', b: 1 }] }, 'this phone').map((r) => r.t))
      .toEqual(['Protection', 'Space used', 'What Export saves', 'Growth', 'Browser']);
    expect(spaceRows({ ...f, log: 4 }, 'this phone').map((r) => r.t)).not.toContain('Diagnostic log');
    const apk = spaceRows({ ...f, platform: 'android-webview', log: 4, android: true }, 'this phone');
    expect(apk.map((r) => r.t)).toEqual(['Protection', 'Space used', 'What Export saves', 'Browser', 'Diagnostic log']);
    expect(apk[3].s).toBe('Installed app');
    expect(spaceRows({ ...f, android: true }, 'this phone').map((r) => r.t)).not.toContain('Diagnostic log');
  });

  it('the 7h picture: Firefox, Protect now, 212.4 MB of 2.0 GB, 1.4 MB, grown by 312.0 KB since September 20', () => {
    const rows = spaceRows(gateSpace(NOW), 'this phone');
    expect(rows.map((r) => [r.t, r.s])).toEqual([
      ['Protection', 'Not active: the browser may clear it to free space'],
      ['Space used', 'About 212.4 MB of 2.0 GB, the offline library, kept songs and Garden pages included'],
      ['What Export saves', 'About 1.4 MB: highlights, notes, journal, bookmarks, links, progress and history'],
      ['Growth', 'Grown by 312.0 KB since ' + new Date(2026, 8, 20).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) + ' · now 1.4 MB'],
      ['Browser', 'Firefox'],
    ]);
    expect(rows[0].protect).toBe(true);
    expect(gateSpace(NOW).samples).toHaveLength(12);
  });
});
