import {useEffect,useRef,useState} from 'react';
import {Modal,ScrollView,View,Text,ActivityIndicator,TextInput,Pressable} from 'react-native';
import {randomUUID} from 'expo-crypto';
import type {AssistantAction} from '../../../../shared/assistant';
import {proposedRecord} from '../../../../shared/assistant';
import {change,useStore} from '../../data/store';
import {understandTasks,voiceStatus} from '../../services/assistant';
import {VoiceInput} from '../VoiceInput';
import {Button,Card,Eyebrow,Field,IconButton,Label,Notice,Page,styles,useText} from '../../app/ui';
import {useTheme} from '../../app/theme';
import {SchedulePicker} from './SchedulePicker';
import {QUADRANTS} from './quadrants';
type Draft=AssistantAction&{key:string};
const isArabic=(s:string)=>/[؀-ۿ]/.test(s);
/* Say one task or many in one go; the assistant splits them and every proposal stays editable until saved. */
export function VoiceTask({close}:{close:()=>void}) {
  const s=useStore(),t=useText(),c=useTheme(),[reason,setReason]=useState<string|null|undefined>(undefined),[text,setText]=useState(''),[drafts,setDrafts]=useState<Draft[]>([]),[reply,setReply]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[voiceBusy,setVoiceBusy]=useState(false),[open,setOpen]=useState<string|null>(null),alive=useRef(true),saved=useRef(false);
  useEffect(()=>{void voiceStatus(!!s.session,t).then(r=>{if(alive.current)setReason(r);});return()=>{alive.current=false;};},[]);
  const available=reason===null;
  async function interpret(value:string,signal?:AbortSignal){
    setText(value);setError('');setReply('');setDrafts([]);if(!value.trim())return;setBusy(true);
    try{const result=await understandTasks(value,s.language,signal,s.assistantName);if(!alive.current||signal?.aborted)return;
      const found=result.actions.filter(a=>a.type==='add_task').map(a=>({...a,key:randomUUID()}));
      setDrafts(found);if(found.length)setReply(result.reply);else setError(result.reply);
    }catch(e){if(alive.current&&!signal?.aborted)setError(e instanceof Error?e.message:String(e));}finally{if(alive.current)setBusy(false);}
  }
  const edit=(key:string,patch:Partial<Draft>)=>setDrafts(list=>list.map(d=>d.key===key?{...d,...patch}:d));
  function saveAll(list:AssistantAction[]){
    const valid=list.filter(a=>a.title.trim());if(saved.current||!valid.length)return;saved.current=true;
    const now=Date.now(),records={...s.records};
    valid.forEach((a,i)=>{const id=randomUUID();records[id]=proposedRecord({...a,title:a.title.trim().slice(0,500)},id,now+i) as unknown as Record<string,unknown>;});
    change(records);close(); // One change, so a single Undo removes the whole batch.
  }
  return <Modal visible animationType="slide" onRequestClose={close}><Page><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <View style={[styles.row,{justifyContent:'space-between',flexWrap:'nowrap'}]}><View style={{flex:1,gap:4}}><Eyebrow>{t('VOICE TASKS','مهام صوتية')}</Eyebrow><Label big>{t('Say it. Save it.','قلها، وسجّلها.')}</Label></View><IconButton icon="close" label={t('Close','إغلاق')} onPress={close}/></View>
    <Label>{t('Say one task or ten in one go: "Call Ahmed tomorrow at 10, send the offer today, and follow up with Hala on Sunday."','قل مهمة واحدة أو عشرة مرة واحدة: «كلّم أحمد بكرة الساعة ١٠، وابعت العرض النهاردة، وتابع مع هالة يوم الحد».')}</Label>
    <Card>{reason===undefined?<ActivityIndicator color={c.accent}/>:<VoiceInput available={available} unavailable={reason??undefined} onText={interpret} onBusyChange={setVoiceBusy}/>}</Card>
    {!!reason&&<Notice>{reason}</Notice>}
    {!drafts.length&&<><Field label={t('What you said','ما قلته')} placeholder={t('Or type your tasks here…','أو اكتب مهامك هنا…')} value={text} editable={!busy&&!voiceBusy} onChangeText={setText} multiline maxLength={4000}/>
      {!!text.trim()&&!busy&&<View style={{gap:10}}>
        {available&&<Button icon="assistant" title={t('Understand tasks','افهم المهام')} disabled={voiceBusy} onPress={()=>void interpret(text)}/>}
        <Button icon="check" secondary title={t('Save as written','حفظ كما هي')} disabled={voiceBusy} onPress={()=>saveAll([{type:'add_task',title:text,due:null,time:null,targetId:null}])}/></View>}</>}
    {busy&&<View style={[styles.row,{justifyContent:'center'}]}><ActivityIndicator color={c.accent}/><Label>{t('Splitting your tasks…','أقسّم مهامك…')}</Label></View>}
    {!!error&&<Notice tone="error">{error}</Notice>}
    {drafts.length>0&&<View style={{gap:12}}>
      <View style={[styles.row,{justifyContent:'space-between'}]}><Eyebrow>{t(`${drafts.length} TASK${drafts.length===1?'':'S'} READY`,`${drafts.length} مهام جاهزة`)}</Eyebrow><Pressable accessibilityRole="button" onPress={()=>{setDrafts([]);setReply('');}}><Text style={{color:c.accent,fontWeight:'600'}}>{t('Start over','ابدأ من جديد')}</Text></Pressable></View>
      {!!reply&&<Label small>{reply}</Label>}
      {drafts.map(d=>{const q=QUADRANTS.find(x=>x.q===(d.priority??2))??QUADRANTS[1]!,expanded=open===d.key;
        return <View key={d.key} style={{backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.line,overflow:'hidden'}}>
          <View style={{height:4,backgroundColor:c.q[q.q]}}/>
          <View style={{padding:14,gap:10}}>
            <View style={{flexDirection:'row',alignItems:'flex-start',gap:8}}>
              <TextInput accessibilityLabel={t('Task title','عنوان المهمة')} value={d.title} maxLength={500} multiline onChangeText={title=>edit(d.key,{title})} style={{flex:1,fontSize:16,fontWeight:'600',color:c.ink,padding:0,textAlign:isArabic(d.title)?'right':'left'}}/>
              <IconButton icon="close" size={32} label={t('Remove','حذف')} onPress={()=>setDrafts(list=>list.filter(x=>x.key!==d.key))}/></View>
            <View style={[styles.row,{gap:6}]}>
              {QUADRANTS.map(x=>{const on=x.q===q.q;return <Pressable key={x.q} accessibilityRole="button" accessibilityState={{selected:on}} accessibilityLabel={t(x.en,x.ar)} onPress={()=>edit(d.key,{priority:x.q})} style={{paddingHorizontal:10,paddingVertical:5,borderRadius:999,borderWidth:1,borderColor:on?c.q[x.q]:c.line,backgroundColor:on?c.q[x.q]:'transparent'}}><Text style={{fontSize:12,fontWeight:'700',color:on?'#fff':c.muted}}>{t(x.en,x.ar)}</Text></Pressable>;})}</View>
            <Pressable accessibilityRole="button" onPress={()=>setOpen(expanded?null:d.key)}><Text style={{fontSize:13,fontWeight:'600',color:d.due?c.accent:c.muted}}>{d.due?`📅 ${d.due}${d.time?` · ${d.time}`:''}`:t('+ Add a date','+ أضف موعداً')}</Text></Pressable>
            {expanded&&<SchedulePicker due={d.due} time={d.time} onChange={(due,time)=>edit(d.key,{due,time})}/>}
          </View></View>;})}
      <Button icon="check" title={drafts.length===1?t('Save this task','حفظ هذه المهمة'):t(`Save all ${drafts.length} tasks`,`حفظ كل المهام (${drafts.length})`)} disabled={!drafts.some(d=>d.title.trim())} onPress={()=>saveAll(drafts)}/>
      <Label small>{t('Nothing is added until you save. One Undo removes the whole batch.','لن يُضاف شيء قبل الحفظ. زر تراجع واحد يلغي الدفعة كلها.')}</Label></View>}
  </ScrollView></Page></Modal>;
}
