// @ts-nocheck — free-var globals through settings-harness, same shape as SettingsScreen.editiondesc.test.jsx
/* Settings → Listening → Bible Audio offers no row for a hidden edition.
   ═══════════════════════════════════════════════════════════════════════
   2026-09-12: tsot-matthew's assets were not on the release (every chapter
   404ed live), so ONE registry flag, `unreleased: true`, took the edition out
   of every door through ONE predicate, bibleAudioOffered()
   (utils/audio-track.hide.test.js owns the registry half). This picker is the
   door that would PERSIST the choice: a reader who selected a hidden edition
   here would carry a 404 into every Bible book. 2026-09-13: the mirror landed
   and the flag line is deleted; the real-registry case inverts (five and Off,
   tsot-matthew among them) and the synthetic-registry case below is the one
   live witness, across every door, that a flagged entry is filtered.

   The screen is a classic-globals bundle and reads the registry off
   globalThis; the predicate rides the same bridge (audio-track.js publishes
   both beside their declarations; settings-harness installs both), so the
   screen cannot hold a second copy of the rule.

   These open the real sheet and read the real option markup, because the
   defect is what the reader is offered. */
import { describe, it, expect, afterEach } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import {
  setupSettingsGlobals, teardownSettingsGlobals, renderSettings,
} from './settings-harness.jsx';
import { BIBLE_AUDIO_EDITIONS } from '../../utils/audio-track.js';

/** Open the Bible Audio sheet and return every option's label, in order. */
async function optionLabels() {
  const trigger = [...document.querySelectorAll('.settings-select-trigger')]
    .find((b) => (b.getAttribute('aria-label') || '').indexOf('Bible Audio: ') === 0);
  expect(trigger, 'the Bible Audio field must be on screen — nothing below is about it otherwise').toBeTruthy();
  await act(async () => { trigger.click(); });
  const sheet = [...document.querySelectorAll('.select-sheet')].pop();
  expect(sheet, 'the option sheet must open').toBeTruthy();
  return [...sheet.querySelectorAll('.select-sheet-option')]
    .map((b) => (b.querySelector('.select-sheet-option-label') || {}).textContent || '');
}

afterEach(() => { cleanup(); teardownSettingsGlobals(); });

describe('Bible Audio picker — every offered edition, and never a hidden one', () => {
  it('the REAL registry: five editions and Off today, tsot-matthew among them (mirrored 2026-09-13)', async () => {
    setupSettingsGlobals({ BIBLE_AUDIO_EDITIONS });
    renderSettings({ bibleAudio: 'brm-kjv' });
    const labels = await optionLabels();
    expect(labels).toContain(BIBLE_AUDIO_EDITIONS['tsot-matthew'].label);
    expect(Object.keys(BIBLE_AUDIO_EDITIONS)).toHaveLength(5);
    expect(labels).toHaveLength(5 + 1);                            // none hidden today, plus Off
    expect(labels[labels.length - 1]).toBe('Off');
  });

  it('ANY flagged entry: the door reads the flag through the shared predicate, not by name', async () => {
    // A registry no release has shipped, to prove the rule is the flag and
    // not the id: the middle entry is hidden, its neighbours are not.
    setupSettingsGlobals({
      BIBLE_AUDIO_EDITIONS: {
        'a-kjv': { label: 'A', short: 'A', translation: 'kjv', volKey: 'bible-a', assetPrefix: 'a', books: 'all' },
        'b-gone': { label: 'B', short: 'B', translation: 'kjv', volKey: 'bible-b', assetPrefix: 'b', books: 'all', unreleased: true },
        'c-web': { label: 'C', short: 'C', translation: 'web', volKey: 'bible-c', assetPrefix: 'c', books: 'all' },
      },
    });
    renderSettings({ bibleAudio: 'a-kjv' });
    expect(await optionLabels()).toEqual(['A', 'C', 'Off']);
  });

  it('CONTROL: a registry with nothing hidden is offered whole', async () => {
    setupSettingsGlobals({
      BIBLE_AUDIO_EDITIONS: {
        'a-kjv': { label: 'A', short: 'A', translation: 'kjv', volKey: 'bible-a', assetPrefix: 'a', books: 'all' },
        'c-web': { label: 'C', short: 'C', translation: 'web', volKey: 'bible-c', assetPrefix: 'c', books: 'all' },
      },
    });
    renderSettings({ bibleAudio: 'a-kjv' });
    expect(await optionLabels()).toEqual(['A', 'C', 'Off']);
  });
});
