import { useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { providers, socialSignIn, useStore, type SocialProvider } from '../data/store';
import { Notice, useText, useTheme } from '../app/ui';

const logos:Record<SocialProvider,(color:string)=>ReactElement> = {
  google:() => <Svg width={20} height={20} viewBox="0 0 48 48"><Path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z"/><Path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><Path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z"/><Path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z"/></Svg>,
  apple:color => <Svg width={20} height={20} viewBox="0 0 24 24"><Path fill={color} d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.9-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.8zM14.1 5.8c.6-.8 1.1-1.8 1-2.9-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.8 1 .1 2.1-.5 2.7-1.3z"/></Svg>,
  facebook:() => <Svg width={22} height={22} viewBox="0 0 24 24"><Path fill="#0866FF" d="M6.9 6C4.3 6 2.4 9.3 2.4 12.9c0 2.5 1.2 4.2 3 4.2 1.4 0 2.5-.9 4.3-3.9l1-1.7.4.7c1.9 3.2 3.2 4.9 5.2 4.9 2.2 0 3.6-2.1 3.6-5.1C19.9 8.6 17.9 6 15.6 6c-1.5 0-2.7 1-3.9 2.7C10.4 7 9 6 6.9 6zm.1 2c1.1 0 2.1.9 3.4 2.9-1.6 2.6-2.6 4.2-3.8 4.2-1 0-1.7-.9-1.7-2.5C4.9 10.3 5.9 8 7 8zm8.4 0c1.3 0 2.3 1.9 2.3 4.6 0 1.6-.5 2.6-1.5 2.6-1.1 0-1.9-1.3-3.6-4.2C14 9 14.6 8 15.4 8z"/></Svg>,
};
const labels:Record<SocialProvider,[string,string]> = { google:['Google','Google'], apple:['Apple','Apple'], facebook:['Meta (Facebook)','ميتا (فيسبوك)'] };

/** Continue with Google / Apple / Meta. In link mode it attaches a provider to the signed-in account. */
export function SocialSignIn({ link=false, onLinked }: { link?:boolean; onLinked?:(provider:SocialProvider)=>void }) {
  const t = useText(), c = useTheme(), s = useStore(), [enabled,setEnabled] = useState<Record<SocialProvider,boolean>|null>(null), [working,setWorking] = useState<SocialProvider|null>(null), [error,setError] = useState('');
  useEffect(() => { let alive = true; providers().then(p => { if (alive) setEnabled({ google:p.google?.enabled ?? false, apple:p.apple?.enabled ?? false, facebook:p.facebook?.enabled ?? false }); }).catch(() => { if (alive) setEnabled({ google:false, apple:false, facebook:false }); }); return () => { alive = false; }; },[]);
  async function go(provider:SocialProvider) {
    if (working || s.busy) return; setError(''); setWorking(provider);
    try { const outcome = await socialSignIn(provider,link); if (outcome === 'linked') onLinked?.(provider); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setWorking(null); }
  }
  const none = enabled && !Object.values(enabled).some(Boolean);
  return <View style={{ gap:10 }}>
    {(['google','apple','facebook'] as const).map(p => { const dark = p === 'apple', name = t(...labels[p]);
      return <Pressable key={p} accessibilityRole="button" accessibilityLabel={link ? t(`Link ${labels[p][0]}`,`ربط ${labels[p][1]}`) : t(`Continue with ${labels[p][0]}`,`المتابعة باستخدام ${labels[p][1]}`)} disabled={!!working} onPress={() => void go(p)}
        style={({ pressed }) => ({ minHeight:52,borderRadius:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,borderWidth:1,
          backgroundColor:dark ? (c.dark ? '#FFFFFF' : '#000000') : c.surface,borderColor:dark ? 'transparent' : c.line,opacity:enabled && !enabled[p] ? 0.55 : pressed ? 0.85 : 1 })}>
        {working === p ? <ActivityIndicator color={dark ? (c.dark ? '#000' : '#fff') : c.accent}/> : logos[p](dark ? (c.dark ? '#000000' : '#FFFFFF') : c.ink)}
        <Text style={{ fontSize:16,fontWeight:'700',color:dark ? (c.dark ? '#000000' : '#FFFFFF') : c.ink }}>{link ? t(`Link ${name}`,`ربط ${name}`) : t(`Continue with ${name}`,`المتابعة باستخدام ${name}`)}</Text></Pressable>; })}
    {none && <Text style={{ fontSize:12,color:c.muted,textAlign:'center' }}>{t('Social sign-in is not set up on the server yet.','تسجيل الدخول بالحسابات الاجتماعية غير مفعّل على الخادم بعد.')}</Text>}
    {!!error && <Notice tone="error">{error}</Notice>}
  </View>;
}
