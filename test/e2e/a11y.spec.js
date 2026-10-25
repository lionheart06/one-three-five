import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The M3 gate: no WCAG 2.x A/AA violations, in both themes, with every kind of zone content showing.
const bundle = readFileSync(new URL('../../dist/one-three-five.min.js', import.meta.url), 'utf8');
const todos = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, title: `Task ${i}`, url: i === 0 ? 'https://example.com/0' : undefined }));
const html = `<!doctype html><html lang="en"><head><title>a11y</title></head><body><main><div id="board" style="width:720px"></div></main>
<script src="/otf.js"></script>
<script>
  window.board = OneThreeFive.create({ storage: 'memory', mount: '#board', todos: ${JSON.stringify(todos)} });
  window.board.ready.then(() => { board.assign('t0', 1); board.assign('t1', 3); board.assign('t2', 5); });
</script></body></html>`;

for (const colorScheme of ['light', 'dark']) {
  test(`no WCAG A/AA violations (${colorScheme})`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme });
    const p = await context.newPage();
    await p.route('http://otf.test/**', route => {
      const isScript = route.request().url().endsWith('/otf.js');
      route.fulfill({ contentType: isScript ? 'text/javascript' : 'text/html', body: isScript ? bundle : html });
    });
    await p.goto('http://otf.test/');
    await p.evaluate(() => window.board.ready);
    await p.locator('.card[data-key="t0"]').focus();
    // Transient states get audited too: a drop target, the task a drop would bump, the clear confirmation.
    await p.locator('button.clear').click();
    await p.evaluate(() => {
      const shadow = document.querySelector('.one-three-five').shadowRoot;
      shadow.querySelector('.zone[data-zone="1"]').classList.add('drop-target');
      shadow.querySelector('.card[data-key="t0"]').classList.add('will-drop');
      shadow.querySelector('.card[data-key="t1"]').classList.add('swap-target');
    });

    const results = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const summary = results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`);
    expect(summary).toEqual([]);
    await context.close();
  });
}
