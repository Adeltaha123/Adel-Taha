import {useEffect,useRef,useState} from 'react';
import {AppState,Pressable,Text,View} from 'react-native';
import {AudioModule,RecordingPresets,setAudioModeAsync,useAudioRecorder,useAudioRecorderState} from 'expo-audio';
import * as Speech from 'expo-speech';
import {recordingPayload,discardRecording,forgetKept,keepRecording,keptRecording} from '../platform/voice';
import {transcribe} from '../services/assistant';
import {useStore} from '../data/store';
import {Button,Icon,IconButton,Notice,useText,useTheme} from '../app/ui';
type Phase='idle'|'preparing'|'recording'|'transcribing'|'understanding';
const LIMIT=60;
/* One recorder for every voice entry point: record → upload to the API for transcription → hand the text to the caller.
   A finished recording is kept until its text arrives: leaving the app (or the screen turning off) stops the recording
   and transcribes it on return, and a failed upload can be retried instead of losing what was said. */
export function VoiceInput({available,onText,onBusyChange,compact=false,unavailable,keepKey}:{available:boolean;onText:(text:string,signal:AbortSignal)=>Promise<void>|void;onBusyChange?:(busy:boolean)=>void;compact?:boolean;unavailable?:string;keepKey?:string}) {
  const t=useText(),s=useStore(),c=useTheme(),[phase,setPhase]=useState<Phase>('idle'),[error,setError]=useState(''),[kept,setKept]=useState<string|null>(null);
  const recorder=useAudioRecorder({...RecordingPresets.HIGH_QUALITY,numberOfChannels:1,sampleRate:24000,bitRate:48000}),status=useAudioRecorderState(recorder,250);
  const current=useRef<Phase>('idle'),generation=useRef(0),alive=useRef(true),controller=useRef<AbortController|null>(null),keptUri=useRef<string|null>(null),resume=useRef(false);
  function transition(value:Phase){current.current=value;if(alive.current){setPhase(value);onBusyChange?.(value!=='idle');}}
  function keep(uri:string|null){keptUri.current=uri;if(alive.current)setKept(uri);if(keepKey)void(uri?keepRecording(keepKey,uri):forgetKept(keepKey));}
  async function drop(){const uri=keptUri.current;keep(null);if(uri)await discardRecording(uri);}
  async function cancel(){generation.current++;controller.current?.abort();resume.current=false;try{if(current.current==='recording')await recorder.stop();await drop();const uri=recorder.uri;if(uri)await discardRecording(uri);}catch{}finally{void setAudioModeAsync({allowsRecording:false}).catch(()=>{});transition('idle');}}
  /** Ends the recording and keeps its file; nothing is uploaded yet. */
  async function finish(){await recorder.stop();await setAudioModeAsync({allowsRecording:false});const uri=recorder.uri;if(!uri)throw new Error(t('Nothing was recorded. Please try again.','لم يتم تسجيل صوت. حاول مرة أخرى.'));keep(uri);return uri;}
  async function send(uri:string){
    const run=++generation.current;transition('transcribing');setError('');controller.current=new AbortController();
    try{const payload=await recordingPayload(uri);const result=await transcribe(payload,s.language,controller.current.signal);if(!alive.current||run!==generation.current)return;
      await drop();transition('understanding');await onText(result.text,controller.current.signal);
    }catch(e){if(alive.current&&run===generation.current)setError(e instanceof Error?e.message:String(e));}
    finally{if(alive.current&&run===generation.current)transition('idle');}
  }
  async function stop(){
    if(current.current!=='recording')return;transition('transcribing');
    try{await send(await finish());}catch(e){if(alive.current){setError(e instanceof Error?e.message:String(e));transition('idle');}}
  }
  useEffect(()=>{alive.current=true;
    if(keepKey)void keptRecording(keepKey).then(uri=>{if(alive.current&&uri&&!keptUri.current){keptUri.current=uri;setKept(uri);}});
    const sub=AppState.addEventListener('change',state=>{
      if(state!=='active'){if(current.current==='recording'){resume.current=true;transition('transcribing');void finish().catch(e=>{resume.current=false;if(alive.current)setError(e instanceof Error?e.message:String(e));}).finally(()=>{if(current.current==='transcribing'&&!resume.current)transition('idle');});}return;}
      if(resume.current){resume.current=false;const uri=keptUri.current;if(uri)void send(uri);else transition('idle');}
    });
    return()=>{alive.current=false;sub.remove();generation.current++;controller.current?.abort();try{void recorder.stop().catch(()=>{});}catch{}void setAudioModeAsync({allowsRecording:false}).catch(()=>{});};},[]);
  async function start(){
    if(current.current!=='idle')return;setError('');
    if(!available){setError(unavailable??t('Voice-to-text is temporarily unavailable. You can type instead.','تحويل الصوت إلى نص غير متاح حالياً. يمكنك الكتابة بدلاً من ذلك.'));return;}
    await drop(); // A new recording replaces an unsent one.
    const run=++generation.current;transition('preparing');
    try{await Speech.stop();const permission=await AudioModule.requestRecordingPermissionsAsync();if(!permission.granted)throw new Error(t('Allow microphone access in your device settings.','اسمح باستخدام الميكروفون في إعدادات الجهاز.'));if(run!==generation.current)return;
      await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});await recorder.prepareToRecordAsync();if(run!==generation.current){await setAudioModeAsync({allowsRecording:false});return;}recorder.record();transition('recording');
    }catch(e){if(alive.current&&run===generation.current){setError(e instanceof Error?e.message:String(e));transition('idle');}}
  }
  useEffect(()=>{if(status.isRecording&&status.durationMillis>=LIMIT*1000)void stop();},[status.durationMillis]);
  const recording=phase==='recording',busy=phase!=='idle'&&!recording,seconds=Math.floor(status.durationMillis/1000);
  const caption=recording?`${t('Listening','أسمعك')} · ${seconds} / ${LIMIT} ${t('sec','ث')}`:phase==='preparing'?t('Opening microphone…','فتح الميكروفون…'):phase==='transcribing'?t('Transcribing your voice…','تحويل كلامك إلى نص…'):phase==='understanding'?t('Understanding…','أفهم كلامك…'):t('Tap and speak','اضغط وتحدّث');
  const unsent=phase==='idle'&&!!kept&&<View style={{gap:8,alignSelf:'stretch'}}>
    <Notice>{t('Your last recording is saved but not turned into text yet.','تسجيلك الأخير محفوظ ولم يتحول إلى نص بعد.')}</Notice>
    <Button icon="send" title={t('Try again','حاول مرة أخرى')} disabled={!available} onPress={()=>void send(kept)}/>
    <Button title={t('Delete recording','حذف التسجيل')} secondary onPress={()=>void drop()}/></View>;
  if(compact)return <View style={{gap:8}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:10}}><IconButton icon={recording?'stop':'mic'} label={recording?t('Stop recording','إيقاف التسجيل'):t('Voice message','رسالة صوتية')} tone={recording?c.record:undefined} disabled={busy} onPress={()=>void(recording?stop():start())}/>{phase!=='idle'&&<Text style={{color:recording?c.record:c.muted,fontSize:13,fontWeight:'600'}}>{caption}</Text>}</View>
    {!!error&&<Notice tone="error">{error}</Notice>}{unsent}</View>;
  return <View style={{alignItems:'center',gap:14,paddingVertical:16}}>
    <View style={{width:132,height:132,borderRadius:66,alignItems:'center',justifyContent:'center',backgroundColor:recording?c.dangerSoft:c.accentSoft}}>
      <Pressable accessibilityRole="button" accessibilityLabel={recording?t('Stop recording','إيقاف التسجيل'):t('Start recording','ابدأ التسجيل')} disabled={busy} onPress={()=>void(recording?stop():start())} style={({pressed})=>({width:92,height:92,borderRadius:46,backgroundColor:recording?c.record:c.accent,alignItems:'center',justifyContent:'center',opacity:busy?.5:pressed?.85:1})}>
        <Icon name={recording?'stop':'mic'} size={36} color={c.onAccent} width={2}/></Pressable></View>
    <Text style={{fontSize:17,fontWeight:'700',color:recording?c.record:c.ink}}>{caption}</Text>
    {recording&&<View style={{width:200,height:6,borderRadius:3,backgroundColor:c.sunk,overflow:'hidden'}}><View style={{width:`${Math.min(100,seconds/LIMIT*100)}%`,height:6,backgroundColor:c.record}}/></View>}
    {phase!=='idle'&&<Button title={t('Cancel recording','إلغاء التسجيل')} secondary onPress={()=>void cancel()}/>}
    {!!error&&<Notice tone="error">{error}</Notice>}{unsent}
  </View>;
}
