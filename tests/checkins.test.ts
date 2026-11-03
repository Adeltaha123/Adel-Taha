import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkInTime,checkInMessage,checkInsFor,FOLLOW_UP_MS,moveToTomorrow,scheduleKey,upcomingCheckIns} from '../shared/checkins.js';
import {recordSchema} from '../server/records.js';
import {mutationsFor} from '../shared/sync.js';
import type {Task} from '../shared/domain.js';
test('check-ins respect due times, completion, snooze, dismissal and schedule changes',()=>{
  const task:Task={id:'t',kind:'task',title:'Review',q:2,done:false,items:[],due:'2026-10-30',time:'09:00'};
  const due=new Date('2026-10-30T09:00:00').getTime();
  assert.equal(checkInTime(task),due);assert.equal(checkInTime({...task,done:true}),null);
  assert.equal(checkInTime({...task,checkInAfter:due+600000}),due+600000);
  assert.equal(checkInTime({...task,checkInDismissedFor:scheduleKey(task)}),null);
  assert.equal(checkInTime({...task,time:'10:00',checkInDismissedFor:scheduleKey(task)}),due+3600000);
  assert.deepEqual(upcomingCheckIns([task],due).map(c=>c.kind),['followup']); // The reminder has passed; the follow-up is still to come.
  assert.equal(upcomingCheckIns([task],due+FOLLOW_UP_MS).length,0);
  assert.equal(upcomingCheckIns(Array.from({length:70},(_,i)=>({...task,id:String(i)})),due-1).length,60);
  assert.equal(checkInTime({...task,time:null}),null);
});
test('conversation text and snooze metadata are valid database mutations',()=>{
  const record={id:'assistant_history_user',kind:'conversation',messages:[{id:'message-1',role:'user',content:'خطط ليومي'}]};
  assert.deepEqual(recordSchema.parse(record),record);
  assert.equal(mutationsFor({[record.id]:record},{},[]).length,1);
});
test('each task gets a reminder at its time and a follow-up an hour later; a snooze asks once',()=>{
  const task:Task={id:'t',kind:'task',title:'Call Ahmed',q:2,done:false,items:[],due:'2026-10-30',time:'21:00'};
  const due=new Date('2026-10-30T21:00:00').getTime();
  assert.deepEqual(checkInsFor(task),[{kind:'due',at:due},{kind:'followup',at:due+FOLLOW_UP_MS}]);
  assert.deepEqual(checkInsFor({...task,checkInAfter:due+1800000}),[{kind:'followup',at:due+1800000}]);
  assert.deepEqual(checkInsFor({...task,done:true}),[]);
  const moved=moveToTomorrow({...task,checkInAfter:due+1800000,checkInDismissedFor:scheduleKey(task)},new Date(2026,9,31,8,0));
  assert.equal(moved.due,'2026-11-01');assert.equal(moved.time,'21:00');assert.equal(moved.checkInAfter,undefined);assert.equal(moved.checkInDismissedFor,undefined);
});
test('check-in wording greets by time of day and name, in the app language',()=>{
  const task:Task={id:'t',kind:'task',title:'كلّم أحمد',q:2,done:false,items:[]};
  const evening=new Date(2026,9,30,21,0).getTime(),morning=new Date(2026,9,30,8,0).getTime();
  assert.equal(checkInMessage(task,'due',evening,'ar','Mohamed Tamer').title,'مساء الخير يا Mohamed 🌙');
  assert.equal(checkInMessage(task,'due',morning,'en','').title,'Good morning ☀️');
  assert.match(checkInMessage(task,'due',evening,'ar').body,/^⏰ .*«كلّم أحمد»/);
  assert.match(checkInMessage(task,'followup',evening,'en').body,/“كلّم أحمد”/);
  assert.ok(checkInMessage({...task,title:'x'.repeat(200)},'due',evening,'en').body.length<120);
});
