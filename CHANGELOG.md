# Changelog

## Unreleased

- When the board is wide enough for two columns, Unassigned now fills the full height of the board
  and scrolls inside it.

## 1.0.0

First public release.

- Drag-and-drop 1-3-5 board in a Shadow DOM: mouse, pen, and touch (press and hold), plus
  keyboard moves (`1`, `3`, `5`, `0`) and screen-reader announcements.
- Full buckets accept drops; the task pushed past capacity returns to Unassigned.
- Swap two tasks by dropping one on the other; reorder by dropping between tasks.
- Assignments persist per list (GM storage per site, `localStorage`, or a custom adapter) and are
  restored whenever the list is supplied again.
- Tasks missing from the list keep their bucket for 14 days (`retentionDays`), restarting each
  time they reappear.
- Export and import of the plan as JSON; two-click "Clear day"; optional `resetDaily`.
- Light and dark themes, `--otf-*` custom properties, narrow single-column layout.
- TypeScript declarations.
- Served from GitHub Pages: `latest/` and one frozen folder per release.
