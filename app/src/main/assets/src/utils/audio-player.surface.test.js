// @ts-check
/* The public surface of utils/audio-player.js, pinned before the player was split into
   utils/audio-player/*.js (sweep-2 v15-code-health-12): the split moves code, never the
   contract. What the rest of the app imports is exactly these four names, and the store is
   exactly these methods, in this order. */
import { describe, it, expect } from 'vitest';

const METHODS = [
  'subscribe', 'getVersion', 'getState', 'getPreciseTime',
  'hasAudio', 'prewarm', 'firstReaderCode', 'collectionHasAudio', 'sectionsFor', 'sectionTracks',
  'readerLabel', 'renditionsFor', 'setPreferredReader', 'playbackTracks',
  'playLetter', 'playCollection', 'playSection', 'playBibleBook', 'playSongs',
  'setShuffle', 'switchSongVersion', 'setRepeat', 'setLoop', 'clearLoop', 'isNative',
  'bibleChapterStart', 'bibleChapterOfTrack', 'sectionLetterKeyAt', 'sectionOpeningKey', 'liveLetter',
  'playTrack', 'toggle', 'next', 'prev', 'seek', 'skip', 'setPlaybackRate',
  'getSleepRemainingSeconds', 'setSleepTimer', 'setSleepAtTrackEnd', 'clearSleepTimer',
  'playAt', 'removeUpcoming', 'moveUpcoming', 'clearUpcoming', 'stop', 'pauseIfPlaying', 'syncKeepAlive',
];

describe('audio-player public surface', () => {
  it('exports exactly AudioPlayer, trackUrl and the two toast ids', async () => {
    const mod = await import('./audio-player.js');
    expect(Object.keys(mod).sort()).toEqual(['AUDIO_TOAST_ID', 'AudioPlayer', 'SONG_OFFLINE_TOAST_ID', 'trackUrl']);
    expect(mod.AUDIO_TOAST_ID).toBe('vot-toast-audio');
    expect(mod.SONG_OFFLINE_TOAST_ID).toBe('vot-toast-song-offline');
    expect(typeof mod.trackUrl).toBe('function');
  });

  it('the store carries the same methods, in the same order, all functions', async () => {
    const { AudioPlayer } = await import('./audio-player.js');
    expect(Object.keys(AudioPlayer)).toEqual(METHODS);
    for (const name of METHODS) expect(typeof AudioPlayer[name], name).toBe('function');
  });

  it('starts idle with the documented state shape', async () => {
    const { AudioPlayer } = await import('./audio-player.js');
    const s = AudioPlayer.getState();
    expect(Object.keys(s).sort()).toEqual(['duration', 'loop', 'qi', 'queue', 'rate', 'repeat', 'restoring', 'shuffle',
      'sleepAtTrackEnd', 'sleepEndsAt', 'sleepMinutes', 'sourceMode', 'status', 'time']);
    expect(s.status).toBe('idle');
    expect(AudioPlayer.getState()).toBe(s);   // the live object, never a copy
  });
});
