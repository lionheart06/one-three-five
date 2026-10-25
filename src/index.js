// Public entry point: OneThreeFive.create(options) returns a board.
// With `mount` it renders the drag-and-drop board there; without it the board is headless
// (model, persistence and events only), for tests or a host that draws its own UI.

import { createEmitter } from './emitter.js';
import { BUCKETS, createModel, isValidRecord } from './model.js';
import { createStore } from './storage.js';
import { createView, resolveMount } from './ui/view.js';

export { BUCKETS };
// Replaced at build time from package.json; tests run the source directly.
export const version = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';

export function create(options = {}) {
  const listId = String(options.listId ?? 'default');
  // Resolve first, so a wrong selector fails before anything loads or saves.
  const mount = options.mount == null ? null : resolveMount(options.mount);
  const events = createEmitter();
  const warn = message => events.emit('warning', { message });
  const model = createModel(options);
  const store = createStore(options.storage, { listId, warn, origin: options.origin });

  let loaded = false;
  let destroyed = false;
  let hasList = false;

  function emitFull(overflowed) {
    const byBucket = new Map();
    for (const { key, bucket } of overflowed) {
      if (!byBucket.has(bucket)) byBucket.set(bucket, []);
      byBucket.get(bucket).push(key);
    }
    for (const [bucket, dropped] of byBucket) events.emit('full', { bucket, dropped });
  }

  // Persist, then tell listeners. Nothing is written before the stored record is loaded,
  // so an early setTodos() can never overwrite saved assignments.
  function commit() {
    if (loaded) store.save(model.getRecord());
    events.emit('change', model.getState());
  }

  function reconcile(list) {
    const { warnings, overflowed } = model.setTodos(list);
    warnings.forEach(warn);
    emitFull(overflowed);
  }

  // Mutations need the stored record first, or they would be lost when it loads.
  function guard(action) {
    if (destroyed) return false;
    if (!loaded) {
      warn(`${action}() was called before the board was ready; await board.ready first.`);
      return false;
    }
    return true;
  }

  const ready = store.load().then(stored => {
    if (destroyed) return;
    if (stored !== null && !isValidRecord(stored)) warn('Stored board data has an unknown format and has been reset.');
    model.load(stored);
    loaded = true;
    if (hasList) {
      reconcile(model.getTodos());
      commit();
    }
  });

  const board = {
    ready,
    listId,
    get storage() {
      return store.kind;
    },

    setTodos(list) {
      if (destroyed) return;
      if (!Array.isArray(list)) {
        warn('setTodos() expects an array.');
        return;
      }
      hasList = true;
      reconcile(list);
      commit();
    },

    assign(key, bucket, index) {
      if (!guard('assign')) return false;
      const result = model.assign(String(key), bucket, index);
      if (!result.ok) return false;
      events.emit('assign', { key: String(key), from: result.from, to: result.to });
      if (result.dropped.length) events.emit('full', { bucket: result.to, dropped: result.dropped });
      commit();
      return true;
    },

    swap(keyA, keyB) {
      if (!guard('swap')) return false;
      const a = String(keyA);
      const b = String(keyB);
      const fromA = model.bucketOf(a);
      const fromB = model.bucketOf(b);
      if (!model.swap(a, b)) return false;
      events.emit('assign', { key: a, from: fromA, to: fromB });
      events.emit('assign', { key: b, from: fromB, to: fromA });
      commit();
      return true;
    },

    clear() {
      if (!guard('clear')) return;
      model.clear();
      commit();
    },

    capacities: model.capacities,
    getState: () => model.getState(),
    keyOf: todo => model.keyOf(todo),
    bucketOf: key => model.bucketOf(String(key)),

    export: () => JSON.stringify(model.getRecord()),

    import(json) {
      if (!guard('import')) return false;
      let value;
      try {
        value = typeof json === 'string' ? JSON.parse(json) : json;
      } catch {
        warn('import() was given invalid JSON.');
        return false;
      }
      if (!isValidRecord(value)) {
        warn('import() was given data in an unknown format.');
        return false;
      }
      model.load(value);
      reconcile(model.getTodos());
      commit();
      return true;
    },

    on: (event, fn) => events.on(event, fn),
    off: (event, fn) => events.off(event, fn),

    show: () => view?.show(),
    hide: () => view?.hide(),

    destroy() {
      if (destroyed) return;
      view?.destroy();
      destroyed = true;
      events.clear();
    },
  };

  const view = mount ? createView(board, { mount, capacities: model.capacities, theme: options.theme, renderTask: options.renderTask, listId }) : null;
  if (Array.isArray(options.todos)) board.setTodos(options.todos);
  return board;
}
