import { describe, expect, it } from 'vitest';
import { createModel } from '../src/model.js';
import { defaultGetKey, hashString } from '../src/keys.js';

// A clock the tests can move forward a day at a time.
function clock(start = '2026-10-25T09:00:00') {
  let t = new Date(start).getTime();
  return { now: () => t, advanceDays: d => (t += d * 864e5) };
}

const titles = state => ({
  1: state.buckets['1'].map(t => t.title),
  3: state.buckets['3'].map(t => t.title),
  5: state.buckets['5'].map(t => t.title),
  u: state.unassigned.map(t => t.title),
});

const list = (...ids) => ids.map(id => ({ id, title: id.toUpperCase() }));

describe('keys', () => {
  it('prefers the host id and falls back to a normalised title hash', () => {
    expect(defaultGetKey({ id: 42, title: 'x' })).toBe('42');
    expect(defaultGetKey({ title: '  Reply   to SAM ' })).toBe(defaultGetKey({ title: 'reply to sam' }));
    expect(defaultGetKey({ title: 'a' })).toBe('t:' + hashString('a'));
  });
});

describe('setTodos', () => {
  it('accepts strings and objects and puts new tasks in Unassigned, in list order', () => {
    const m = createModel();
    m.setTodos(['Write report', { id: 'b', title: 'Call Ana' }]);
    expect(titles(m.getState()).u).toEqual(['Write report', 'Call Ana']);
  });

  it('drops duplicate keys and invalid entries with warnings', () => {
    const m = createModel();
    const { warnings } = m.setTodos([{ id: 'a', title: 'A' }, { id: 'a', title: 'A again' }, 7]);
    expect(titles(m.getState()).u).toEqual(['A']);
    expect(warnings).toHaveLength(2);
  });

  it('restores assignments when the same list is supplied again, in any order', () => {
    const m = createModel();
    m.setTodos(list('a', 'b', 'c', 'd'));
    m.assign('a', 1);
    m.assign('b', 3);
    m.assign('c', 3);
    m.setTodos(list('d', 'c', 'b', 'a', 'e'));
    expect(titles(m.getState())).toEqual({ 1: ['A'], 3: ['B', 'C'], 5: [], u: ['D', 'E'] });
  });

  it('survives a round trip through the stored record', () => {
    const a = createModel();
    a.setTodos(list('a', 'b'));
    a.assign('b', 5);
    const b = createModel();
    b.load(JSON.parse(JSON.stringify(a.getRecord())));
    b.setTodos(list('a', 'b'));
    expect(b.bucketOf('b')).toBe('5');
  });
});

describe('tasks that leave and come back (FR-9)', () => {
  it('frees the slot while away and restores the bucket on return', () => {
    const m = createModel();
    m.setTodos(list('a', 'b'));
    m.assign('a', 1);
    m.setTodos(list('b'));
    expect(titles(m.getState())[1]).toEqual([]);
    expect(m.getRecord().tasks.a.away).toBe(true);
    m.setTodos(list('a', 'b'));
    expect(m.bucketOf('a')).toBe('1');
    expect(m.getRecord().tasks.a.away).toBeUndefined();
  });

  it('sends a returning task to Unassigned if its slot was filled meanwhile', () => {
    const m = createModel();
    m.setTodos(list('a', 'b'));
    m.assign('a', 1);
    m.setTodos(list('b'));
    m.assign('b', 1);
    const { overflowed } = m.setTodos(list('a', 'b'));
    expect(titles(m.getState())).toMatchObject({ 1: ['B'], u: ['A'] });
    expect(overflowed).toEqual([{ key: 'a', bucket: '1' }]);
    expect(m.getRecord().tasks.a).toBeUndefined();
  });

  it('keeps a record for 14 days and forgets it after', () => {
    const c = clock();
    const m = createModel({ now: c.now });
    m.setTodos(list('a'));
    m.assign('a', 3);
    m.setTodos([]);
    c.advanceDays(14);
    m.setTodos([]);
    expect(m.getRecord().tasks.a).toBeDefined();
    c.advanceDays(1);
    m.setTodos([]);
    expect(m.getRecord().tasks.a).toBeUndefined();
    m.setTodos(list('a'));
    expect(m.bucketOf('a')).toBeNull();
  });

  it('restarts the 14-day clock each time the task reappears', () => {
    const c = clock();
    const m = createModel({ now: c.now });
    m.setTodos(list('a'));
    m.assign('a', 5);
    m.setTodos([]);
    c.advanceDays(10);
    m.setTodos(list('a')); // back: clock resets
    m.setTodos([]);
    c.advanceDays(10); // 20 days after the first absence, 10 after the second
    m.setTodos([]);
    m.setTodos(list('a'));
    expect(m.bucketOf('a')).toBe('5');
  });

  it('honours a custom retentionDays', () => {
    const c = clock();
    const m = createModel({ now: c.now, retentionDays: 2 });
    m.setTodos(list('a'));
    m.assign('a', 1);
    m.setTodos([]);
    c.advanceDays(3);
    m.setTodos([]);
    expect(m.getRecord().tasks.a).toBeUndefined();
  });
});

