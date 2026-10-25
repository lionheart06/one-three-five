# one-three-five

Drop-in 1-3-5 todo planner for userscripts and web pages. Hand it a list of todos; the user puts
**1** big, **3** medium and **5** small tasks into buckets for today, and the module remembers
where each task went the next time the same list is supplied.

> Status: M3 (polish). Next: the 1.0 release.

## Use in Tampermonkey

```js
// @require  https://cdn.jsdelivr.net/npm/@lionheart06/one-three-five@0.1.0/dist/one-three-five.min.js
// @grant    GM_getValue
// @grant    GM_setValue

const board = OneThreeFive.create({ listId: 'github-issues', mount: '#todo-board' });

board.setTodos([...document.querySelectorAll('.issue-title')]
  .map(el => ({ id: el.dataset.id, title: el.textContent })));

board.on('change', state => console.log(state.buckets));
```

Without `mount` the board is headless: same API and storage, no UI. A full example lives in
[`examples/github-issues.user.js`](examples/github-issues.user.js); `demo/index.html` runs the board
on a plain page after `npm run build`.

## Using the board

- Drag a task into a bucket, onto another task to swap the two, or between tasks to reorder.
  On touch screens, press and hold a task to pick it up; a quick swipe scrolls as usual.
- With a task focused: `1`, `3`, `5` move it to that bucket, `0` back to Unassigned, arrow keys move focus.
- "Clear day" moves everything back to Unassigned (it asks for a second click).
- "Export" downloads the plan as JSON; "Import" loads one back (useful to move it between browsers).
- Theme follows the system; force it with `theme: 'light' | 'dark'`, or restyle with `--otf-*`
  custom properties on the `.one-three-five` element.

## Rules

- Buckets hold at most 1, 3 and 5 tasks. Dropping into a full bucket is accepted; the task pushed
  past capacity goes back to Unassigned.
- Tasks are identified by `id`, or by a hash of the normalised title when there is no id.
- Re-supply the list whenever it changes. A task missing from it leaves the board and frees its slot;
  its bucket is remembered for 14 days (`retentionDays`) and the clock restarts whenever it reappears.
  If it returns to a bucket that has filled up meanwhile, it goes to Unassigned.
- Storage: GM storage when granted (kept per site), else `localStorage`, else memory.

## Develop

```sh
npm install
npm test          # unit + DOM tests (vitest, happy-dom)
npm run test:e2e  # builds, then real drags + a WCAG AA audit in Chromium (Playwright, axe)
npm run build   # dist/one-three-five.min.js (IIFE) and dist/one-three-five.esm.js
```
