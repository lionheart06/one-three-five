# one-three-five

Drop-in 1-3-5 todo planner for userscripts and web pages. Hand it a list of todos; the user puts
**1** big, **3** medium and **5** small tasks into buckets for today, and the module remembers
where each task went the next time the same list is supplied.

> Status: M1 (core model, storage, events). The drag-and-drop board UI lands in M2.

## Use in Tampermonkey

```js
// @require  https://cdn.jsdelivr.net/npm/@lionheart06/one-three-five@0.1.0/dist/one-three-five.min.js
// @grant    GM_getValue
// @grant    GM_setValue

const board = OneThreeFive.create({ listId: 'github-issues' });
await board.ready;

board.setTodos([...document.querySelectorAll('.issue-title')]
  .map(el => ({ id: el.dataset.id, title: el.textContent })));

board.assign('1042', 1);                          // move a task by key into bucket 1
board.on('change', state => console.log(state.buckets));
```

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
npm test
npm run build   # dist/one-three-five.min.js (IIFE) and dist/one-three-five.esm.js
```
