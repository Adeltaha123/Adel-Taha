import type { ReactNode } from 'react';
import { Pressable, Text, TextInput, View, StyleSheet, type TextInputProps, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useStore } from '../data/store';
import { useTheme } from './theme';
export { useTheme } from './theme';
export function useText() { const { language } = useStore(); return (en:string,ar:string) => language === 'ar' ? ar : en; }
const align = (language:string) => ({ textAlign:language === 'ar' ? 'right' as const : 'left' as const });

export const icons = {
  overview:'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z',
  tasks:'M9 6h11M9 12h11M9 18h11M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17',
  assistant:'m12 3 2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2Z',
  library:'M5 4h5v16H5ZM14 4.5l4.6-1 3 15.5-4.6 1Z',
  account:'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  mic:'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0ZM5 11a7 7 0 0 0 14 0M12 18v3',
  stop:'M7 7h10v10H7Z',
  pause:'M8.5 6v12M15.5 6v12',
  send:'M4 12 20 4l-6 16-2.5-6.5Z',
  plus:'M12 5v14M5 12h14',
  close:'M6 6l12 12M18 6 6 18',
  check:'m5 12.5 4.5 4.5L19 7.5',
  moon:'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z',
  sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  speaker:'M4 9h4l5-4v14l-5-4H4ZM17 9a4 4 0 0 1 0 6',
  search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4',
  finger:'M12 11v3a7 7 0 0 1-1.5 4.3M8.5 7.5A5 5 0 0 1 17 11v1.5a12 12 0 0 1-.8 4.3M5.6 9.6A7 7 0 0 1 19 11v1M8 13.5a10 10 0 0 1-1.6 4.8M14.5 13.5a14 14 0 0 1-1.2 5.5M4 6.5A9.5 9.5 0 0 1 21 9',
  back:'M15 6l-6 6 6 6',
};
export function Icon({ name, size=22, color, width=1.8 }: { name:keyof typeof icons; size?:number; color:string; width?:number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d={icons[name]} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}
export function Label({ children, big=false, strong=false, small=false }: { children:ReactNode; big?:boolean; strong?:boolean; small?:boolean }) {
  const { language } = useStore(), c = useTheme();
  return <Text style={[big ? styles.heading : styles.text, small && { fontSize:12, lineHeight:17 }, { color:big || strong ? c.ink : c.muted }, align(language)]}>{children}</Text>;
}
export function Eyebrow({ children, color }: { children:ReactNode; color?:string }) {
  const c = useTheme(), { language } = useStore();
  return <Text style={[{ color:color ?? c.accent, fontSize:11, fontWeight:'700', letterSpacing:language === 'ar' ? 0 : 1.4 }, align(language)]}>{children}</Text>;
}
export function Button({ title, onPress, disabled=false, secondary=false, danger=false, icon, label }: { title:string; onPress:()=>void; disabled?:boolean; secondary?:boolean; danger?:boolean; icon?:keyof typeof icons; label?:string }) {
  const c = useTheme(), fg = danger ? c.danger : secondary ? c.accent : c.onAccent;
  return <Pressable accessibilityRole="button" accessibilityLabel={label ?? title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor:danger ? c.dangerSoft : secondary ? c.accentSoft : c.accent }, pressed && { opacity:0.8, transform:[{ scale:0.98 }] }, disabled && { opacity:0.45 }]}>
    {icon && <Icon name={icon} size={18} color={fg} width={2}/>}<Text style={{ color:fg, fontWeight:'700', fontSize:15, textAlign:'center' }}>{title}</Text></Pressable>;
}
export function IconButton({ icon, label, onPress, active=false, disabled=false, size=44, tone }: { icon:keyof typeof icons; label:string; onPress:()=>void; active?:boolean; disabled?:boolean; size?:number; tone?:string }) {
  const c = useTheme(), bg = tone ?? (active ? c.accent : c.sunk);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected:active }} disabled={disabled} onPress={onPress} hitSlop={6}
    style={({ pressed }) => [{ width:size, height:size, borderRadius:size/2, backgroundColor:bg, alignItems:'center', justifyContent:'center' }, pressed && { opacity:0.75 }, disabled && { opacity:0.45 }]}>
    <Icon name={icon} size={size*0.46} color={tone || active ? c.onAccent : c.ink} width={2}/></Pressable>;
}
export function Chip({ title, active, onPress, label }: { title:string; active:boolean; onPress:()=>void; label?:string }) {
  const c = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label ?? title} accessibilityState={{ selected:active }} onPress={onPress}
    style={{ minHeight:38, paddingHorizontal:14, borderRadius:999, justifyContent:'center', backgroundColor:active ? c.ink : c.surface, borderWidth:1, borderColor:active ? c.ink : c.line }}>
    <Text style={{ color:active ? c.bg : c.ink, fontWeight:'600', fontSize:13 }}>{title}</Text></Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label:string }) {
  const { language } = useStore(), c = useTheme();
  return <View style={{ gap:6 }}><Text style={[{ color:c.muted, fontSize:13, fontWeight:'600' }, align(language)]}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={c.faint} style={[styles.input,{ backgroundColor:c.surface, borderColor:c.line, color:c.ink }, align(language)]} {...props} /></View>;
}
export function Card({ children, style }: { children:ReactNode; style?:StyleProp<ViewStyle> }) { const c = useTheme(); return <View style={[styles.card,{ backgroundColor:c.surface, borderColor:c.line }, style]}>{children}</View>; }
export function Notice({ children, tone='info' }: { children:ReactNode; tone?:'info'|'error' }) {
  const c = useTheme();
  return <View accessibilityRole={tone === 'error' ? 'alert' : undefined} style={{ backgroundColor:tone === 'error' ? c.dangerSoft : c.goldSoft, borderRadius:14, padding:14 }}><Text style={{ color:c.ink, fontSize:14, lineHeight:21 }}>{children}</Text></View>;
}
export function Page({ children }: { children:ReactNode }) {
  const c = useTheme(), { language } = useStore();
  return <SafeAreaView style={{ flex:1, backgroundColor:c.bg, direction:language === 'ar' ? 'rtl' : 'ltr' }}>{children}</SafeAreaView>;
}
export const styles = StyleSheet.create({
  content:{ padding:20, gap:16, paddingBottom:40 },
  heading:{ fontSize:24, lineHeight:31, letterSpacing:-0.6, fontWeight:'700' }, text:{ fontSize:15, lineHeight:22 },
  card:{ borderRadius:20, padding:18, gap:12, borderWidth:1 },
  button:{ minHeight:48, flexDirection:'row', gap:8, alignItems:'center', justifyContent:'center', paddingHorizontal:18, paddingVertical:12, borderRadius:14 },
  input:{ borderWidth:1, borderRadius:14, padding:13, minHeight:50, fontSize:16 },
  row:{ flexDirection:'row', flexWrap:'wrap', gap:8, alignItems:'center' },
});
