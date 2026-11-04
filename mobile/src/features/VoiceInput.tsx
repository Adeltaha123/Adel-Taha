import {useEffect,useRef,useState} from 'react';
import {AppState,Pressable,Text,View} from 'react-native';
import {AudioModule,RecordingPresets,setAudioModeAsync,useAudioRecorder,useAudioRecorderState} from 'expo-audio';
import * as Speech from 'expo-speech';
import {discardRecording,forgetKept,keepRecording,keptRecording} from '../platform/voice';
import {transcribe} from '../services/assistant';
import {useStore} from '../data/store';
import {Button,Icon,IconButton,Notice,useText,useTheme} from '../app/ui';
type Phase='idle'|'preparing'|'recording'|'paused'|'transcribing'|'understanding';
const LIMIT=120; // Seconds of speech; paused time does not count.
/* One recorder for every voice entry point: record → upload to the API for transcription → hand the text to the caller.
   A recording can be paused and continued. Leaving the app or the screen locking pauses it too, so nothing ends
   until the user stops it. A finished recording is kept until its text arrives, so a failed upload can be retried. */
export function VoiceInput({available,onText,onBusyChange,compact=false,unavailable,keepKey}:{available:boolean;onText:(text:string,signal:AbortSignal)=>Promise<void>|void;onBusyChange?:(busy:boolean)=>void;compact?:boolean;unavailable?:string;keepKey?:string}) {
  const t=useText(),s=useStore(),c=useTheme(),[phase,setPhase]=useState<Phase>('idle'),[error,setError]=useState(''),[kept,setKept]=useState<string|null>(null);
  const recorder=useAudioRecorder({...RecordingPresets.HIGH_QUALITY,numberOfChannels:1,sampleRate:24000,bitRate:48000}),status=useAudioRecorderState(recorder,250);
  const current=useRef<Phase>('idle'),generation=useRef(0),alive=useRef(true),controller=useRef<AbortController|null>(null),keptUri=useRef<string|null>(null);
  function transition(value:Phase){current.current=value;if(alive.current){setPhase(value);onBusyChange?.(value!=='idle');}}
  function keep(uri:string|null){keptUri.current=uri;if(alive.current)setKept(uri);if(keepKey)void(uri?keepRecording(keepKey,uri):forgetKept(keepKey));}
  async function drop(){const uri=keptUri.current;keep(null);if(uri)await discardRecording(uri);}
  async function cancel(){generation.current++;controller.current?.abort();try{if(current.current==='recording'||current.current==='paused')await recorder.stop();await drop();const uri=recorder.uri;if(uri)await discardRecording(uri);}catch{}finally{void setAudioModeAsync({allowsRecording:false}).catch(()=>{});transition('idle');}}
  /** Pauses an ongoing recording. If the device cannot pause, the recording so far is kept to send instead of lost. */
  function pause(){
    if(current.current!=='recording')return;
    try{recorder.pause();transition('paused');}
    catch{transition('transcribing');void finish().then(()=>transition('idle'),e=>{if(alive.current)setError(e instanceof Error?e.message:String(e));transition('idle');});}
  }
  /** Continues a paused recording in the same file. If the microphone was taken away meanwhile, what was said is kept to send. */
  async function proceed(){
    if(current.current!=='paused')return;
    try{await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});recorder.record();transition('recording');}
    catch{transition('transcribing');try{await finish();setError(t('The recording could not continue. What you said so far is saved below.','تعذّر استكمال التسجيل. ما قلته حتى الآن محفوظ بالأسفل.'));}catch(e){setError(e instanceof Error?e.message:String(e));}transition('idle');}
  }
  /** Ends the recording and keeps its file; nothing is uploaded yet. */
  async function finish(){await recorder.stop();await setAudioModeAsync({allowsRecording:false});const uri=recorder.uri;if(!uri)throw new Error(t('Nothing was recorded. Please try again.','لم يتم تسجيل صوت. حاول مرة أخرى.'));keep(uri);return uri;}
  async function send(uri:string){
    const run=++generation.current;transition('transcribing');setError('');controller.current=new AbortController();
    try{const result=await transcribe(uri,s.language,controller.current.signal);if(!alive.current||run!==generation.current)return;
      await drop();transition('understanding');await onText(result.text,controller.current.signal);
    }catch(e){if(alive.current&&run===generation.current)setError(e instanceof Error?e.message:String(e));}
    finally{if(alive.current&&run===generation.current)transition('idle');}
  }
  async function stop(){
    if(current.current!=='recording'&&current.current!=='paused')return;transition('transcribing');
    try{await send(await finish());}catch(e){if(alive.current){setError(e instanceof Error?e.message:String(e));transition('idle');}}
  }
  useEffect(()=>{alive.current=true;
    if(keepKey)void keptRecording(keepKey).then(uri=>{if(alive.current&&uri&&!keptUri.current){keptUri.current=uri;setKept(uri);}});
    // Leaving the app or locking the screen pauses; the user continues or sends when they are back.
    const sub=AppState.addEventListener('change',state=>{if(state!=='active')pause();});
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
  const recording=phase==='recording',paused=phase==='paused',live=recording||paused,busy=phase!=='idle'&&!live,seconds=Math.floor(status.durationMillis/1000);
  const caption=recording?`${t('Listening','أسمعك')} · ${seconds} / ${LIMIT} ${t('sec','ث')}`:paused?`${t('Paused','متوقف مؤقتاً')} · ${seconds} / ${LIMIT} ${t('sec','ث')}`:phase==='preparing'?t('Opening microphone…','فتح الميكروفون…'):phase==='transcribing'?t('Transcribing your voice…','تحويل كلامك إلى نص…'):phase==='understanding'?t('Understanding…','أفهم كلامك…'):t('Tap and speak','اضغط وتحدّث');
  // The big button: start, stop and send, or continue after a pause.
  const main=()=>void(recording?stop():paused?proceed():start());
  const mainLabel=recording?t('Stop recording','إيقاف التسجيل'):paused?t('Continue recording','متابعة التسجيل'):t('Start recording','ابدأ التسجيل');
  const unsent=phase==='idle'&&!!kept&&<View style={{gap:8,alignSelf:'stretch'}}>
    <Notice>{t('Your last recording is saved but not turned into text yet.','تسجيلك الأخير محفوظ ولم يتحول إلى نص بعد.')}</Notice>
    <Button icon="send" title={t('Try again','حاول مرة أخرى')} disabled={!available} onPress={()=>void send(kept)}/>
    <Button title={t('Delete recording','حذف التسجيل')} secondary onPress={()=>void drop()}/></View>;
  if(compact)return <View style={{gap:8}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:10}}><IconButton icon={recording?'stop':'mic'} label={recording?t('Stop recording','إيقاف التسجيل'):paused?t('Continue recording','متابعة التسجيل'):t('Voice message','رسالة صوتية')} tone={live?c.record:undefined} disabled={busy} onPress={main}/>
      {recording&&<IconButton icon="pause" size={36} label={t('Pause recording','إيقاف مؤقت')} onPress={pause}/>}
      {paused&&<IconButton icon="stop" size={36} label={t('Stop and send','إيقاف وإرسال')} onPress={()=>void stop()}/>}
      {phase!=='idle'&&<Text style={{color:live?c.record:c.muted,fontSize:13,fontWeight:'600'}}>{caption}</Text>}</View>
    {!!error&&<Notice tone="error">{error}</Notice>}{unsent}</View>;
  return <View style={{alignItems:'center',gap:14,paddingVertical:16}}>
    <View style={{width:132,height:132,borderRadius:66,alignItems:'center',justifyContent:'center',backgroundColor:live?c.dangerSoft:c.accentSoft}}>
      <Pressable accessibilityRole="button" accessibilityLabel={mainLabel} disabled={busy} onPress={main} style={({pressed})=>({width:92,height:92,borderRadius:46,backgroundColor:recording?c.record:c.accent,alignItems:'center',justifyContent:'center',opacity:busy?.5:pressed?.85:1})}>
        <Icon name={recording?'stop':'mic'} size={36} color={c.onAccent} width={2}/></Pressable></View>
    <Text style={{fontSize:17,fontWeight:'700',color:live?c.record:c.ink}}>{caption}</Text>
    {live&&<View style={{width:200,height:6,borderRadius:3,backgroundColor:c.sunk,overflow:'hidden'}}><View style={{width:`${Math.min(100,seconds/LIMIT*100)}%`,height:6,backgroundColor:c.record}}/></View>}
    {recording&&<Button title={t('Pause','إيقاف مؤقت')} icon="pause" secondary onPress={pause}/>}
    {paused&&<Button title={t('Stop and send','إيقاف وإرسال')} icon="send" onPress={()=>void stop()}/>}
    {phase!=='idle'&&<Button title={t('Cancel recording','إلغاء التسجيل')} secondary onPress={()=>void cancel()}/>}
    {!!error&&<Notice tone="error">{error}</Notice>}{unsent}
  </View>;
}
