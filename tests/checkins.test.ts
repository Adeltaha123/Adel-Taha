import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkInTime,scheduleKey,upcomingCheckIns} from '../shared/checkins.js';
import {recordSchema} from '../server/records.js';
import {mutationsFor} from '../shared/sync.js';
import type {Task} from '../src/types/domain.js';
test('check-ins respect due times, completion, snooze, dismissal and schedule changes',()=>{
  const task:Task={id:'t',kind:'task',title:'Review',q:2,done:false,items:[],due:'2026-10-30',time:'09:00'};
  const due=new Date('2026-10-30T09:00:00').getTime();
  assert.equal(checkInTime(task),due);assert.equal(checkInTime({...task,done:true}),null);
  assert.equal(checkInTime({...task,checkInAfter:due+600000}),due+600000);
  assert.equal(checkInTime({...task,checkInDismissedFor:scheduleKey(task)}),null);
  assert.equal(checkInTime({...task,time:'10:00',checkInDismissedFor:scheduleKey(task)}),due+3600000);
  assert.equal(upcomingCheckIns([task],due).length,0);
  assert.equal(upcomingCheckIns(Array.from({length:70},(_,i)=>({...task,id:String(i)})),due-1).length,60);
  assert.equal(checkInTime({...task,time:null}),null);
});
test('conversation text and snooze metadata are valid database mutations',()=>{
  const record={id:'assistant_history_user',kind:'conversation',messages:[{id:'message-1',role:'user',content:'خطط ليومي'}]};
  assert.deepEqual(recordSchema.parse(record),record);
  assert.equal(mutationsFor({[record.id]:record},{},[]).length,1);
});
