import { useState } from 'react';
import { ScrollView } from 'react-native';
import { randomUUID } from 'expo-crypto';
import type { Task } from '../../../src/types/domain';
import { parseCommand, type Command } from '../../../src/features/commands/parser';
import { put, useStore } from '../data/store';
import { Button, Card, Field, Label, styles, useText } from '../app/ui';
export function Commands() {
  const s = useStore(),t = useText(),[text,setText] = useState(''),[command,setCommand] = useState<Command|null>(null),[error,setError] = useState('');
  return <ScrollView contentContainerStyle={styles.content}><Label big>{t('Quick commands','أوامر سريعة')}</Label><Label>{t('Try: Add call Ahmed tomorrow at 10:30 · Note budget approved','جرّب: أضف اتصال بأحمد بكرة الساعة 10:30 · ملاحظة تمت الموافقة')}</Label>
    <Field label={t('Command','الأمر')} value={text} onChangeText={value => { setText(value); setCommand(null); setError(''); }} multiline/>
    <Button title={t('Preview','معاينة')} onPress={() => { try { setCommand(parseCommand(text,Object.values(s.records).filter(r => r.kind === 'task') as unknown as Task[])); setError(''); } catch (e) { setCommand(null); setError((e as Error).message); } }}/>
    {!!error && <Label>{error}</Label>}{command && <Card><Label>{command.kind === 'note' ? command.text : command.title}</Label>{command.kind === 'add' && <Label>{command.due} {command.time}</Label>}<Button title={t('Apply command','تنفيذ الأمر')} onPress={() => {
      const base = { id:randomUUID(),created:Date.now() };
      if (command.kind === 'add') put({ ...base,kind:'task',title:command.title,due:command.due,time:command.time,q:2,done:false,items:[] });
      else if (command.kind === 'note') put({ ...base,kind:'note',type:'note',text:command.text });
      else if (s.records[command.id]) put({ ...s.records[command.id],id:command.id,done:true,doneAt:Date.now() });
      setText(''); setCommand(null);
    }}/></Card>}
  </ScrollView>;
}
