import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { AppState, ScrollView, View, Text } from 'react-native';
import * as Speech from 'expo-speech';
import { randomUUID } from 'expo-crypto';
import { proposedRecord } from '../../../shared/assistant';
import type { AssistantReply, AssistantAction } from '../../../shared/assistant';
import { dayKey } from '../../../shared/productivity';
import { api, put, useStore } from '../data/store';
import type { Conversation } from '../../../shared/domain';
import { voiceStatus } from '../services/assistant';
import { VoiceInput } from './VoiceInput';
import { Button, Card, Chip, Eyebrow, Field, IconButton, Label, Notice, styles, useText, useTheme } from '../app/ui';
type Message = { id:string; role:'user'|'assistant'; content:string; actions?:AssistantAction[] };
const prompts = [['Help me plan my day','ساعدني في التخطيط ليومي'],['Break a big task into small steps','قسّم مهمة كبيرة إلى خطوات صغيرة'],['Help me prioritize my tasks','ساعدني في ترتيب أولوياتي']] as const;
export function Assistant() {
  const s = useStore(), t = useText(), c = useTheme(), historyId = 'assistant_history_'+(s.session?.user.id ?? 'guest');
  const [messages,setMessages] = useState<Message[]>(() => (s.records[historyId]?.messages as Message[] | undefined) ?? []), [draft,setDraft] = useState(''), [busy,setBusy] = useState(false), [voiceBusy,setVoiceBusy] = useState(false), [error,setError] = useState(''), [reason,setReason] = useState<string|null|undefined>(undefined), [applied,setApplied] = useState<string[]>([]), [speaking,setSpeaking] = useState<string|null>(null);
  const alive = useRef(true), lock = useRef(false), scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  function saveConversation(next:Message[]) { setMessages(next); put<Conversation>({id:historyId,kind:'conversation',messages:next.slice(-100).map(({id,role,content})=>({id,role,content})),updated:Date.now()}); }
  useEffect(() => { alive.current = true; void voiceStatus(!!s.session,t).then(r => { if (alive.current) setReason(r); });
    const listener = AppState.addEventListener('change',state => { if (state !== 'active') void Speech.stop(); });
    return () => { alive.current = false; listener.remove(); void Speech.stop(); };
  },[]);
  async function send() {
    if (lock.current || !draft.trim()) return;
    lock.current = true; setBusy(true); setError(''); const message = draft.trim();
    try {
      const tasks = Object.values(s.records).filter(r => r.kind === 'task').slice(0,50).map(r => ({ id:r.id,title:r.title,done:!!r.done,due:r.due || null,q:r.q || 2 }));
      const result = await api<AssistantReply>('/assistant/chat',{ message,language:s.language,today:dayKey(),tasks,history:messages.slice(-8).map(m => ({ role:m.role,content:m.content.slice(0,1900) })),...(s.assistantName ? { assistantName:s.assistantName } : {}) },100000);
      if (alive.current) { saveConversation([...messages,{ id:randomUUID(),role:'user',content:message },{ id:randomUUID(),role:'assistant',content:result.reply,actions:result.actions }]); setDraft(''); }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function apply(a:AssistantAction,id:string) {
    if (applied.includes(id)) return;
    if (a.type === 'complete_task') { const task = s.records[a.targetId!]; if (!task || task.kind !== 'task' || task.done || task.title !== a.title) { setError(t('This task is no longer available to complete.','هذه المهمة غير متاحة للإكمال.')); return; } put({ ...task,id:a.targetId!,done:true }); }
    else put(proposedRecord(a,randomUUID(),Date.now()));
    setApplied(old => [...old,id]);
  }
  function speak(m:Message) {
    void Speech.stop().then(() => { if (speaking === m.id) { setSpeaking(null); return; } setSpeaking(m.id);
      Speech.speak(m.content,{ language:s.language === 'ar' ? 'ar' : 'en',onDone:() => setSpeaking(null),onStopped:() => setSpeaking(null),onError:() => { setSpeaking(null); setError(t('Speech playback is unavailable on this device.','القراءة الصوتية غير متاحة على هذا الجهاز.')); } }); });
  }
  const enabled = reason === null;
  return <View style={{ flex:1 }}><ScrollView ref={scroll} keyboardShouldPersistTaps="handled" onContentSizeChange={() => { if (error) scroll.current?.scrollTo({y:0,animated:true}); else if (messages.length) scroll.current?.scrollToEnd({ animated:true }); }} contentContainerStyle={styles.content}>
    {!!error && <Notice tone="error">{error}</Notice>}
    <View style={[styles.row,{ flexWrap:'nowrap' }]}><View style={{ flex:1,gap:4 }}><Eyebrow>{s.assistantName ? `MY PA ${s.assistantName.toUpperCase()}` : t('ASSISTANT','المساعد')}</Eyebrow><Label big>{s.assistantName ? t(`Hi, I'm ${s.assistantName}`,`أهلاً، أنا ${s.assistantName}`) : t('Your thinking partner','شريكك في التفكير')}</Label></View>{messages.length > 0 && <Chip title={t('Clear','مسح')} active={false} onPress={() => { if (busy) return; saveConversation([]); setApplied([]); void Speech.stop(); }}/>}</View>
    {!!reason && <Notice>{reason}</Notice>}
    {!messages.length && <><View style={{ backgroundColor:c.hero,padding:24,borderRadius:24,gap:12 }}><Eyebrow color={c.gold}>{s.assistantName ? `MY PA ${s.assistantName.toUpperCase()}` : 'MY PA'}</Eyebrow><Text style={{ color:c.heroInk,fontSize:27,lineHeight:35,fontWeight:'700' }}>{t('Less on your mind.\nMore in your day.','ذهن أصفى.\nيوم أكثر إنجازاً.')}</Text><Text style={{ color:c.heroMuted,lineHeight:22,fontSize:15 }}>{t('Plan your priorities, capture an idea, or turn a thought into your next task.','رتّب أولوياتك وسجّل أفكارك وحوّلها إلى خطوات.')}</Text></View>
      <View style={{ gap:8 }}>{prompts.map(([en,ar]) => <Chip key={en} title={t(en,ar)} active={false} onPress={() => setDraft(t(en,ar))}/>)}</View></>}
    {messages.map(m => { const mine = m.role === 'user';
      return <View key={m.id} style={{ gap:10,alignSelf:mine ? 'flex-end' : 'stretch',maxWidth:mine ? '88%' : '100%',backgroundColor:mine ? c.accent : c.surface,padding:16,borderRadius:20,borderWidth:mine ? 0 : 1,borderColor:c.line }}>
        {mine ? <Text style={{ color:c.onAccent,fontSize:15,lineHeight:22 }}>{m.content}</Text> : <><Eyebrow>{s.assistantName ? s.assistantName.toUpperCase() : 'MY PA'}</Eyebrow><Label strong>{m.content}</Label>
          <View style={styles.row}><IconButton icon={speaking === m.id ? 'stop' : 'speaker'} size={38} active={speaking === m.id} label={speaking === m.id ? t('Stop speaking','إيقاف القراءة') : t('Read aloud','قراءة بصوت عالٍ')} onPress={() => speak(m)}/></View></>}
        {m.actions?.map((a,i) => { const id = `${m.id}:${i}`; return <Card key={i} style={{ backgroundColor:c.bg }}><Label strong>{a.type === 'complete_task' ? t('Complete task','إكمال مهمة') : a.type === 'add_note' ? t('Add note','إضافة ملاحظة') : t('Add task','إضافة مهمة')}: {a.title}{a.due ? ` · ${a.due} ${a.time || ''}` : ''}</Label><Button icon={applied.includes(id) ? 'check' : undefined} title={applied.includes(id) ? t('Applied','تم التطبيق') : t('Apply suggestion','تطبيق الاقتراح')} disabled={applied.includes(id)} onPress={() => apply(a,id)}/></Card>; })}
      </View>; })}
  </ScrollView>
  <View style={{ paddingHorizontal:16,paddingVertical:12,gap:10,borderTopWidth:1,borderColor:c.line,backgroundColor:c.surface }}>
    <Field label={t('Message your assistant','رسالتك للمساعد')} value={draft} onChangeText={setDraft} multiline maxLength={4000} editable={!busy && !voiceBusy} placeholder={s.assistantName ? t(`Ask ${s.assistantName} anything…`,`اسأل ${s.assistantName} أي شيء…`) : t('What would you like to do?','كيف أساعدك؟')}/>
    <View style={[styles.row,{ flexWrap:'nowrap',alignItems:'flex-start' }]}><View style={{ flex:1 }}><VoiceInput compact keepKey="assistant" available={enabled} unavailable={reason ?? undefined} onBusyChange={setVoiceBusy} onText={text => { if (alive.current) setDraft(text); }}/></View>
      <Button icon="send" title={busy ? t('Working…','جارٍ العمل…') : t('Send','إرسال')} disabled={!enabled || busy || voiceBusy || !draft.trim()} onPress={() => void send()}/></View>
    <Label small>{t('Voice is transcribed for review. Sending shares your message and up to 50 tasks with OpenAI.','راجع النص قبل إرساله. الإرسال يشارك رسالتك وحتى ٥٠ مهمة مع OpenAI.')}</Label></View></View>;
}
