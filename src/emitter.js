export function createEmitter() {
  const handlers = new Map();

  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
    },
    off(event, fn) {
      handlers.get(event)?.delete(fn);
    },
    emit(event, payload) {
      // Copy first so a handler can unsubscribe itself; one failing handler must not stop the rest.
      for (const fn of [...(handlers.get(event) ?? [])]) {
        try {
          fn(payload);
        } catch (err) {
          console.error('[one-three-five] event handler failed:', err);
        }
      }
    },
    clear() {
      handlers.clear();
    },
  };
}
