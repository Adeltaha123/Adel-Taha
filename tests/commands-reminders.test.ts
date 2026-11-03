import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCommand } from '../src/features/commands/parser.js';
import { reminderPlan, defaultReminderPreferences } from '../src/platform/reminder-plan.js';
import type { Task } from '../src/types/domain.js';
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
test('reminder planning respects disabled/completed tasks, quiet hours, timezones, and platform limits', () => {
  const now = new Date(2026, 9, 26, 10);
  const tasks = [task({due:'2026-10-26', time:'23:30'}), task({id:'disabled', due:'2026-10-27', remind:-1}), task({id:'done', due:'2026-10-27', done:true}), task({id:'past', due:'2026-10-25'})];
  const plan = reminderPlan(tasks, { quiet:true, quietStart:22, quietEnd:8 }, now);
  assert.equal(plan.length, 1); assert.equal(plan[0]!.at.getDate(), 27); assert.equal(plan[0]!.at.getHours(), 8);
  const daylight = reminderPlan([task({due:'2026-10-26', time:'15:00', remind:0})], {quiet:true, quietStart:12, quietEnd:16}, now);
  assert.equal(daylight[0]!.at.getHours(), 16);
  const many = Array.from({length:100}, (_,i) => task({id:`t_${i}`, due:'2026-10-27', time:'12:00'}));
  assert.equal(reminderPlan(many, defaultReminderPreferences, now).length, 60);
  assert.equal(reminderPlan([task({due:'invalid'})], defaultReminderPreferences, now).length, 0);
});
