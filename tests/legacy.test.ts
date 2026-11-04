import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromLegacyItems } from '../shared/legacy.js';
import { recordSchema } from '../server/records.js';

test('the first web app\'s tasks, notes, habits and voice notes carry over in today\'s format', () => {
  const converted = fromLegacyItems([
    ['task_1', { id:'task_1', kind:'task', title:'  كلّم أحمد ', q:1, done:false, due:'2026-10-22', time:'10:30', items:[{ t:'Prepare offer', done:true }, { bad:true }], created:1, audioId:'a1', assigneeId:'someone' }],
    ['task_2', { kind:'task', title:'Odd values', q:9, due:'2026-02-30', time:'25:00', items:'nope' }],
    ['note_1', { kind:'note', type:'journal', text:'Good day', day:'2026-10-20' }],
    ['habit_1', { kind:'habit', name:'Read', log:{ '2026-10-20':true, 'not-a-day':true, '2026-10-21':'yes' } }],
    ['voice_1', { kind:'voice', text:'Call the bank', summary:'Bank call', audioId:'a2' }],
    ['settings', { kind:'settings', pinHash:'secret' }],
    ['sample_1', { kind:'task', title:'Sample', example:true }],
    ['empty_1', { kind:'task', title:'   ' }],
    ['bad id!', { kind:'task', title:'Bad id' }],
    'garbage', [1, 2],
  ]);
  assert.deepEqual(Object.keys(converted).sort(), ['habit_1', 'note_1', 'task_1', 'task_2', 'voice_1']);
  assert.deepEqual(converted.task_1, { id:'task_1', kind:'task', title:'كلّم أحمد', q:1, done:false, items:[{ t:'Prepare offer', done:true }], due:'2026-10-22', time:'10:30', created:1 });
  assert.deepEqual([converted.task_2!.q, converted.task_2!.due, converted.task_2!.time, converted.task_2!.items], [2, null, null, []]);
  assert.deepEqual(converted.habit_1!.log, { '2026-10-20':true });
  assert.deepEqual(converted.voice_1, { id:'voice_1', kind:'note', type:'note', text:'Bank call\n\nCall the bank' });
  // Everything converted is accepted by the server, so it can sync to an account.
  for (const record of Object.values(converted)) assert.doesNotThrow(() => recordSchema.parse(record), JSON.stringify(record));
  assert.deepEqual(fromLegacyItems('not a list'), {});
});
