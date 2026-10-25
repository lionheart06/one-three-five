import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Serve the built bundle on a fake origin so localStorage works and nothing needs a server.
const ORIGIN = 'http://otf.test';
const bundle = readFileSync(new URL('../../dist/one-three-five.min.js', import.meta.url), 'utf8');

const page = (todos, extraHead = '') => `<!doctype html><html><head>${extraHead}</head><body style="margin:0;padding:16px">
<div id="board" style="width:720px"></div>
<script src="/otf.js"></script>
<script>
  window.board = OneThreeFive.create({ listId: 'e2e', mount: '#board', todos: ${JSON.stringify(todos)} });
</script></body></html>`;

const todos = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, title: `Task ${id.toUpperCase()}` }));

async function open(p, { html = page(todos) } = {}) {
  await p.route(`${ORIGIN}/**`, route => {
    const isScript = route.request().url().endsWith('/otf.js');
    route.fulfill({ contentType: isScript ? 'text/javascript' : 'text/html', body: isScript ? bundle : html });
  });
  await p.goto(`${ORIGIN}/`);
  await p.evaluate(() => window.board.ready);
}

// Playwright locators pierce open shadow roots, so these reach inside the board.
const card = (p, id) => p.locator(`.card[data-key="${id}"]`);
const zone = (p, z) => p.locator(`.zone[data-zone="${z}"]`);
const keysIn = (p, z) => zone(p, z).locator('.card').evaluateAll(cards => cards.map(c => c.dataset.key));

async function drag(p, from, to, { hold } = {}) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await p.mouse.down();
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  if (hold) await hold();
  await p.mouse.up();
}

test('drags a task from Unassigned into a bucket', async ({ page: p }) => {
  await open(p);
  await drag(p, card(p, 'a'), zone(p, '3').locator('.slot').first());
  expect(await keysIn(p, '3')).toEqual(['a']);
  await expect(zone(p, '3').locator('.count')).toHaveText('1 / 3');
});

test('a drop into a full bucket keeps the new task and bumps the last one, marked while hovering', async ({ page: p }) => {
  await open(p);
  await p.evaluate(() => ['a', 'b', 'c'].forEach(k => window.board.assign(k, 3)));
  await drag(p, card(p, 'd'), zone(p, '3').locator('h3'), {
    hold: async () => {
      await expect(zone(p, '3')).toHaveClass(/drop-target/);
      await expect(card(p, 'c')).toHaveClass(/will-drop/);
    },
  });
  expect(await keysIn(p, '3')).toEqual(['d', 'a', 'b']);
  expect(await keysIn(p, 'u')).toContain('c');
});

test('dropping a task on another task swaps them across zones', async ({ page: p }) => {
  await open(p);
  await p.evaluate(() => {
    window.board.assign('a', 1);
    window.board.assign('b', 5);
  });
  await drag(p, card(p, 'a'), card(p, 'b'));
  expect(await keysIn(p, '1')).toEqual(['b']);
  expect(await keysIn(p, '5')).toEqual(['a']);
});

test('reorders within a bucket by dropping between tasks', async ({ page: p }) => {
  await open(p);
  await p.evaluate(() => ['a', 'b', 'c'].forEach(k => window.board.assign(k, 5)));
  // Drop on the empty slot below the three cards: 'a' moves to the end.
  await drag(p, card(p, 'a'), zone(p, '5').locator('.slot').first());
  expect(await keysIn(p, '5')).toEqual(['b', 'c', 'a']);
});

test('a short press is a click, not a drag, and opens nothing', async ({ page: p }) => {
  await open(p);
  const box = await card(p, 'a').boundingBox();
  await p.mouse.click(box.x + 10, box.y + 10);
  expect(await keysIn(p, 'u')).toEqual(['a', 'b', 'c', 'd', 'e']);
});

test('drags with touch', async ({ page: p, browserName }) => {
  test.skip(browserName !== 'chromium', 'uses the Chrome DevTools Protocol');
  await open(p);
  const cdp = await p.context().newCDPSession(p);
  const a = await card(p, 'b').boundingBox();
  const b = await zone(p, '1').locator('.slot').boundingBox();
  const point = (x, y) => ({ touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', ...point(a.x + 20, a.y + 15) });
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', ...point(a.x + 20 + (b.x - a.x) * t, a.y + 15 + (b.y - a.y) * t) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await keysIn(p, '1')).toEqual(['b']);
});

test('the plan survives a reload', async ({ page: p }) => {
  await open(p);
  await drag(p, card(p, 'c'), zone(p, '1').locator('.slot'));
  await p.reload();
  await p.evaluate(() => window.board.ready);
  expect(await keysIn(p, '1')).toEqual(['c']);
});

test('host-page CSS does not leak into the board', async ({ page: p }) => {
  const hostile = '<style>* { display: inline !important; color: rgb(255, 0, 0) !important; font-size: 40px !important; } li { list-style: disc !important; }</style>';
  await open(p, { html: page(todos, hostile) });
  const style = await card(p, 'a').evaluate(el => {
    const s = getComputedStyle(el);
    return { display: s.display, color: s.color, fontSize: s.fontSize };
  });
  expect(style.display).toBe('flex');
  expect(style.color).not.toBe('rgb(255, 0, 0)');
  expect(style.fontSize).toBe('14px');
});

test('stacks into one column in a narrow container', async ({ page: p }) => {
  await open(p);
  await p.locator('#board').evaluate(el => (el.style.width = '360px'));
  const one = await zone(p, '1').boundingBox();
  const pool = await zone(p, 'u').boundingBox();
  expect(pool.y).toBeGreaterThan(one.y + one.height);
  expect(Math.abs(pool.x - one.x)).toBeLessThan(2);
});
