// ==UserScript==
// @name         1-3-5 for GitHub issues
// @namespace    https://github.com/lionheart06/one-three-five
// @version      0.1.0
// @description  Plan your day from a GitHub issue list with the 1-3-5 rule.
// @match        https://github.com/*/*/issues*
// @require      https://cdn.jsdelivr.net/npm/@lionheart06/one-three-five@0.2.0/dist/one-three-five.min.js
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  // GitHub's markup changes over time; adjust this selector if no tasks show up.
  const ISSUE_LINKS = 'a[data-testid="issue-pr-title-link"], a.Link--primary[id^="issue_"]';
  const REFRESH_MS = 5000;

  const mount = document.createElement('div');
  mount.style.margin = '16px auto';
  mount.style.maxWidth = '960px';
  document.querySelector('main')?.prepend(mount);

  const board = OneThreeFive.create({ listId: 'github-issues', mount });

  function scrape() {
    return [...document.querySelectorAll(ISSUE_LINKS)].map(link => ({
      id: link.pathname, // stable across title edits
      title: link.textContent.trim(),
      url: link.href,
    }));
  }

  // GitHub navigates without page loads, so re-supply the list on an interval and only when it
  // actually changed. Skip empty scrapes: the list is mid-render, not empty.
  let last = '';
  function refresh() {
    const todos = scrape();
    const signature = todos.map(t => t.id).join('\n');
    if (!todos.length || signature === last) return;
    last = signature;
    board.setTodos(todos);
  }
  refresh();
  setInterval(refresh, REFRESH_MS);
})();
