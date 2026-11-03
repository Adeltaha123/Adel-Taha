import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCommand } from '../shared/commands.js';
import type { Task } from '../shared/domain.js';
const task = (fields: Partial<Task>): Task => ({ id:'task_1', kind:'task', title:'Call Ahmed', q:2, done:false, items:[], ...fields });

test('English and Arabic commands handle date rollover, time conversion, and explicit completion', () => {
  const now = new Date(2026, 11, 31, 18, 0);
  assert.deepEqual(parseCommand('Add call Ahmed tomorrow at 10:30', [], now), { kind:'add', title:'call Ahmed', due:'2027-01-01', time:'10:30' });
  assert.deepEqual(parseCommand('أضف اتصل بأحمد بكرة الساعة ٣:٣٠', [], now), { kind:'add', title:'اتصل بأحمد', due:'2027-01-01', time:'03:30' });
  assert.equal((parseCommand('Add review at 12 am', [], now) as {time:string}).time, '00:00');
  assert.equal((parseCommand('Add review at 12 pm', [], now) as {time:string}).time, '12:00');
  assert.deepEqual(parseCommand('Complete Call Ahmed', [task({})]), { kind:'complete', id:'task_1', title:'Call Ahmed' });
  assert.throws(() => parseCommand('Complete Call', [task({})]), /exact title/);
  assert.throws(() => parseCommand('Complete Call Ahmed', [task({}), task({id:'task_2'})]), /Several/);
  assert.throws(() => parseCommand('Add call at 25:99', [], now), /valid time/);
  assert.deepEqual(parseCommand('ملاحظة تم اعتماد الميزانية', []), { kind:'note', text:'تم اعتماد الميزانية' });
});
