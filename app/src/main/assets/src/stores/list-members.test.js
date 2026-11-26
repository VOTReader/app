// data-6 (audit 2026-11-23): a list store's replaceAll keeps every record it is handed (minting an id where one
// is missing), drops only members that are not records, and says so in the diagnostic log.
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { keepListMembers } from './list-members.js';
import { DiagnosticLog } from '../utils/diagnostic-log.js';
import { NotebookStore } from './notebook-store.js';
import { JournalStore, JournalNotebookStore } from './journal-store.js';
import { LinkStore } from './link-store.js';

afterEach(() => vi.restoreAllMocks());

const endpoint = (key) => ({ type: 'bible', key, label: key });

describe('keepListMembers', () => {
  it('keeps records, mints an id where one is missing, drops what is not a record, and reports both', () => {
    const warn = vi.spyOn(DiagnosticLog, 'warn').mockImplementation(() => {});
    let n = 0;
    const r = keepListMembers([{ id: 'a', t: 1 }, null, { t: 2 }, 7, 'x', [1], { id: '', t: 3 }], () => 'new' + (++n), 'vot-test');
    expect(r.list).toEqual([{ id: 'a', t: 1 }, { id: 'new1', t: 2 }, { id: 'new2', t: 3 }]);
    expect([r.dropped, r.minted]).toEqual([4, 2]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toContain('vot-test: dropped 4');
  });

  it('says nothing about a clean list and gives back an empty one for anything that is no list', () => {
    const warn = vi.spyOn(DiagnosticLog, 'warn').mockImplementation(() => {});
    expect(keepListMembers([{ id: 'a' }], () => 'x', 's').list).toEqual([{ id: 'a' }]);
    expect(keepListMembers(null, () => 'x', 's').list).toEqual([]);
    expect(keepListMembers({ list: [] }, () => 'x', 's').list).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('the list stores keep an id-less record and drop a null (data-6)', () => {
  it('NotebookStore', () => {
    NotebookStore.replaceAll(/** @type {any} */ ({ list: [null, { name: 'Faith', sortIndex: 0 }] }));
    const list = NotebookStore.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Faith');
    expect(list[0].id).toMatch(/^nb_/);
  });

  it('JournalStore and JournalNotebookStore', () => {
    JournalStore.replaceAll(/** @type {any} */ ({ list: [null, { title: 'Morning', body: 'words', created: 1 }] }));
    const entries = /** @type {any[]} */ (JournalStore._load().list);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toMatch(/^j_/);
    expect(entries[0].body).toBe('words');
    JournalNotebookStore.replaceAll(/** @type {any} */ ({ list: [7, { name: 'Prayers' }] }));
    const nbs = JournalNotebookStore.list();
    expect(nbs).toHaveLength(1);
    expect(nbs[0].id).toMatch(/^jnb_/);
  });

  it('LinkStore', () => {
    LinkStore.replaceAll(/** @type {any} */ ([null, { source: endpoint('bible:john:3:16'), target: endpoint('bible:john:3:17'), created: 1 }]));
    const links = LinkStore._load();
    expect(links).toHaveLength(1);
    expect(links[0].id).toMatch(/^lnk_/);
  });
});
