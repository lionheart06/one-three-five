// The DOM board: renders the model into a shadow root inside the client's mount element,
// and turns pointer drags and key presses into board.assign() / board.swap() calls.

import { css } from './styles.js';

const ZONES = ['1', '3', '5', 'u'];
const LABELS = { 1: 'Big task', 3: 'Medium tasks', 5: 'Small tasks', u: 'Unassigned' };
const MOVE_KEYS = { 1: '1', 3: '3', 5: '5', 0: null };
const DRAG_THRESHOLD = 4; // px of movement before a press becomes a drag, so clicks still work
const CLEAR_CONFIRM_MS = 3000;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (name === 'class') node.className = value;
    else node.setAttribute(name, value === true ? '' : String(value));
  }
  node.append(...children);
  return node;
}

function adoptStyles(shadow) {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    shadow.append(el('style', {}, css));
  }
}

// Only http(s) links become anchors; a javascript: URL from a scraped page must never be clickable.
function safeUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(String(url), document.baseURI);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

const isNode = value => Boolean(value) && typeof value === 'object' && typeof value.nodeType === 'number';

export function resolveMount(mount) {
  const target = typeof mount === 'string' ? document.querySelector(mount) : mount;
  if (!isNode(target) || typeof target.appendChild !== 'function') {
    const what = typeof mount === 'string' ? `"${mount}" matched no element` : 'must be an element or a CSS selector';
    throw new TypeError(`one-three-five: mount ${what}.`);
  }
  return target;
}