describe('capacity', () => {
  it('accepts a drop into a full bucket; the new task stays and the last one drops (FR-4)', () => {
    const m = createModel();
    m.setTodos(list('a', 'b', 'c', 'd'));
    m.assign('a', 3);
    m.assign('b', 3);
    m.assign('c', 3);
    const r = m.assign('d', 3);
    expect(r.dropped).toEqual(['c']);
    expect(titles(m.getState())).toMatchObject({ 3: ['A', 'B', 'D'], u: ['C'] });
  });

  it('inserts at the drop index and drops whatever is pushed past capacity', () => {
    const m = createModel();
    m.setTodos(list('a', 'b', 'c', 'd'));
    m.assign('a', 3);
    m.assign('b', 3);
    m.assign('c', 3);
    expect(m.assign('d', 3, 0).dropped).toEqual(['c']);
    expect(titles(m.getState())[3]).toEqual(['D', 'A', 'B']);
  });

  it('replaces the single task in bucket 1', () => {
    const m = createModel();
    m.setTodos(list('a', 'b'));
    m.assign('a', 1);
    m.assign('b', 1);
    expect(titles(m.getState())).toMatchObject({ 1: ['B'], u: ['A'] });
  });

  it('keeps the earliest-assigned when restored tasks exceed a smaller capacity (FR-10)', () => {
    const c = clock();
    const big = createModel({ now: c.now, capacities: { 3: 5 } });
    big.setTodos(list('a', 'b', 'c', 'd'));
    for (const k of ['d', 'c', 'b', 'a']) {
      big.assign(k, 3);
      c.advanceDays(0.01);
    }
    const small = createModel({ now: c.now });
    small.load(big.getRecord());
    const { overflowed } = small.setTodos(list('a', 'b', 'c', 'd'));
    expect(titles(small.getState())[3]).toEqual(['D', 'C', 'B']);
    expect(overflowed).toEqual([{ key: 'a', bucket: '3' }]);
  });
});

describe('moves', () => {
  it('reorders within a bucket without dropping anything (FR-6)', () => {
    const m = createModel();
    m.setTodos(list('a', 'b', 'c'));
    for (const k of ['a', 'b', 'c']) m.assign(k, 5);
    expect(m.assign('c', 5, 0).dropped).toEqual([]);
    expect(titles(m.getState())[5]).toEqual(['C', 'A', 'B']);
  });

  it('unassigns with null, 0 or "0" and stores nothing for Unassigned', () => {
    const m = createModel();
    m.setTodos(list('a', 'b', 'c'));
    for (const k of ['a', 'b', 'c']) m.assign(k, 5);
    m.assign('a', null);
    m.assign('b', 0);
    m.assign('c', '0');
    expect(m.getRecord().tasks).toEqual({});
  });

  it('rejects unknown keys and buckets', () => {
    const m = createModel();
    m.setTodos(list('a'));
    expect(m.assign('zzz', 1).ok).toBe(false);
    expect(m.assign('a', 4).ok).toBe(false);
  });

  it('keeps assignedAt when reordering and stamps it when changing bucket', () => {
    const c = clock();
    const m = createModel({ now: c.now });
    m.setTodos(list('a', 'b'));
    m.assign('a', 5);
    const first = m.getRecord().tasks.a.assignedAt;
    c.advanceDays(1);
    m.assign('a', 5, 0);
    expect(m.getRecord().tasks.a.assignedAt).toBe(first);
    m.assign('a', 3);
    expect(m.getRecord().tasks.a.assignedAt).not.toBe(first);
  });

  it('swaps across buckets, including with Unassigned (FR-5)', () => {
    const m = createModel();
    m.setTodos(list('a', 'b', 'c'));
    m.assign('a', 1);
    m.assign('b', 3);
    m.swap('a', 'b');
    expect(titles(m.getState())).toMatchObject({ 1: ['B'], 3: ['A'] });
    m.swap('b', 'c');
    expect(titles(m.getState())).toMatchObject({ 1: ['C'], u: ['B'] });
  });

  it('swaps positions within one bucket', () => {
    const m = createModel();
    m.setTodos(list('a', 'b'));
    m.assign('a', 3);
    m.assign('b', 3);
    m.swap('a', 'b');
    expect(titles(m.getState())[3]).toEqual(['B', 'A']);
  });

  it('clear() moves everything to Unassigned, away tasks included (FR-12)', () => {
    const m = createModel();
    m.setTodos(list('a', 'b'));
    m.assign('a', 1);
    m.assign('b', 3);
    m.setTodos(list('a'));
    m.clear();
    m.setTodos(list('a', 'b'));
    expect(titles(m.getState()).u).toEqual(['A', 'B']);
  });
});

describe('resetDaily (FR-14)', () => {
  it('returns yesterday’s assignments to Unassigned and keeps today’s', () => {
    const c = clock();
    const m = createModel({ now: c.now, resetDaily: true });
    m.setTodos(list('a', 'b'));
    m.assign('a', 1);
    m.setTodos(list('a', 'b'));
    expect(m.bucketOf('a')).toBe('1');
    c.advanceDays(1);
    m.assign('b', 3);
    m.setTodos(list('a', 'b'));
    expect(m.bucketOf('a')).toBeNull();
    expect(m.bucketOf('b')).toBe('3');
  });
});
