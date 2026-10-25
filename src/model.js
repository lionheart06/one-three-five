// The board's rules, with no DOM and no storage: reconcile, capacity, moves and swaps.
// Every mutation works on `record`, the exact object that gets persisted.

import { defaultGetKey, normalizeTodo } from './keys.js';
import { daysBetween, localDate } from './dates.js';

export const BUCKETS = ['1', '3', '5'];
export const SCHEMA_VERSION = 1;

const DEFAULT_CAPACITIES = { 1: 1, 3: 3, 5: 5 };
const DEFAULT_RETENTION_DAYS = 14;

export function emptyRecord() {
  return { v: SCHEMA_VERSION, tasks: {} };
}

export function isValidRecord(value) {
  return Boolean(value) && value.v === SCHEMA_VERSION && Boolean(value.tasks) && typeof value.tasks === 'object';
}

// Accepts '1' | 1 | '3' | ... for buckets, and null | undefined | 0 | '0' for Unassigned.
// Returns undefined for anything else.
export function normalizeBucket(bucket) {
  if (bucket === null || bucket === undefined || bucket === 0 || bucket === '0') return null;
  const b = String(bucket);
  return BUCKETS.includes(b) ? b : undefined;
}

export function createModel(options = {}) {
  const capacities = { ...DEFAULT_CAPACITIES, ...options.capacities };
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const resetDaily = Boolean(options.resetDaily);
  const getKey = options.getKey ?? defaultGetKey;
  const now = options.now ?? Date.now;

  let record = emptyRecord();
  let todos = new Map(); // key -> todo, in the order the host supplied them

  const today = () => localDate(now());
  const stamp = () => new Date(now()).toISOString();
  const capacityOf = bucket => capacities[bucket];
  const byOrder = (a, b) => record.tasks[a].order - record.tasks[b].order;
  const byAssignedAt = (a, b) => record.tasks[a].assignedAt.localeCompare(record.tasks[b].assignedAt);

  // Keys on the board in `bucket`, in display order. Away tasks hold no slot.
  function membersOf(bucket) {
    return [...todos.keys()].filter(k => record.tasks[k]?.bucket === bucket).sort(byOrder);
  }

  function renumber(keys) {
    keys.forEach((k, i) => {
      record.tasks[k].order = i;
    });
  }

  // Writes key's record into a slot, or deletes it for Unassigned (Unassigned is never stored).
  function place(key, slot) {
    if (!slot) {
      delete record.tasks[key];
      return;
    }
    const prev = record.tasks[key];
    record.tasks[key] = {
      bucket: slot.bucket,
      order: slot.order,
      assignedAt: prev?.bucket === slot.bucket ? prev.assignedAt : stamp(),
      lastSeen: today(),
      title: todos.get(key).title,
    };
  }

  function slotOf(key) {
    const t = record.tasks[key];
    return t && BUCKETS.includes(t.bucket) ? { bucket: t.bucket, order: t.order } : null;
  }

  // Replace the list and reconcile it with the stored record (PRD "Reconcile on setTodos").
  function setTodos(list) {
    const warnings = [];
    const overflowed = [];
    const next = new Map();

    for (const raw of list ?? []) {
      const todo = normalizeTodo(raw);
      if (!todo) {
        warnings.push(`Ignored a todo that is neither a string nor an object: ${String(raw)}`);
        continue;
      }
      const key = String(getKey(todo));
      if (next.has(key)) {
        warnings.push(`Duplicate task key "${key}"; kept the first one.`);
        continue;
      }
      next.set(key, todo);
    }
    todos = next;

    const day = today();
    const tasks = record.tasks;

    if (resetDaily) {
      for (const [key, t] of Object.entries(tasks)) {
        if (localDate(Date.parse(t.assignedAt)) < day) delete tasks[key];
      }
    }

    for (const bucket of BUCKETS) {
      const staying = [];
      const returning = [];
      for (const key of todos.keys()) {
        const t = tasks[key];
        if (t?.bucket !== bucket) continue;
        (t.away ? returning : staying).push(key);
      }

      // Too many for the bucket (capacities changed, or an import): earliest-assigned win.
      staying.sort(byOrder);
      let kept = staying;
      if (staying.length > capacityOf(bucket)) {
        const winners = new Set([...staying].sort(byAssignedAt).slice(0, capacityOf(bucket)));
        kept = staying.filter(k => winners.has(k));
        for (const k of staying) {
          if (!winners.has(k)) {
            delete tasks[k];
            overflowed.push({ key: k, bucket });
          }
        }
      }

      // A task back from being away only takes a free slot; it never displaces one placed meanwhile.
      returning.sort(byAssignedAt);
      for (const k of returning) {
        if (kept.length < capacityOf(bucket)) {
          kept.push(k);
        } else {
          delete tasks[k];
          overflowed.push({ key: k, bucket });
        }
      }
      renumber(kept);
    }

    // Present tasks restart their retention clock; missing ones go away and expire after retentionDays.
    for (const [key, t] of Object.entries(tasks)) {
      if (todos.has(key)) {
        t.lastSeen = day;
        delete t.away;
        t.title = todos.get(key).title ?? t.title;
      } else {
        t.away = true;
        if (daysBetween(t.lastSeen, day) > retentionDays) delete tasks[key];
      }
    }

    return { warnings, overflowed };
  }

  // Move key into bucket (null = Unassigned) at index. Dropping into a full bucket is accepted:
  // the moved task stays and the tasks past capacity drop to Unassigned (FR-4).
  function assign(key, bucket, index) {
    const to = normalizeBucket(bucket);
    if (!todos.has(key) || to === undefined) return { ok: false, dropped: [] };

    const from = slotOf(key)?.bucket ?? null;
    if (to === null) {
      place(key, null);
      if (from) renumber(membersOf(from));
      return { ok: true, from, to, dropped: [] };
    }

    const members = membersOf(to).filter(k => k !== key);
    const capacity = capacityOf(to);
    let at = index == null ? members.length : Math.max(0, Math.min(index, members.length));
    if (members.length >= capacity) at = Math.min(at, capacity - 1);
    members.splice(at, 0, key);
    const dropped = members.splice(capacity);

    place(key, { bucket: to, order: at });
    for (const k of dropped) place(k, null);
    renumber(members);
    if (from && from !== to) renumber(membersOf(from));

    return { ok: true, from, to, dropped };
  }

  // Two tasks trade places, across any zones, Unassigned included (FR-5).
  function swap(a, b) {
    if (a === b || !todos.has(a) || !todos.has(b)) return false;
    const slotA = slotOf(a);
    const slotB = slotOf(b);
    place(a, slotB);
    place(b, slotA);
    return true;
  }

  function clear() {
    record.tasks = {};
  }

  function getState() {
    const buckets = {};
    for (const bucket of BUCKETS) buckets[bucket] = membersOf(bucket).map(k => todos.get(k));
    const unassigned = [...todos.keys()].filter(k => !slotOf(k)).map(k => todos.get(k));
    return { buckets, unassigned };
  }

  // Replaces the record wholesale; the caller re-runs setTodos to reconcile it with the list.
  function load(value) {
    record = isValidRecord(value) ? structuredClone(value) : emptyRecord();
  }

  return {
    setTodos,
    assign,
    swap,
    clear,
    getState,
    load,
    capacities: Object.freeze(Object.fromEntries(BUCKETS.map(b => [b, capacityOf(b)]))),
    getRecord: () => record,
    getTodos: () => [...todos.values()],
    keyOf: todo => String(getKey(normalizeTodo(todo))),
    bucketOf: key => slotOf(key)?.bucket ?? null,
  };
}