export function createView(board, { mount, capacities, theme, renderTask }) {
  const host = el('div', { class: 'one-three-five' });
  if (theme === 'light' || theme === 'dark') host.dataset.theme = theme;
  const shadow = host.attachShadow({ mode: 'open' });
  adoptStyles(shadow);

  const live = el('div', { class: 'sr', 'aria-live': 'polite' });
  const help = el('div', { class: 'sr', id: 'otf-help' }, 'Press 1, 3 or 5 to move this task to that bucket, 0 to unassign it. Arrow keys move between tasks.');
  const clearButton = el('button', { type: 'button', class: 'clear' }, 'Clear day');

  const zones = {};
  for (const zone of ZONES) {
    const headingId = `otf-zone-${zone}`;
    const count = el('span', { class: 'count' });
    const heading = el('h3', { id: headingId }, ...(zone === 'u' ? [] : [el('span', { class: 'badge', 'aria-hidden': 'true' }, zone)]), LABELS[zone], count);
    const list = el('ol', { class: 'cards', 'aria-labelledby': headingId });
    const section = el('section', { class: `zone${zone === 'u' ? ' unassigned' : ''}`, 'data-zone': zone }, heading, list);
    zones[zone] = { section, list, count };
  }

  const root = el(
    'div',
    { class: 'board' },
    el('div', { class: 'header' }, el('h2', {}, 'Today'), clearButton),
    el('div', { class: 'grid' }, el('div', { class: 'buckets' }, zones[1].section, zones[3].section, zones[5].section), zones.u.section),
    help,
    live,
  );
  shadow.append(root);
  mount.appendChild(host);

  let ready = false;
  let destroyed = false;
  let renderPending = false;
  let focusKey = null;
  let titles = new Map(); // key -> title, for announcements
  let drag = null;
  let suppressClick = false;
  let clearTimer = null;

  const cardFor = key => [...shadow.querySelectorAll('.card')].find(c => c.dataset.key === key) ?? null;
  const titleOf = key => titles.get(key) || 'Task';

  function card(todo) {
    const key = board.keyOf(todo);
    const title = String(todo.title ?? '');
    titles.set(key, title);
    const item = el('li', { class: 'card', tabindex: '0', 'data-key': key, 'aria-describedby': 'otf-help' });

    let custom = null;
    if (renderTask) {
      try {
        custom = renderTask(todo);
      } catch (err) {
        console.error('[one-three-five] renderTask failed:', err);
      }
    }
    if (isNode(custom)) {
      item.append(custom);
      return item;
    }

    const text = custom != null ? String(custom) : title;
    const url = safeUrl(todo.url);
    item.title = text;
    item.append(url ? el('a', { class: 'text', href: url, target: '_blank', rel: 'noopener noreferrer', tabindex: '-1' }, text) : el('span', { class: 'text' }, text));
    return item;
  }

  function render() {
    if (!ready || destroyed) return;
    // A drag holds references to the current cards; re-render once it ends.
    if (drag) {
      renderPending = true;
      return;
    }
    const focused = shadow.activeElement?.closest?.('.card');
    if (!focusKey && focused) focusKey = focused.dataset.key;

    const state = board.getState();
    titles = new Map();
    for (const zone of ZONES) {
      const { section, list, count } = zones[zone];
      const todos = zone === 'u' ? state.unassigned : state.buckets[zone];
      list.replaceChildren(...todos.map(card));
      if (zone === 'u') {
        count.textContent = String(todos.length);
        if (!todos.length) list.append(el('li', { class: 'empty' }, 'Nothing left to place.'));
      } else {
        const capacity = capacities[zone];
        for (let i = todos.length; i < capacity; i++) list.append(el('li', { class: 'slot', 'aria-hidden': 'true' }));
        count.textContent = `${todos.length} / ${capacity}`;
        section.classList.toggle('full', todos.length >= capacity);
      }
    }

    if (focusKey) {
      cardFor(focusKey)?.focus({ preventScroll: true });
      focusKey = null;
    }
  }

  // Messages raised in one tick (a move plus the task it bumped) are read out together.
  let pendingMessages = [];
  function announce(message) {
    if (!pendingMessages.length) {
      queueMicrotask(() => {
        live.textContent = pendingMessages.join(' ');
        pendingMessages = [];
      });
    }
    pendingMessages.push(message);
  }

  const onAssign = ({ key, to }) => announce(`Moved “${titleOf(key)}” to ${to ? `bucket ${to}` : 'Unassigned'}.`);
  const onFull = ({ bucket, dropped }) => announce(`Bucket ${bucket} was full, so ${dropped.map(k => `“${titleOf(k)}”`).join(', ')} moved to Unassigned.`);
  board.on('change', render);
  board.on('assign', onAssign);
  board.on('full', onFull);

  // ---- keyboard ----

  function moveFocus(from, step) {
    const cards = [...shadow.querySelectorAll('.card')];
    cards[cards.indexOf(from) + step]?.focus();
  }

  function jumpZone(from, step) {
    const zone = from.closest('.zone').dataset.zone;
    for (let i = ZONES.indexOf(zone) + step; i >= 0 && i < ZONES.length; i += step) {
      const first = zones[ZONES.at(i)].list.querySelector('.card');
      if (first) return first.focus();
    }
  }

  function onKeyDown(event) {
    if (drag && event.key === 'Escape') {
      event.preventDefault();
      endDrag();
      return;
    }
    const target = event.target.closest?.('.card');
    if (!target || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = target.dataset.key;
    let handled = true;

    if (Object.hasOwn(MOVE_KEYS, event.key)) {
      const to = MOVE_KEYS[event.key];
      if (board.bucketOf(key) !== to) {
        focusKey = key;
        board.assign(key, to);
      }
    } else if (event.key === 'ArrowDown') moveFocus(target, 1);
    else if (event.key === 'ArrowUp') moveFocus(target, -1);
    else if (event.key === 'ArrowRight') jumpZone(target, 1);
    else if (event.key === 'ArrowLeft') jumpZone(target, -1);
    else if (event.key === 'Enter') target.querySelector('a.text')?.click();
    else handled = false;

    // Keep the host page's own shortcuts (many sites bind 1-9) from firing too.
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  // ---- pointer drag ----
  // Pointer Events rather than HTML5 drag-and-drop: one code path for mouse, touch and pen,
  // and host pages that cancel dragstart cannot break it.

  function onPointerDown(event) {
    if (drag || event.button !== 0) return;
    const source = event.target.closest?.('.card');
    if (!source) return;
    drag = { key: source.dataset.key, source, pointerId: event.pointerId, x0: event.clientX, y0: event.clientY, active: false, ghost: null, target: null };
    source.setPointerCapture?.(event.pointerId);
  }

  function startDrag() {
    const rect = drag.source.getBoundingClientRect();
    drag.active = true;
    drag.dx = drag.x0 - rect.left;
    drag.dy = drag.y0 - rect.top;
    const ghost = drag.source.cloneNode(true);
    ghost.classList.add('ghost');
    ghost.removeAttribute('tabindex');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${rect.width}px`;
    root.append(ghost);
    drag.ghost = ghost;
    drag.source.classList.add('dragging');
  }

  function hitTest(x, y) {
    const hit = shadow.elementFromPoint?.(x, y);
    if (!hit) return null;
    const over = hit.closest('.card');
    if (over === drag.source) return null;
    if (over) return { kind: 'swap', key: over.dataset.key, card: over };

    const zoneEl = hit.closest('.zone');
    if (!zoneEl) return null;
    const zone = zoneEl.dataset.zone;
    const others = [...zones[zone].list.querySelectorAll('.card')].filter(c => c !== drag.source);
    const index = others.filter(c => {
      const r = c.getBoundingClientRect();
      return r.top + r.height / 2 < y;
    }).length;
    // In a full bucket the new task stays and the last one is pushed out (FR-4): mark it.
    const willDrop = zone !== 'u' && others.length >= capacities[zone] ? others.at(capacities[zone] - 1) : null;
    return { kind: 'insert', zone, index, zoneEl, willDrop };
  }

  function showTarget(next) {
    const prev = drag.target;
    prev?.card?.classList.remove('swap-target');
    prev?.zoneEl?.classList.remove('drop-target');
    prev?.willDrop?.classList.remove('will-drop');
    next?.card?.classList.add('swap-target');
    next?.zoneEl?.classList.add('drop-target');
    next?.willDrop?.classList.add('will-drop');
    drag.target = next;
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.x0, event.clientY - drag.y0) < DRAG_THRESHOLD) return;
      startDrag();
    }
    event.preventDefault();
    drag.ghost.style.transform = `translate(${event.clientX - drag.dx}px, ${event.clientY - drag.dy}px)`;
    showTarget(hitTest(event.clientX, event.clientY));
  }

  function endDrag() {
    if (!drag) return null;
    const ended = { ...drag }; // a copy: clearing the highlight below resets drag.target
    showTarget(null);
    ended.ghost?.remove();
    ended.source.classList.remove('dragging');
    if (ended.source.hasPointerCapture?.(ended.pointerId)) ended.source.releasePointerCapture(ended.pointerId);
    drag = null;
    if (renderPending) {
      renderPending = false;
      render();
    }
    return ended;
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { active, target, key } = endDrag();
    if (!active) return;

    // The click that follows a drag must not open the card's link.
    suppressClick = true;
    setTimeout(() => (suppressClick = false));

    focusKey = key;
    if (target?.kind === 'swap') board.swap(key, target.key);
    else if (target?.kind === 'insert' && target.zone !== 'u') board.assign(key, target.zone, target.index);
    else if (target?.kind === 'insert' && board.bucketOf(key)) board.assign(key, null);
    else focusKey = null;
  }

  function onPointerCancel(event) {
    if (drag && event.pointerId === drag.pointerId) endDrag();
  }

  function onClickCapture(event) {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  // ---- clear day (two clicks, so one stray click cannot wipe the plan) ----

  function resetClear() {
    clearTimeout(clearTimer);
    clearButton.classList.remove('confirm');
    clearButton.textContent = 'Clear day';
  }

  function onClear() {
    if (!clearButton.classList.contains('confirm')) {
      clearButton.classList.add('confirm');
      clearButton.textContent = 'Click again to clear';
      clearTimer = setTimeout(resetClear, CLEAR_CONFIRM_MS);
      return;
    }
    resetClear();
    board.clear();
    announce('All tasks moved to Unassigned.');
  }

  shadow.addEventListener('keydown', onKeyDown);
  shadow.addEventListener('pointerdown', onPointerDown);
  shadow.addEventListener('pointermove', onPointerMove);
  shadow.addEventListener('pointerup', onPointerUp);
  shadow.addEventListener('pointercancel', onPointerCancel);
  shadow.addEventListener('click', onClickCapture, true);
  clearButton.addEventListener('click', onClear);

  board.ready.then(() => {
    ready = true;
    render();
  });

  return {
    host,
    shadow,
    render,
    show: () => (host.hidden = false),
    hide: () => (host.hidden = true),
    destroy() {
      destroyed = true;
      endDrag();
      resetClear();
      board.off('change', render);
      board.off('assign', onAssign);
      board.off('full', onFull);
      host.remove();
    },
  };
}
