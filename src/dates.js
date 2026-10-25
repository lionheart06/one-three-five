const pad = n => String(n).padStart(2, '0');

// The user's local calendar day as YYYY-MM-DD.
export function localDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Whole days from one YYYY-MM-DD to another. Both parse as UTC midnight, so DST cannot skew it.
export function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 864e5);
}
