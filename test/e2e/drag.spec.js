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

// Touch through the DevTools protocol: real touch events, so the browser decides scroll vs drag.
async function touchDrag(p, from, to, { holdMs = 0 } = {}) {
  const cdp = await p.context().newCDPSession(p);
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  const x0 = a.x + 20, y0 = a.y + 15, x1 = b.x + 20, y1 = b.y + 15;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  if (holdMs) await p.waitForTimeout(holdMs);
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe('touch', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'uses the Chrome DevTools Protocol');

  test('a long press then a move drags the task', async ({ page: p }) => {
    await open(p);
    await touchDrag(p, card(p, 'b'), zone(p, '1').locator('.slot'), { holdMs: 450 });
    expect(await keysIn(p, '1')).toEqual(['b']);
  });

  test('a quick swipe scrolls the list instead of dragging', async ({ page: p }) => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, title: `Task ${i}` }));
    await open(p, { html: page(many) });
    const pool = zone(p, 'u').locator('.cards');
    await touchDrag(p, card(p, 't8'), card(p, 't1'));
    await expect.poll(() => pool.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    expect(await keysIn(p, '1')).toEqual([]);
    expect(await p.evaluate(() => window.board.getState().unassigned.length)).toBe(30);
  });
});

test('exports the plan as a JSON file and imports it back', async ({ page: p }) => {
  await open(p);
  await p.evaluate(() => window.board.assign('a', 1));
  const [download] = await Promise.all([p.waitForEvent('download'), p.locator('button.export').click()]);
  expect(download.suggestedFilename()).toMatch(/^one-three-five-e2e-\d{4}-\d{2}-\d{2}\.json$/);
  const json = readFileSync(await download.path(), 'utf8');
  expect(JSON.parse(json).tasks.a.bucket).toBe('1');

  await p.evaluate(() => window.board.clear());
  expect(await keysIn(p, '1')).toEqual([]);
  await p.locator('input[type="file"]').setInputFiles({ name: 'plan.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(p.locator('button.import')).toHaveText('Imported');
  expect(await keysIn(p, '1')).toEqual(['a']);
});

test('rejects a file that is not a plan and changes nothing', async ({ page: p }) => {
  await open(p);
  await p.evaluate(() => window.board.assign('a', 3));
  await p.locator('input[type="file"]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(p.locator('button.import')).toHaveText('Not a plan file');
  expect(await keysIn(p, '3')).toEqual(['a']);
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
