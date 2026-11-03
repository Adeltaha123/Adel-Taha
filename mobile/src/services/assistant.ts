import {api,origin} from '../data/store';
import type {Language} from '../../../shared/domain';
import type {AssistantReply} from '../../../shared/assistant';
import {dayKey} from '../../../shared/productivity';
import type {recordingPayload} from '../platform/voice';
export const transcribe=(audio:Awaited<ReturnType<typeof recordingPayload>>,language:Language,signal:AbortSignal)=>api<{text:string}>('/assistant/transcribe',{...audio,language},55000,signal);
/** Splits one dictation into up to 20 prioritized task proposals. */
export const understandTasks=(message:string,language:Language,signal?:AbortSignal,assistantName='')=>api<AssistantReply>('/assistant/chat',{message,language,today:dayKey(),tasks:[],history:[],intent:'tasks',...(assistantName?{assistantName}:{})},90000,signal);
/** Resolves to null when voice and AI are ready, otherwise to a message that says what is missing. */
export async function voiceStatus(signedIn:boolean,t:(en:string,ar:string)=>string):Promise<string|null> {
  if(!signedIn)return t('Sign in from Account to turn on voice and AI. You can still type and save tasks.','سجّل الدخول من الحساب لتفعيل الصوت والذكاء الاصطناعي. يمكنك كتابة المهام وحفظها الآن.');
  try{const status=await api<{configured:boolean}>('/assistant/status');
    return status.configured?null:t('Voice is off on the server: add OPENAI_API_KEY to the .env file in the project root and restart it.','الصوت غير مفعّل على الخادم: أضف OPENAI_API_KEY إلى ملف .env في مجلد المشروع ثم أعد تشغيله.');
  }catch(e){return e instanceof Error?e.message:t(`Can't reach the server at ${origin}.`,`تعذّر الوصول إلى الخادم ${origin}.`);}
}
