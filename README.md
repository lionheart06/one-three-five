# one-three-five

Drop-in 1-3-5 todo planner for userscripts and web pages. Hand it a list of todos; the user puts
**1** big, **3** medium and **5** small tasks into buckets for today, and the module remembers
where each task went the next time the same list is supplied.

- One `@require` or `<script>` line, no dependencies, about 9 KB gzipped.
- Served from GitHub Pages: [live demo](https://lionheart06.github.io/one-three-five/).
- Drag with mouse, touch or pen, or use the keyboard. Screen-reader friendly (WCAG 2.2 AA).
- Renders in a Shadow DOM: the host page's CSS can't break it, and it can't break the page.
- Remembers assignments per site with Tampermonkey storage or `localStorage`.

## Quick start

### Tampermonkey / Violentmonkey

```js
// ==UserScript==
// @name     My 1-3-5
// @match    https://example.com/todos*
// @require  https://lionheart06.github.io/one-three-five/v1.0.0/one-three-five.min.js
// @grant    GM_getValue
// @grant    GM_setValue
// ==/UserScript==

// The board fills whatever element you mount it in, so size and position it yourself.
const mount = document.createElement('div');
mount.style.cssText = 'position:fixed; right:16px; bottom:16px; width:420px; max-height:80vh; overflow:auto; z-index:2147483000;';
document.body.append(mount);

const board = OneThreeFive.create({ listId: 'example-todos', mount });

board.setTodos([...document.querySelectorAll('.todo')]
  .map(el => ({ id: el.dataset.id, title: el.textContent.trim() })));
```

The board has no layout options of its own: width and position come from the mount element.
For a draggable, collapsible, resizable floating panel that remembers its place, see
[`examples/floating-panel.user.js`](examples/floating-panel.user.js). A complete script with
periodic refresh is in [`examples/github-issues.user.js`](examples/github-issues.user.js).

### Plain page

```html
<div id="board"></div>
<script src="https://lionheart06.github.io/one-three-five/v1.0.0/one-three-five.min.js"></script>
<script>
  OneThreeFive.create({ mount: '#board', todos: ['Write report', 'Call Ana', 'Book tickets'] });
</script>
```

### Which URL to use

| URL | What it serves |
| --- | --- |
| `https://lionheart06.github.io/one-three-five/vX.Y.Z/one-three-five.min.js` | A frozen release. Use this in scripts you rely on. |
| `https://lionheart06.github.io/one-three-five/latest/one-three-five.min.js` | The current `main` branch. Changes without notice. |

Each folder also has `one-three-five.esm.js` for `import { create } from '…'`.
Tampermonkey caches `@require` files; bump the version in the URL to pick up a new release.

The package is not published to npm.

## How it behaves

- **Buckets** hold at most 1, 3 and 5 tasks. Dropping into a full bucket is always accepted:
  the task pushed past capacity goes back to Unassigned (it is outlined while you hover).
- **Identity:** a task is recognised by its `id`, or by a hash of its normalised title when it has
  none. Supply ids whenever the source has them, so a renamed task keeps its bucket.
- **Re-supplying the list:** call `setTodos()` whenever the source list changes (on an interval is
  fine). Assignments are restored, new tasks land in Unassigned.
- **Tasks that disappear** leave the board and free their slot. Their bucket is remembered for
  14 days (`retentionDays`); the clock restarts each time the task reappears. A returning task
  gets its bucket back if there is room, otherwise it goes to Unassigned.
- **Storage:** GM storage when the script grants it, keyed per site; otherwise `localStorage`;
  otherwise memory. A storage failure never breaks the board, it emits a `warning`.

## Using the board

| Action | Mouse / pen | Touch | Keyboard (task focused) |
| --- | --- | --- | --- |
| Put in a bucket | Drag onto the bucket | Press and hold, then drag | `1`, `3`, `5` |
| Back to Unassigned | Drag onto Unassigned | Press and hold, then drag | `0` |
| Swap two tasks | Drop one on the other | Same | – |
| Reorder | Drop between tasks | Same | – |
| Move focus | – | – | Arrow keys |
| Open the task's link | Click | Tap | `Enter` |

"Clear day" moves everything to Unassigned (it asks for a second click). "Export" downloads the
plan as JSON, "Import" loads one back.

## API

### `OneThreeFive.create(options)` → `board`

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `listId` | string | `"default"` | Storage namespace; one per independent board. |
| `mount` | Element or selector | none | Where to render. A selector that matches nothing throws. Omit for a headless board. |
| `todos` | array | `[]` | Initial list, same as `setTodos()`. |
| `storage` | `"auto"`, `"gm"`, `"local"`, `"memory"` or adapter | `"auto"` | Adapter: `{ get(key), set(key, value) }`, sync or async. |
| `getKey` | `(todo) => string` | id, else title hash | Custom identity. |
| `capacities` | `{ 1, 3, 5 }` | `{1:1, 3:3, 5:5}` | Override bucket sizes. |
| `retentionDays` | number | `14` | How long a missing task keeps its bucket. |
| `resetDaily` | boolean | `false` | Return assignments made before today to Unassigned. |
| `theme` | `"auto"`, `"light"`, `"dark"` | `"auto"` | `auto` follows the system. |
| `renderTask` | `(todo) => Node or string` | title | Custom card content; strings are inserted as text. |

Todos are strings or objects `{ id?, title, url?, meta? }`. Only `http(s)` urls become links.

### Board

| Member | Returns | Purpose |
| --- | --- | --- |
| `ready` | Promise | Resolves once stored assignments have loaded. Moves before that are refused. |
| `setTodos(list)` | void | Replace the list and reconcile. Safe any time. |
| `assign(key, bucket, index?)` | boolean | `bucket` is `1`, `3`, `5`, or `null`/`0` for Unassigned. |
| `swap(keyA, keyB)` | boolean | Two tasks trade places, any zones. |
| `clear()` | void | Everything back to Unassigned. |
| `getState()` | `{ buckets, unassigned }` | Todos per zone, in display order. |
| `keyOf(todo)` / `bucketOf(key)` | string / bucket or null | Identity helpers. |
| `export()` / `import(json)` | string / boolean | Back up or restore every assignment. |
| `show()` / `hide()` / `destroy()` | void | Visibility and teardown. |
| `on(event, fn)` / `off(event, fn)` | void | Events below. |

### Events

| Event | Payload | When |
| --- | --- | --- |
| `change` | `{ buckets, unassigned }` | After anything changes. |
| `assign` | `{ key, from, to }` | A task moved (`null` = Unassigned). |
| `full` | `{ bucket, dropped }` | Tasks were pushed out of a full bucket. |
| `warning` | `{ message }` | Duplicate keys, storage problems, bad imports. |

### Theming

Set custom properties on the `.one-three-five` element the board adds inside your mount:

```css
.one-three-five {
  --otf-accent: #0a7f5a;
  --otf-radius: 4px;
  --otf-pool-height: 20rem; /* Unassigned list height before it scrolls */
}
```

Also available: `--otf-bg`, `--otf-surface`, `--otf-card`, `--otf-border`, `--otf-text`,
`--otf-muted`, `--otf-accent-soft`, `--otf-warn`, `--otf-warn-soft`.

## Develop

```sh
npm install
npm test          # unit + DOM tests (vitest, happy-dom)
npm run test:e2e  # builds, then real drags + a WCAG AA audit in Chromium (Playwright, axe)
npm run build     # dist/*.js; fails if the bundle exceeds 12 KB gzipped
npm run build:site  # site/ as GitHub Pages serves it: latest/, one folder per v* tag, demo
```

## Releasing

1. Update `version` in `package.json` and `CHANGELOG.md`, commit to `main`.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`
3. `gh workflow run pages.yml` to publish the new folder (pushes to `main` publish `latest/` on their own).

`demo/index.html` runs the board on a plain page after `npm run build`.

## License

MIT
