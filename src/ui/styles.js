// Lives inside the board's shadow root, so nothing here reaches the host page and vice versa.
// Authors theme the board by setting --otf-* properties on the .one-three-five host element.

export const css = `
:host {
  all: initial;
  display: block;
  --otf-bg: #ffffff;
  --otf-surface: #f5f6f8;
  --otf-card: #ffffff;
  --otf-border: #d6dae0;
  --otf-text: #1c2027;
  --otf-muted: #5c6370;
  --otf-accent: #2563d9;
  --otf-accent-soft: rgba(37, 99, 217, 0.12);
  --otf-warn: #b4470f;
  --otf-warn-soft: rgba(180, 71, 15, 0.12);
  --otf-radius: 8px;
  --otf-pool-height: 28rem;
}
:host([hidden]) { display: none; }

@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
    --otf-bg: #17191d;
    --otf-surface: #1f2228;
    --otf-card: #272b32;
    --otf-border: #3a3f48;
    --otf-text: #e7e9ed;
    --otf-muted: #a1a8b3;
    --otf-accent: #6ea0ff;
    --otf-accent-soft: rgba(110, 160, 255, 0.16);
    --otf-warn: #f59e5b;
    --otf-warn-soft: rgba(245, 158, 91, 0.16);
  }
}
:host([data-theme="dark"]) {
  --otf-bg: #17191d;
  --otf-surface: #1f2228;
  --otf-card: #272b32;
  --otf-border: #3a3f48;
  --otf-text: #e7e9ed;
  --otf-muted: #a1a8b3;
  --otf-accent: #6ea0ff;
  --otf-accent-soft: rgba(110, 160, 255, 0.16);
  --otf-warn: #f59e5b;
  --otf-warn-soft: rgba(245, 158, 91, 0.16);
}

* { box-sizing: border-box; }

/* Page CSS can still hit the host element (a "* { color: red !important }" rule does), so
   everything the cards inherit, and the container for the narrow layout, is set here instead. */
.board {
  display: block;
  container-type: inline-size;
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--otf-text);
  text-align: left;
  background: var(--otf-bg);
  border: 1px solid var(--otf-border);
  border-radius: calc(var(--otf-radius) + 4px);
  padding: 12px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.header h2 { margin: 0; font-size: 15px; font-weight: 600; }
.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }

button {
  font: inherit;
  font-size: 12.5px;
  color: var(--otf-muted);
  background: none;
  border: 1px solid var(--otf-border);
  border-radius: 6px;
  padding: 3px 10px;
  cursor: pointer;
}
button:hover { color: var(--otf-text); }
button.confirm { color: var(--otf-warn); border-color: var(--otf-warn); }

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
.buckets { display: grid; gap: 12px; }

@container (max-width: 479px) {
  .grid { grid-template-columns: minmax(0, 1fr); }
}

.zone {
  background: var(--otf-surface);
  border: 1px solid var(--otf-border);
  border-radius: var(--otf-radius);
  padding: 8px;
  transition: border-color 0.12s, background 0.12s;
}
.zone.drop-target { border-color: var(--otf-accent); background: var(--otf-accent-soft); }

.zone h3 {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}
.zone h3 .badge {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: var(--otf-accent);
  color: var(--otf-bg);
  font-size: 12px;
}
.zone h3 .count { margin-left: auto; font-weight: 400; color: var(--otf-muted); font-variant-numeric: tabular-nums; }
.zone.full h3 .count { color: var(--otf-text); }

.cards { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; min-height: 36px; }
.unassigned .cards { max-height: var(--otf-pool-height); overflow-y: auto; }

.card {
  display: flex;
  align-items: center;
  min-height: 36px;
  padding: 7px 10px;
  background: var(--otf-card);
  border: 1px solid var(--otf-border);
  border-radius: 6px;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: pan-y; /* a swipe scrolls; a long press starts a drag */
  transition: transform 0.12s, box-shadow 0.12s;
}
.card.pressing { transform: scale(0.98); box-shadow: 0 0 0 2px var(--otf-accent); }
.card:focus-visible { outline: 2px solid var(--otf-accent); outline-offset: 1px; }
.card.dragging { opacity: 0.35; }
.card.swap-target { border-color: var(--otf-accent); box-shadow: inset 0 0 0 1px var(--otf-accent); }
.card.will-drop { border-style: dashed; border-color: var(--otf-warn); background: var(--otf-warn-soft); }

.card .text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  color: inherit;
  text-decoration: none;
}
.card a.text:hover { text-decoration: underline; }

.slot {
  min-height: 36px;
  border: 1px dashed var(--otf-border);
  border-radius: 6px;
}

.empty { color: var(--otf-muted); font-size: 12.5px; padding: 8px 2px; }

.ghost {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483647;
  pointer-events: none;
  cursor: grabbing;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  opacity: 0.95;
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
`;
