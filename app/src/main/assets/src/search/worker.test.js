/* search/worker.test.js — the search worker's entry: a message in, handleWorkerMessage called with the
   data and a post back. First tests of worker.js (6 lines). worker-ops.js is mocked — the real one
   loads the model and the index; this file covers only the entry wiring. */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';

const handleWorkerMessage = vi.hoisted(() => vi.fn());

vi.mock('./worker-ops.js', () => ({
  handleWorkerMessage,
}));

describe('worker entry', () => {
  let originalOnmessage;
  let entryOnmessage;

  beforeAll(async () => {
    originalOnmessage = self.onmessage;
    await import('./worker.js');
    entryOnmessage = self.onmessage;
  });

  afterAll(() => {
    self.onmessage = originalOnmessage;
  });

  afterEach(() => {
    handleWorkerMessage.mockClear();
  });

  it('sets an onmessage handler on the scope', () => {
    expect(typeof entryOnmessage).toBe('function');
  });

  it('hands a message to handleWorkerMessage with the data and a post back', () => {
    const data = { id: 3, op: 'meaning-start', base: 'http://localhost/' };
    entryOnmessage({ data });
    expect(handleWorkerMessage).toHaveBeenCalledTimes(1);
    expect(handleWorkerMessage).toHaveBeenCalledWith(data, expect.any(Function));
  });

  it('the post back posts the message on the scope', () => {
    const postSpy = vi.fn();
    vi.spyOn(window, 'postMessage').mockImplementation(postSpy);
    try {
      entryOnmessage({ data: { id: 3, op: 'meaning-start' } });
      const postFn = handleWorkerMessage.mock.calls[0][1];
      postFn({ id: 3, alive: true });
      expect(postSpy).toHaveBeenCalledWith({ id: 3, alive: true });
    } finally {
      vi.mocked(window.postMessage).mockRestore();
    }
  });

  it('hands a message with no data through as undefined', () => {
    entryOnmessage({});
    expect(handleWorkerMessage).toHaveBeenCalledWith(undefined, expect.any(Function));
  });
});
