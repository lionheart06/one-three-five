// ==UserScript==
// @name     My 1-3-5 (floating)
// @match    https://example.com/todos*
// @require  https://lionheart06.github.io/one-three-five/v1.0.0/one-three-five.min.js
// @grant    GM_getValue
// @grant    GM_setValue
// ==/UserScript==

// Floating panel: draggable by its header, collapsible, resizable from the bottom-right corner.
// Position, size and collapsed state are remembered between visits.

const KEY = 'otf-panel';
const st = Object.assign(
  { x: null, y: 80, w: 420, h: 520, collapsed: false },
  GM_getValue(KEY, {}),
);
const save = () => GM_setValue(KEY, st);

const host = document.createElement('div');
host.style.cssText = 'position:fixed;z-index:2147483000;';
document.body.append(host);
const root = host.attachShadow({ mode: 'open' });
root.innerHTML = `
  <style>
    .panel { display:flex; flex-direction:column; background:#fff; color:#111;
             border:1px solid #bbb; border-radius:10px; box-shadow:0 6px 24px #0004;
             font:14px system-ui; overflow:hidden; }
    .bar   { display:flex; align-items:center; gap:8px; padding:6px 10px;
             background:#222; color:#fff; cursor:move; user-select:none; touch-action:none; }
    .bar b { flex:1; }
    .bar button { all:unset; cursor:pointer; padding:2px 8px; }
    .body  { overflow:auto; resize:both; min-width:300px; min-height:160px; }
    .collapsed .body { display:none; }
  </style>
  <div class="panel">
    <div class="bar"><b>1-3-5</b><button aria-label="Collapse" aria-expanded="true">▾</button></div>
    <div class="body"></div>
  </div>`;

const panel = root.querySelector('.panel');
const bar = root.querySelector('.bar');
const btn = root.querySelector('button');
const body = root.querySelector('.body');

const place = () => {
  host.style.left = (st.x ?? Math.max(0, innerWidth - st.w - 24)) + 'px';
  host.style.top = Math.min(st.y, innerHeight - 40) + 'px';
};
const applyCollapsed = () => {
  panel.classList.toggle('collapsed', st.collapsed);
  btn.textContent = st.collapsed ? '▴' : '▾';
  btn.setAttribute('aria-expanded', String(!st.collapsed));
};
body.style.width = st.w + 'px';
body.style.height = st.h + 'px';
place();
applyCollapsed();

btn.onclick = () => { st.collapsed = !st.collapsed; applyCollapsed(); save(); };

// Drag by the header.
bar.onpointerdown = (e) => {
  if (e.target === btn) return;
  const dx = e.clientX - host.offsetLeft, dy = e.clientY - host.offsetTop;
  bar.setPointerCapture(e.pointerId);
  bar.onpointermove = (m) => {
    st.x = Math.max(0, Math.min(innerWidth - 80, m.clientX - dx));
    st.y = Math.max(0, Math.min(innerHeight - 40, m.clientY - dy));
    place();
  };
  bar.onpointerup = () => { bar.onpointermove = bar.onpointerup = null; save(); };
};

// Persist the user's resize (skipped while collapsed, when the size reads 0).
new ResizeObserver(() => {
  if (st.collapsed) return;
  st.w = body.offsetWidth;
  st.h = body.offsetHeight;
  save();
}).observe(body);

const board = OneThreeFive.create({ listId: 'example-todos', mount: body });

board.setTodos([...document.querySelectorAll('.todo')]
  .map(el => ({ id: el.dataset.id, title: el.textContent.trim() })));
