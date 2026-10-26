// @ts-nocheck
/* THE SKIP BUTTONS' STEP (player-1025, Corbin 10-25: "Make the 15s forward/backward button 10s by default, adjustable
   in settings (typed number, or incremented)"). 10 s until Settings says otherwise, kept to 5-60 whole seconds; the
   player's subscribers hear a change after the render that pushed it; the phone app's media service is told once per
   change; the browser's media keys skip by it when they name no offset of their own. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AudioPlayer } from './audio-player.js';

afterEach(async () => {
  AudioPlayer.setSkipSeconds(10);
  delete window.AndroidBridge;
  await Promise.resolve();
});

describe('the skip step', () => {
  it('is 10 seconds by default', () => {
    expect(AudioPlayer.skipSeconds()).toBe(10);
  });

  it('keeps a typed or stored value to 5-60 whole seconds; anything not a number is the default', () => {
    expect(AudioPlayer.clampSkipSeconds(12.4)).toBe(12);
    expect(AudioPlayer.clampSkipSeconds('30')).toBe(30);
    expect(AudioPlayer.clampSkipSeconds(1)).toBe(5);
    expect(AudioPlayer.clampSkipSeconds(600)).toBe(60);
    for (const v of [undefined, null, '', 'ten', NaN, {}]) expect(AudioPlayer.clampSkipSeconds(v)).toBe(10);
  });

  it('tells the player’s subscribers after the push, not during it', async () => {
    const heard = vi.fn();
    const off = AudioPlayer.subscribe(heard);
    try {
      expect(AudioPlayer.setSkipSeconds(20)).toBe(20);
      expect(AudioPlayer.skipSeconds()).toBe(20);
      expect(heard).not.toHaveBeenCalled();
      await Promise.resolve();
      expect(heard).toHaveBeenCalled();
      heard.mockClear();
      AudioPlayer.setSkipSeconds(20);                  // the settings render pushes it every time: no news
      await Promise.resolve();
      expect(heard).not.toHaveBeenCalled();
    } finally { off(); }
  });

  it('tells the phone app’s media service once per change', () => {
    window.AndroidBridge = { audioSkip: vi.fn() };
    AudioPlayer.setSkipSeconds(15);
    AudioPlayer.setSkipSeconds(15);
    AudioPlayer.setSkipSeconds(10);
    expect(window.AndroidBridge.audioSkip.mock.calls).toEqual([[15], [10]]);
  });
});
