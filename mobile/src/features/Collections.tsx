import { useState } from 'react';
import { ScrollView } from 'react-native';
import { randomUUID } from 'expo-crypto';
import type { Note, Habit } from '../../../src/types/domain';
import { dayKey } from '../../../shared/productivity';
import { put, remove, useStore } from '../data/store';
import { Button, Card, Field, Label, styles, useText } from '../app/ui';
export function Collections({ kind }: { kind:'note'|'habit' }) {
  const state = useStore(),t = useText(),[text,setText] = useState(''),[query,setQuery] = useState(''),[confirm,setConfirm] = useState(''),[editing,setEditing] = useState<Note|Habit|null>(null);
  const records = Object.values(state.records).filter(r => r.kind === kind) as unknown as (Note|Habit)[];
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Label big>{kind === 'note' ? t('Notes','ملاحظات') : t('Habits','عادات')}</Label>
    <Field label={kind === 'note' ? t('New note','ملاحظة جديدة') : t('New habit','عادة جديدة')} value={text} onChangeText={setText} multiline={kind === 'note'} maxLength={kind === 'note' ? 100000 : 500}/>
    <Button title={editing ? t('Save changes','حفظ التغييرات') : t('Add','إضافة')} disabled={!text.trim()} onPress={() => { const base = { id:randomUUID(),created:Date.now() }; put(editing ? (editing.kind === 'note' ? { ...editing,text:text.trim() } : { ...editing,name:text.trim() }) : kind === 'note' ? { ...base,kind:'note',type:'note',text:text.trim() } : { ...base,kind:'habit',name:text.trim(),log:{} }); setText(''); setEditing(null); }}/>
    {editing && <Button title={t('Cancel edit','إلغاء التعديل')} secondary onPress={() => { setEditing(null); setText(''); }}/>} 
    <Field label={t('Search','بحث')} value={query} onChangeText={setQuery}/>
    {!records.length && <Label>{t('Start with one small idea or habit.','ابدأ بفكرة أو عادة بسيطة.')}</Label>}
    {records.filter(r => (r.kind === 'note' ? r.text : r.name).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(record => <Card key={record.id}><Label>{record.kind === 'note' ? record.text : record.name}</Label>
      {record.kind === 'habit' && <><Label>{Object.values(record.log ?? {}).filter(Boolean).length} {t('days checked in','أيام مكتملة')}</Label><Button title={record.log?.[dayKey()] ? t('Undo today','تراجع عن اليوم') : t('Check in today','إكمال اليوم')} onPress={() => put({ ...record,log:{ ...record.log,[dayKey()]:!record.log?.[dayKey()] } })}/></>}
      <Button title={t('Edit','تعديل')} secondary onPress={() => { setEditing(record); setText(record.kind === 'note' ? record.text : record.name); }}/>
      <Button title={confirm === record.id ? t('Confirm delete','تأكيد الحذف') : t('Delete','حذف')} secondary onPress={() => { if (confirm === record.id) { remove(record.id); setConfirm(''); if (editing?.id === record.id) { setEditing(null); setText(''); } } else setConfirm(record.id); }}/></Card>)}
  </ScrollView>;
}
