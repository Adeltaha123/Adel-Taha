import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
export async function recordingPayload(uri:string) {
  if (Platform.OS !== 'web') {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.size > 6*1024*1024) throw new Error('Recording unavailable or too large. Try a shorter message.');
    return { audio:await FileSystem.readAsStringAsync(uri,{ encoding:FileSystem.EncodingType.Base64 }),format:'m4a' as const };
  }
  const blob = await (await fetch(uri)).blob();
  if (blob.size > 6*1024*1024) throw new Error('Recording is too large. Try a shorter message.');
  const audio = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(String(reader.result).split(',')[1]!); reader.readAsDataURL(blob); });
  return { audio,format:blob.type.includes('mp4') ? 'm4a' as const : 'webm' as const };
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
