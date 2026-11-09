import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boardQuadrant, taskSummary } from '../shared/productivity.js';
import type { Task } from '../shared/domain.js';

test('dated tasks show in Do now on their day (or when overdue) and in Schedule before it', () => {
  const today = '2026-11-09';
  assert.equal(boardQuadrant({ q:2, due:'2026-11-09' }, today), 1);
  assert.equal(boardQuadrant({ q:2, due:'2026-11-01' }, today), 1); // Overdue.
  assert.equal(boardQuadrant({ q:1, due:'2026-11-10' }, today), 2); // Tomorrow: Schedule today…
  assert.equal(boardQuadrant({ q:1, due:'2026-11-10' }, '2026-11-10'), 1); // …and Do now when its day comes.
  assert.equal(boardQuadrant({ q:3, due:'2026-11-09' }, today), 3); // Delegate and Drop stay as chosen.
  assert.equal(boardQuadrant({ q:4, due:'2026-11-12' }, today), 4);
  assert.equal(boardQuadrant({ q:1, due:null }, today), 1); // Undated tasks keep their priority.
  assert.equal(boardQuadrant({ q:null, due:null }, today), 2);
  assert.equal(boardQuadrant({ q:1, due:'not-a-day' }, today), 1);
  const task = (id: string, q: 1|2|3|4, due: string|null): Task => ({ id, kind:'task', title:id, q, done:false, items:[], due });
  assert.equal(taskSummary([task('a', 2, today), task('b', 1, '2026-11-20'), task('c', 1, null)], today).urgent, 2);
});
