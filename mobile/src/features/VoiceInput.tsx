import {useEffect,useRef,useState} from 'react';
import {AppState,Pressable,Text,View} from 'react-native';
import {AudioModule,RecordingPresets,setAudioModeAsync,useAudioRecorder,useAudioRecorderState} from 'expo-audio';
import * as Speech from 'expo-speech';
import {recordingPayload,discardRecording} from '../platform/voice';
import {transcribe} from '../services/assistant';
import {useStore} from '../data/store';
import {Button,Icon,IconButton,Notice,useText,useTheme} from '../app/ui';
type Phase='idle'|'preparing'|'recording'|'transcribing'|'understanding';
const LIMIT=60;
/* One recorder for every voice entry point: record → upload to the API for transcription → hand the text to the caller. */
export function VoiceInput({available,onText,onBusyChange,compact=false,unavailable}:{available:boolean;onText:(text:string,signal:AbortSignal)=>Promise<void>|void;onBusyChange?:(busy:boolean)=>void;compact?:boolean;unavailable?:string}) {
  const t=useText(),s=useStore(),c=useTheme(),[phase,setPhase]=useState<Phase>('idle'),[error,setError]=useState('');
  const recorder=useAudioRecorder({...RecordingPresets.HIGH_QUALITY,numberOfChannels:1,sampleRate:24000,bitRate:48000}),status=useAudioRecorderState(recorder,250);
  const current=useRef<Phase>('idle'),generation=useRef(0),alive=useRef(true),controller=useRef<AbortController|null>(null);
  function transition(value:Phase){current.current=value;if(alive.current){setPhase(value);onBusyChange?.(value!=='idle');}}
  async function cancel(){generation.current++;controller.current?.abort();try{if(current.current==='recording')await recorder.stop();const uri=recorder.uri;if(uri)await discardRecording(uri);}catch{}finally{void setAudioModeAsync({allowsRecording:false}).catch(()=>{});transition('idle');}}
  useEffect(()=>{alive.current=true;const sub=AppState.addEventListener('change',state=>{if(state!=='active')void cancel();});return()=>{alive.current=false;sub.remove();generation.current++;controller.current?.abort();try{void recorder.stop().catch(()=>{});}catch{}void setAudioModeAsync({allowsRecording:false}).catch(()=>{});};},[]);
  async function start(){
    if(current.current!=='idle')return;setError('');
    if(!available){setError(unavailable??t('Voice-to-text is temporarily unavailable. You can type instead.','تحويل الصوت إلى نص غير متاح حالياً. يمكنك الكتابة بدلاً من ذلك.'));return;}
    const run=++generation.current;transition('preparing');
    try{await Speech.stop();const permission=await AudioModule.requestRecordingPermissionsAsync();if(!permission.granted)throw new Error(t('Allow microphone access in your device settings.','اسمح باستخدام الميكروفون في إعدادات الجهاز.'));if(run!==generation.current)return;
      await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});await recorder.prepareToRecordAsync();if(run!==generation.current){await setAudioModeAsync({allowsRecording:false});return;}recorder.record();transition('recording');
    }catch(e){if(alive.current&&run===generation.current){setError(e instanceof Error?e.message:String(e));transition('idle');}}
  }
  async function stop(){
    if(current.current!=='recording')return;const run=generation.current;transition('transcribing');controller.current=new AbortController();let uri:string|null=null;
    try{await recorder.stop();await setAudioModeAsync({allowsRecording:false});uri=recorder.uri;if(!uri)throw new Error(t('Nothing was recorded. Please try again.','لم يتم تسجيل صوت. حاول مرة أخرى.'));
      const payload=await recordingPayload(uri);const result=await transcribe(payload,s.language,controller.current.signal);if(!alive.current||run!==generation.current)return;transition('understanding');await onText(result.text,controller.current.signal);
    }catch(e){if(alive.current&&run===generation.current)setError(e instanceof Error?e.message:String(e));}
    finally{if(uri)await discardRecording(uri);if(alive.current&&run===generation.current)transition('idle');}
  }
  useEffect(()=>{if(status.isRecording&&status.durationMillis>=LIMIT*1000)void stop();},[status.durationMillis]);
  const recording=phase==='recording',busy=phase!=='idle'&&!recording,seconds=Math.floor(status.durationMillis/1000);
  const caption=recording?`${t('Listening','أسمعك')} · ${seconds} / ${LIMIT} ${t('sec','ث')}`:phase==='preparing'?t('Opening microphone…','فتح الميكروفون…'):phase==='transcribing'?t('Transcribing your voice…','تحويل كلامك إلى نص…'):phase==='understanding'?t('Understanding…','أفهم كلامك…'):t('Tap and speak','اضغط وتحدّث');
  if(compact)return <View style={{gap:8}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:10}}><IconButton icon={recording?'stop':'mic'} label={recording?t('Stop recording','إيقاف التسجيل'):t('Voice message','رسالة صوتية')} tone={recording?c.record:undefined} disabled={busy} onPress={()=>void(recording?stop():start())}/>{phase!=='idle'&&<Text style={{color:recording?c.record:c.muted,fontSize:13,fontWeight:'600'}}>{caption}</Text>}</View>
    {!!error&&<Notice tone="error">{error}</Notice>}</View>;
  return <View style={{alignItems:'center',gap:14,paddingVertical:16}}>
    <View style={{width:132,height:132,borderRadius:66,alignItems:'center',justifyContent:'center',backgroundColor:recording?c.dangerSoft:c.accentSoft}}>
      <Pressable accessibilityRole="button" accessibilityLabel={recording?t('Stop recording','إيقاف التسجيل'):t('Start recording','ابدأ التسجيل')} disabled={busy} onPress={()=>void(recording?stop():start())} style={({pressed})=>({width:92,height:92,borderRadius:46,backgroundColor:recording?c.record:c.accent,alignItems:'center',justifyContent:'center',opacity:busy?.5:pressed?.85:1})}>
        <Icon name={recording?'stop':'mic'} size={36} color={c.onAccent} width={2}/></Pressable></View>
    <Text style={{fontSize:17,fontWeight:'700',color:recording?c.record:c.ink}}>{caption}</Text>
    {recording&&<View style={{width:200,height:6,borderRadius:3,backgroundColor:c.sunk,overflow:'hidden'}}><View style={{width:`${Math.min(100,seconds/LIMIT*100)}%`,height:6,backgroundColor:c.record}}/></View>}
    {phase!=='idle'&&<Button title={t('Cancel recording','إلغاء التسجيل')} secondary onPress={()=>void cancel()}/>}
    {!!error&&<Notice tone="error">{error}</Notice>}
  </View>;
}
