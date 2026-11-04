import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords, mutationsFor, syncable } from '../shared/sync.js';
import { dayKey, focusRemaining, taskSummary, validDay } from '../shared/productivity.js';
import { createApi } from '../server/node.js';
test('shared sync preserves in-flight edits, conflicts, tombstones and local audio', () => {
  const before = { a:{ id:'a',kind:'task',title:'before' }, b:{ id:'b',kind:'voice',text:'words',audioId:'local' } };
  const remote = [{ id:'a',version:2,deleted:false,data:{ ...before.a,title:'remote' } },{ id:'b',version:2,deleted:false,data:{ id:'b',kind:'voice',text:'new words' } }];
  const current = { ...before,a:{ ...before.a,title:'typed while syncing' } };
  const merged = mergeRecords(before,current,remote,[]);
  assert.equal(merged.a!.title,'typed while syncing'); assert.equal(merged.b!.audioId,'local'); assert.equal(merged.b!.text,'new words');
  assert.equal(mergeRecords(before,before,remote,['a']).a!.title,'before');
  assert.equal(mergeRecords(before,before,[{ id:'a',version:3,deleted:true,data:null }],[]).a,undefined);
  assert.equal(syncable({ ...before,settings:{ kind:'settings',secret:'private' } }).settings,undefined);
  assert.equal(syncable(before).b!.audioId,undefined);
  const baseline = { a:{ id:'a',version:1,deleted:false,data:before.a } };
  assert.deepEqual(mutationsFor({ a:before.a },baseline,[]),[]);
  assert.deepEqual(mutationsFor({},baseline,[]),[{ id:'a',expectedVersion:1,data:null }]);
  assert.deepEqual(mutationsFor({},baseline,['a']),[]);
});
test('dates, dashboard counts, and focus timer handle boundary cases', () => {
  assert.equal(validDay('2028-02-29'),true); assert.equal(validDay('2026-02-29'),false);
  assert.equal(validDay('2026-13-01'),false); assert.equal(validDay('2026-04-31'),false);
  assert.equal(dayKey(new Date(2026,9,29,23,59)),'2026-10-29');
  assert.equal(focusRemaining(10000,10001),0); assert.equal(focusRemaining(10000,8500),2); assert.equal(focusRemaining(null),0);
  const base = { kind:'task' as const,title:'Task',q:1 as const,items:[],done:false };
  assert.deepEqual(taskSummary([{ ...base,id:'a',due:'2026-10-28' },{ ...base,id:'b',due:'2026-10-29' },{ ...base,id:'c',done:true }],'2026-10-29'),{ total:3,open:2,completed:1,overdue:1,today:1,urgent:2 });
});
test('concurrent registrations return a clear conflict, and invalid calendar dates are rejected', async () => {
  const api = await createApi({ databasePath:':memory:',rateLimit:false });
  try {
    const payload = { email:'race@example.test',name:'Race',password:'long-password-123' };
    const responses = await Promise.all([1,2].map(() => api.inject({ method:'POST',url:'/api/auth/register',payload })));
    assert.deepEqual(responses.map(r => r.statusCode).sort(),[201,409]);
    const token = responses.find(r => r.statusCode === 201)!.json().token;
    const headers = { authorization:`Bearer ${token}` };
    const workspace = (await api.inject({ url:'/api/workspaces',headers })).json()[0];
    const result = await api.inject({ method:'POST',url:`/api/workspaces/${workspace.id}/sync`,headers,payload:{ mutations:[{ id:'bad_date',expectedVersion:0,data:{ id:'bad_date',kind:'task',title:'Invalid',due:'2026-02-31' } }] } });
    assert.equal(result.statusCode,400);
  } finally { await api.close(); }
});
