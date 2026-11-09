import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextTasks } from '../shared/assistant.js';

test('the assistant gets upcoming open tasks with their times first, so it can warn about clashes', () => {
  const records = [
    { id:'done', kind:'task', title:'Old', done:true, due:'2026-11-10', time:'10:00', q:1 },
    { id:'note', kind:'note', text:'not a task' },
    { id:'past', kind:'task', title:'Overdue', done:false, due:'2026-11-01', time:null, q:1 },
    { id:'late', kind:'task', title:'Gym', done:false, due:'2026-11-10', time:'18:00', q:2 },
    { id:'soon', kind:'task', title:'Meeting', done:false, due:'2026-11-10', time:'10:00', q:7 },
  ];
  const tasks = contextTasks(records, '2026-11-09');
  assert.deepEqual(tasks.map(t => t.id), ['soon', 'late', 'past', 'done']);
  assert.deepEqual(tasks[0], { id:'soon', title:'Meeting', done:false, due:'2026-11-10', time:'10:00', q:2 });
  assert.equal(contextTasks(records, '2026-11-09', 2).length, 2);
});
