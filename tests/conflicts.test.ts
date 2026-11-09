import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clashWarning, scheduleClashes } from '../shared/conflicts.js';
import type { Task } from '../shared/domain.js';

const task = (id: string, due: string|null, time: string|null, extra: Partial<Task> = {}): Task => ({ id, kind:'task', title:id, q:2, done:false, items:[], due, time, ...extra });

test('a new time warns about tasks at the same time or within an hour, closest first', () => {
  const tasks = [task('Meeting', '2026-11-10', '10:00'), task('Call', '2026-11-10', '10:45'), task('Lunch', '2026-11-10', '13:00'),
    task('Done', '2026-11-10', '10:00', { done:true }), task('All day', '2026-11-10', null), task('Other day', '2026-11-11', '10:00')];
  assert.deepEqual(scheduleClashes({ due:'2026-11-10', time:'10:00' }, tasks), [{ title:'Meeting', time:'10:00', minutes:0 }, { title:'Call', time:'10:45', minutes:45 }]);
  assert.deepEqual(scheduleClashes({ due:'2026-11-10', time:'11:30' }, tasks).map(c => c.title), ['Call']);
  assert.deepEqual(scheduleClashes({ due:'2026-11-10', time:'16:00' }, tasks), []);
  assert.deepEqual(scheduleClashes({ due:'2026-11-10', time:null }, tasks), []); // All-day tasks never clash.
  assert.deepEqual(scheduleClashes({ id:'Meeting', due:'2026-11-10', time:'10:00' }, tasks).map(c => c.title), ['Call']); // Not with itself.
  // Late at night, the next day's early task is still close.
  assert.deepEqual(scheduleClashes({ due:'2026-11-10', time:'23:30' }, [task('Early', '2026-11-11', '00:15')]), [{ title:'Early', time:'00:15', minutes:45 }]);
});

test('the warning names the closest clash in the user\'s language', () => {
  assert.equal(clashWarning([{ title:'كلّم أحمد', time:'10:00', minutes:0 }], 'ar'), '⚠️ عندك «كلّم أحمد» في نفس الوقت (10:00)');
  assert.equal(clashWarning([{ title:'Meeting with Hala', time:'10:30', minutes:30 }, { title:'Call', time:'11:00', minutes:60 }], 'en'), '⚠️ 30 min from “Meeting with Hala” (10:30) and 1 more');
  assert.equal(clashWarning([], 'en'), '');
});
