// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from '../src/index.js';

const list = (...ids) => ids.map(id => ({ id, title: id.toUpperCase() }));
const flush = () => new Promise(r => setTimeout(r));

let mount;
beforeEach(() => {
  mount = document.createElement('div');
  mount.id = 'board';
  document.body.append(mount);
});
afterEach(() => {
  document.body.replaceChildren();
});

async function mountBoard(options = {}) {
  const board = create({ storage: 'memory', mount, ...options });
  await board.ready;
  const shadow = mount.querySelector('.one-three-five').shadowRoot;
  const zone = z => shadow.querySelector(`.zone[data-zone="${z}"]`);
  const cardTitles = z => [...zone(z).querySelectorAll('.card')].map(c => c.textContent);
  const card = key => shadow.querySelector(`.card[data-key="${key}"]`);
  const press = (key, k) => card(key).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true }));
  return { board, shadow, zone, cardTitles, card, press };
}

describe('board view', () => {
  it('renders four zones with counts and empty-slot placeholders', async () => {
    const { board, zone, cardTitles } = await mountBoard({ todos: list('a', 'b', 'c') });
    board.assign('a', 3);
    expect(cardTitles('3')).toEqual(['A']);
    expect(cardTitles('u')).toEqual(['B', 'C']);
    expect(zone('3').querySelector('.count').textContent).toBe('1 / 3');
    expect(zone('3').querySelectorAll('.slot')).toHaveLength(2);
    expect(zone('5').querySelectorAll('.slot')).toHaveLength(5);
    expect(zone('u').querySelector('.count').textContent).toBe('2');
  });

  it('marks a bucket full at capacity', async () => {
    const { board, zone } = await mountBoard({ todos: list('a') });
    board.assign('a', 1);
    expect(zone('1').classList.contains('full')).toBe(true);
  });

  it('accepts a selector as mount and fails loudly when it matches nothing', async () => {
    mount.remove();
    document.body.append(mount);
    const board = create({ storage: 'memory', mount: '#board', todos: ['x'] });
    await board.ready;
    expect(mount.querySelector('.one-three-five')).not.toBeNull();
    expect(() => create({ mount: '#nope' })).toThrow(/"#nope" matched no element/);
  });

  it('moves the focused task with 1, 3, 5 and 0 and keeps focus on it (FR-11)', async () => {
    const { shadow, cardTitles, card, press } = await mountBoard({ todos: list('a', 'b') });
    card('a').focus();
    press('a', '5');
    expect(cardTitles('5')).toEqual(['A']);
    expect(shadow.activeElement?.dataset.key).toBe('a');
    press('a', '1');
    expect(cardTitles('1')).toEqual(['A']);
    press('a', '0');
    expect(cardTitles('u')).toEqual(['A', 'B']);
  });

  it('stops handled keys from reaching host-page shortcuts', async () => {
    const { press } = await mountBoard({ todos: list('a') });
    const pageShortcut = vi.fn();
    document.addEventListener('keydown', pageShortcut);
    press('a', '3');
    expect(pageShortcut).not.toHaveBeenCalled();
    document.removeEventListener('keydown', pageShortcut);
  });

  it('moves focus with the arrow keys', async () => {
    const { board, shadow, card, press } = await mountBoard({ todos: list('a', 'b', 'c') });
    board.assign('a', 1);
    card('a').focus();
    press('a', 'ArrowDown');
    expect(shadow.activeElement.dataset.key).toBe('b');
    press('b', 'ArrowLeft');
    expect(shadow.activeElement.dataset.key).toBe('a');
    press('a', 'ArrowRight');
    expect(shadow.activeElement.dataset.key).toBe('b');
  });

  it('announces moves and bumped tasks in one message', async () => {
    const { shadow, card, press } = await mountBoard({ todos: list('a', 'b') });
    press('a', '1');
    await flush();
    card('b').focus();
    press('b', '1');
    await flush();
    expect(shadow.querySelector('[aria-live]').textContent).toBe('Moved “B” to bucket 1. Bucket 1 was full, so “A” moved to Unassigned.');
  });

  it('links http(s) urls only', async () => {
    const { card } = await mountBoard({
      todos: [
        { id: 'ok', title: 'Safe', url: 'https://example.com/1' },
        { id: 'bad', title: 'Nope', url: 'javascript:alert(1)' },
      ],
    });
    expect(card('ok').querySelector('a').getAttribute('href')).toBe('https://example.com/1');
    expect(card('bad').querySelector('a')).toBeNull();
  });

  it('renders titles as text, never as HTML', async () => {
    const { card } = await mountBoard({ todos: [{ id: 'x', title: '<img src=x onerror=alert(1)>' }] });
    expect(card('x').querySelector('img')).toBeNull();
    expect(card('x').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('uses renderTask for card content', async () => {
    const renderTask = todo => {
      const b = document.createElement('b');
      b.textContent = `#${todo.id}`;
      return b;
    };
    const { card } = await mountBoard({ todos: list('a'), renderTask });
    expect(card('a').querySelector('b').textContent).toBe('#a');
  });

  it('clears the day only on a second click', async () => {
    const { board, shadow, cardTitles } = await mountBoard({ todos: list('a') });
    board.assign('a', 1);
    const button = shadow.querySelector('button.clear');
    button.click();
    expect(cardTitles('1')).toEqual(['A']);
    expect(button.textContent).toBe('Click again to clear');
    button.click();
    expect(cardTitles('1')).toEqual([]);
  });

  it('applies the theme option and hides, shows and destroys', async () => {
    const { board } = await mountBoard({ todos: list('a'), theme: 'dark' });
    const host = mount.querySelector('.one-three-five');
    expect(host.dataset.theme).toBe('dark');
    board.hide();
    expect(host.hidden).toBe(true);
    board.show();
    expect(host.hidden).toBe(false);
    board.destroy();
    expect(mount.querySelector('.one-three-five')).toBeNull();
  });

  it('renders nothing until the stored record has loaded', async () => {
    let resolve;
    const board = create({ mount, storage: { get: () => new Promise(r => (resolve = r)), set() {} }, todos: list('a') });
    const shadow = mount.querySelector('.one-three-five').shadowRoot;
    expect(shadow.querySelectorAll('.card')).toHaveLength(0);
    resolve(JSON.stringify({ v: 1, tasks: { a: { bucket: '5', order: 0, assignedAt: '2026-10-25T08:00:00.000Z', lastSeen: '2026-10-25' } } }));
    await board.ready;
    await flush();
    expect(shadow.querySelector('.zone[data-zone="5"] .card').dataset.key).toBe('a');
  });
});
