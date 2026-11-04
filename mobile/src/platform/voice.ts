import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
const MAX_AUDIO = 6*1024*1024;
type Upload = (url:string, headers:Record<string,string>, signal:AbortSignal) => Promise<{ status:number; text:string }>;
/** Checks a finished recording and returns its format and an uploader that sends the file as the raw request body. */
export async function recordingUpload(uri:string):Promise<{ format:'m4a'|'webm'; upload:Upload }> {
  if (Platform.OS !== 'web') {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.size > MAX_AUDIO) throw new Error('Recording unavailable or too large. Try a shorter message.');
    return { format:'m4a', upload:async (url, headers, signal) => {
      const task = FileSystem.createUploadTask(url, uri, { httpMethod:'POST', uploadType:FileSystem.FileSystemUploadType.BINARY_CONTENT, headers:{ ...headers, 'Content-Type':'audio/mp4' } });
      const cancel = () => void task.cancelAsync().catch(() => {});
      signal.addEventListener('abort', cancel, { once:true });
      try {
        const result = await task.uploadAsync();
        if (!result) throw new Error('Upload cancelled.');
        return { status:result.status, text:result.body };
      } finally { signal.removeEventListener('abort', cancel); }
    } };
  }
  const blob = await (await fetch(uri)).blob();
  if (blob.size > MAX_AUDIO) throw new Error('Recording is too large. Try a shorter message.');
  const format = blob.type.includes('mp4') ? 'm4a' as const : 'webm' as const;
  return { format, upload:async (url, headers, signal) => {
    const response = await fetch(url, { method:'POST', signal, body:blob, headers:{ ...headers, 'Content-Type':blob.type || 'audio/webm' } });
    return { status:response.status, text:await response.text() };
  } };
}
export async function discardRecording(uri:string) { if (Platform.OS !== 'web') await FileSystem.deleteAsync(uri,{ idempotent:true }).catch(() => {}); }
// An unsent recording's file is remembered per screen, so it survives the app being closed. Browser
// recordings are in-memory blob URLs that end with the page, so only native files are remembered.
const keptKey = (key:string) => `mypa_voice_kept:${key}`;
export async function keepRecording(key:string, uri:string) { if (Platform.OS !== 'web') await AsyncStorage.setItem(keptKey(key),uri).catch(() => {}); }
export async function forgetKept(key:string) { await AsyncStorage.removeItem(keptKey(key)).catch(() => {}); }
export async function keptRecording(key:string) {
  if (Platform.OS === 'web') return null;
  const uri = await AsyncStorage.getItem(keptKey(key)).catch(() => null);
  if (uri && (await FileSystem.getInfoAsync(uri)).exists) return uri;
  if (uri) await forgetKept(key);
  return null;
}
