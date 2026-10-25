// Task identity: a stable id when the host gives one, else a hash of the title.

export function normalizeTitle(title) {
  return String(title ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// FNV-1a, 32-bit. Small and deterministic; this is identity, not security.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// Accepts a string or an object; anything else is rejected with null.
export function normalizeTodo(todo) {
  if (typeof todo === 'string') return { title: todo };
  if (todo && typeof todo === 'object') return todo;
  return null;
}

export function defaultGetKey(todo) {
  if (todo.id !== undefined && todo.id !== null && todo.id !== '') return String(todo.id);
  return 't:' + hashString(normalizeTitle(todo.title));
}
