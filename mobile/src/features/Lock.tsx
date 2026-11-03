import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Brand } from '../app/Brand';
import { Icon, useText, useTheme } from '../app/ui';
import { checkPin, setPhoneUnlock, setPin, unlockWithPhone, useLock } from '../platform/lock';

/** Full-screen PIN pad: chooses a PIN on first run, otherwise unlocks with the PIN or the phone's own unlock. */
export function Lock() {
  const lock = useLock(), t = useText(), c = useTheme(), setup = lock.mode === 'setup';
  const [entered,setEntered] = useState(''), [first,setFirst] = useState<string|null>(null), [error,setError] = useState(''), [now,setNow] = useState(Date.now());
  const busy = useRef(false);
  const reason = t('Unlock My PA','افتح My PA'), cancel = t('Use PIN','استخدم الرقم السري');
  const waiting = lock.waitUntil > now;
  useEffect(() => { if (!setup && lock.phoneUnlock) void unlockWithPhone(reason,cancel); },[]); // Ask once when the lock appears, like the phone does.
  useEffect(() => { if (!waiting) return; const timer = setInterval(() => setNow(Date.now()),1000); return () => clearInterval(timer); },[waiting]);
  async function complete(pin:string) {
    busy.current = true;
    try {
      if (!setup) { const result = await checkPin(pin); if (result !== 'ok') { setError(result === 'wrong' ? t('Wrong PIN','رقم خاطئ') : ''); setNow(Date.now()); setEntered(''); } return; }
      if (first === null) { setFirst(pin); setEntered(''); setError(''); return; }
      if (first !== pin) { setFirst(null); setEntered(''); setError(t("PINs didn't match. Try again.",'الرقمان غير متطابقين. حاول مجدداً.')); return; }
      if (lock.phoneAvailable && !lock.phoneUnlock) await setPhoneUnlock(true,t('Turn on unlock like your phone','فعّل الفتح مثل هاتفك'),t('Not now','ليس الآن'));
      await setPin(pin);
    } finally { busy.current = false; }
  }
  const press = (digit:string) => { if (busy.current || waiting || entered.length >= 4) return; const next = entered + digit; setEntered(next); if (next.length === 4) void complete(next); };
  const key = (label:string, onPress:()=>void, content?:ReactNode, a11y?:string) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={a11y ?? label} onPress={onPress} disabled={waiting}
    style={({ pressed }) => ({ width:76,height:76,borderRadius:38,alignItems:'center',justifyContent:'center',backgroundColor:pressed ? c.accentSoft : c.surface,borderWidth:1,borderColor:c.line,opacity:waiting ? 0.45 : 1 })}>
    {content ?? <Text style={{ fontSize:28,fontWeight:'600',color:c.ink }}>{label}</Text>}</Pressable>;
  const title = setup ? (first === null ? t('Secure your assistant','احمِ مساعدك') : t('Enter the PIN again','أدخل الرقم مرة أخرى')) : t('Enter your PIN','أدخل الرقم السري');
  // A Modal so the lock also covers task editors and other modals that were open when the app relocked.
  return <Modal visible animationType="none" statusBarTranslucent onRequestClose={() => {}}><View accessibilityViewIsModal style={{ flex:1,backgroundColor:c.bg,alignItems:'center',justifyContent:'center',gap:18,padding:24 }}>
    <Brand size={40}/>
    <Text accessibilityRole="header" style={{ fontSize:22,fontWeight:'700',color:c.ink,textAlign:'center' }}>{title}</Text>
    {setup && first === null && <Text style={{ fontSize:14,lineHeight:21,color:c.muted,textAlign:'center',maxWidth:320 }}>{t('Choose a 4-digit PIN. If your phone has Face ID or a fingerprint, you can also unlock the same way you unlock your phone.','اختر رقماً سرياً من ٤ أرقام. وإن كان هاتفك يدعم الوجه أو البصمة، يمكنك الفتح بنفس طريقة فتح هاتفك.')}</Text>}
    <View accessibilityLabel={t(`${entered.length} of 4 digits`,`${entered.length} من ٤ أرقام`)} style={{ flexDirection:'row',gap:16,direction:'ltr' }}>
      {[0,1,2,3].map(i => <View key={i} style={{ width:14,height:14,borderRadius:7,borderWidth:2,borderColor:c.ink,backgroundColor:i < entered.length ? c.ink : 'transparent' }}/>)}</View>
    <Text accessibilityRole="alert" style={{ minHeight:20,color:c.danger,fontSize:14,textAlign:'center' }}>{waiting ? t(`Too many tries. Wait ${Math.ceil((lock.waitUntil - now)/1000)} seconds.`,`محاولات كثيرة. انتظر ${Math.ceil((lock.waitUntil - now)/1000)} ثانية.`) : error}</Text>
    <View style={{ width:76*3+18*2,flexDirection:'row',flexWrap:'wrap',gap:18,direction:'ltr' }}>
      {['1','2','3','4','5','6','7','8','9'].map(d => key(d,() => press(d)))}
      <View style={{ width:76,height:76 }}/>
      {key('0',() => press('0'))}
      {key('back',() => setEntered(entered.slice(0,-1)),<Icon name="back" size={26} color={c.ink} width={2}/>,t('Delete','حذف'))}</View>
    {!setup && lock.phoneUnlock && <Pressable accessibilityRole="button" onPress={() => void unlockWithPhone(reason,cancel)}
      style={({ pressed }) => ({ flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:c.gold,borderRadius:14,paddingHorizontal:18,paddingVertical:12,opacity:pressed ? 0.75 : 1 })}>
      <Icon name="finger" size={24} color={c.gold}/><Text style={{ color:c.gold,fontWeight:'700',fontSize:15 }}>{t('Unlock with Face ID / fingerprint','افتح بالوجه / البصمة')}</Text></Pressable>}
  </View></Modal>;
}
