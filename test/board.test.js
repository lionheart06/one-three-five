import { afterEach, describe, expect, it, vi } from 'vitest';
import { create } from '../src/index.js';
import { createStore, storageKey } from '../src/storage.js';

function fakeLocalStorage() {
  const data = new Map();
  return {
    data,
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

// Lets queued storage writes land.
const flush = () => new Promise(r => setTimeout(r));

const list = (...ids) => ids.map(id => ({ id, title: id.toUpperCase() }));

afterEach(() => {
  delete globalThis.localStorage;
  delete globalThis.GM_getValue;
  delete globalThis.GM_setValue;
});

describe('create()', () => {
  it('remembers assignments across boards through storage', async () => {
    globalThis.localStorage = fakeLocalStorage();
    const first = create({ listId: 'inbox', todos: list('a', 'b') });
    await first.ready;
    first.assign('a', 1);
    await flush();

    const second = create({ listId: 'inbox' });
    await second.ready;
    second.setTodos(list('b', 'a'));
    expect(second.bucketOf('a')).toBe('1');
    expect(second.storage).toBe('local');
  });

  it('keeps separate boards per listId', async () => {
    globalThis.localStorage = fakeLocalStorage();
    const a = create({ listId: 'x', todos: list('t') });
    await a.ready;
    a.assign('t', 5);
    const b = create({ listId: 'y', todos: list('t') });
    await b.ready;
    expect(b.bucketOf('t')).toBeNull();
  });

  it('does not overwrite stored data when setTodos runs before the record loads', async () => {
    let resolveGet;
    const writes = [];
    const adapter = {
      get: () => new Promise(r => (resolveGet = r)),
      set: (k, v) => void writes.push(v),
    };
    const board = create({ storage: adapter, todos: list('a') });
    expect(writes).toEqual([]);
    resolveGet(JSON.stringify({ v: 1, tasks: { a: { bucket: '3', order: 0, assignedAt: '2026-10-25T08:00:00.000Z', lastSeen: '2026-10-25' } } }));
    await board.ready;
    expect(board.bucketOf('a')).toBe('3');
    await flush();
    expect(JSON.parse(writes.at(-1)).tasks.a.bucket).toBe('3');
  });

  it('refuses mutations before ready and warns', () => {
    const board = create({ storage: { get: () => new Promise(() => {}), set() {} }, todos: list('a') });
    const warning = vi.fn();
    board.on('warning', warning);
    expect(board.assign('a', 1)).toBe(false);
    expect(warning).toHaveBeenCalledOnce();
  });

  it('emits change, assign and full events', async () => {
    const board = create({ storage: 'memory', todos: list('a', 'b') });
    await board.ready;
    const seen = [];
    board.on('change', () => seen.push('change'));
    board.on('assign', e => seen.push(['assign', e]));
    board.on('full', e => seen.push(['full', e]));
    board.assign('a', 1);
    board.assign('b', 1);
    expect(seen).toEqual([
      ['assign', { key: 'a', from: null, to: '1' }],
      'change',
      ['assign', { key: 'b', from: null, to: '1' }],
      ['full', { bucket: '1', dropped: ['a'] }],
      'change',
    ]);
  });

  it('exports and imports the record (FR-13)', async () => {
    const a = create({ storage: 'memory', todos: list('a') });
    await a.ready;
    a.assign('a', 3);
    const b = create({ storage: 'memory', todos: list('a') });
    await b.ready;
    expect(b.import(a.export())).toBe(true);
    expect(b.bucketOf('a')).toBe('3');
    expect(b.import('{not json')).toBe(false);
    expect(b.import({ v: 99, tasks: {} })).toBe(false);
  });

  it('getState returns todos grouped by zone', async () => {
    const board = create({ storage: 'memory', todos: ['Write report', 'Call Ana'] });
    await board.ready;
    board.assign(board.keyOf('Call Ana'), 5);
    expect(board.getState()).toEqual({
      buckets: { 1: [], 3: [], 5: [{ title: 'Call Ana' }] },
      unassigned: [{ title: 'Write report' }],
    });
  });
});

describe('storage', () => {
  it('uses GM storage when granted, keyed per site', async () => {
    const data = new Map();
    globalThis.GM_getValue = (k, d) => (data.has(k) ? data.get(k) : d);
    globalThis.GM_setValue = (k, v) => void data.set(k, v);
    const board = create({ listId: 'gh', origin: 'https://github.com', todos: list('a') });
    await board.ready;
    board.assign('a', 1);
    await flush();
    expect(board.storage).toBe('gm');
    expect([...data.keys()]).toEqual(['one-three-five:https://github.com:gh']);
  });

  it('builds keys: GM per origin, others per listId', () => {
    expect(storageKey('gm', 'l', 'https://a.com')).toBe('one-three-five:https://a.com:l');
    expect(storageKey('local', 'l', 'https://a.com')).toBe('one-three-five:l');
  });

  it('falls back to memory when nothing is available', () => {
    expect(createStore('auto', { listId: 'l', warn() {} }).kind).toBe('memory');
  });

  it('warns once and keeps working in memory when writes fail', async () => {
    const warn = vi.fn();
    const store = createStore({ get: () => null, set: () => { throw new Error('quota'); } }, { listId: 'l', warn });
    await store.save({ v: 1, tasks: {} });
    await store.save({ v: 1, tasks: {} });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/quota/);
  });

  it('resets unreadable stored data with a warning', async () => {
    const warn = vi.fn();
    const store = createStore({ get: () => '{oops', set() {} }, { listId: 'l', warn });
    expect(await store.load()).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('serialises async writes in order', async () => {
    const order = [];
    const adapter = {
      get: () => null,
      set: (k, v) => new Promise(r => setTimeout(() => (order.push(JSON.parse(v).n), r()), JSON.parse(v).n === 1 ? 20 : 0)),
    };
    const store = createStore(adapter, { listId: 'l', warn() {} });
    store.save({ n: 1 });
    await store.save({ n: 2 });
    expect(order).toEqual([1, 2]);
  });
});
