// Where the record lives: GM storage, localStorage, memory, or a host-supplied adapter.
// Every backend is wrapped so a failure warns once and the board carries on in memory.

const PREFIX = 'one-three-five';

/* global GM_getValue, GM_setValue, GM */

// Userscript managers expose GM_* as script-scope identifiers, not window properties,
// so detection has to use bare `typeof` checks rather than globalThis lookups.
function gmAdapter() {
  if (typeof GM_getValue === 'function' && typeof GM_setValue === 'function') {
    return { get: k => GM_getValue(k, null), set: (k, v) => GM_setValue(k, v) };
  }
  if (typeof GM === 'object' && GM && typeof GM.getValue === 'function' && typeof GM.setValue === 'function') {
    return { get: k => GM.getValue(k, null), set: (k, v) => GM.setValue(k, v) };
  }
  return null;
}

function localAdapter() {
  try {
    const ls = globalThis.localStorage; // the getter itself throws in some sandboxed iframes
    if (!ls) return null;
    return { get: k => ls.getItem(k), set: (k, v) => ls.setItem(k, v) };
  } catch {
    return null;
  }
}

function memoryAdapter() {
  const data = new Map();
  return { get: k => data.get(k) ?? null, set: (k, v) => void data.set(k, v) };
}

function isAdapter(value) {
  return Boolean(value) && typeof value.get === 'function' && typeof value.set === 'function';
}

// Returns { adapter, kind }; kind is what was actually chosen, after fallbacks.
export function resolveAdapter(option = 'auto') {
  if (isAdapter(option)) return { adapter: option, kind: 'custom' };
  if (option === 'memory') return { adapter: memoryAdapter(), kind: 'memory' };

  const gm = option === 'auto' || option === 'gm' ? gmAdapter() : null;
  if (gm) return { adapter: gm, kind: 'gm' };
  const local = option === 'auto' || option === 'local' || option === 'gm' ? localAdapter() : null;
  if (local) return { adapter: local, kind: 'local' };
  return { adapter: memoryAdapter(), kind: 'memory' };
}

// GM storage is shared by every site the script runs on, so its key carries the origin
// to keep boards per site. localStorage is already per origin.
export function storageKey(kind, listId, origin = globalThis.location?.origin ?? '') {
  return kind === 'gm' ? `${PREFIX}:${origin}:${listId}` : `${PREFIX}:${listId}`;
}

export function createStore(option, { listId, warn, origin }) {
  const requested = option ?? 'auto';
  const { adapter, kind } = resolveAdapter(requested);
  if (requested === 'gm' && kind !== 'gm') warn(`GM storage was requested but is not granted; using ${kind} storage.`);
  const key = storageKey(kind, listId, origin);

  let failed = false;
  let queue = Promise.resolve();

  function fail(err) {
    if (failed) return;
    failed = true;
    warn(`Storage is unavailable (${err?.message ?? err}); the board is kept in memory only.`);
  }

  return {
    kind,
    key,
    async load() {
      let raw;
      try {
        raw = await adapter.get(key);
      } catch (err) {
        fail(err);
        return null;
      }
      if (raw == null) return null;
      if (typeof raw !== 'string') return raw;
      try {
        return JSON.parse(raw);
      } catch {
        warn('Stored board data was unreadable and has been reset.');
        return null;
      }
    },
    // Writes are chained so an async adapter can never land them out of order.
    save(record) {
      if (failed) return queue;
      const value = JSON.stringify(record);
      queue = queue.then(async () => {
        if (failed) return;
        try {
          await adapter.set(key, value);
        } catch (err) {
          fail(err);
        }
      });
      return queue;
    },
  };
}
