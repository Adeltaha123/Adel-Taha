import { useState } from 'react';
import { View } from 'react-native';
import { promptInstall, useInstall } from '../platform/install';
import { Button, Card, Eyebrow, Label, useText } from '../app/ui';

/** "Add to Home Screen" on the website: the browser's prompt where there is one, otherwise the iPhone steps. */
export function InstallCard({ onDismiss }:{ onDismiss?:()=>void }) {
  const install = useInstall(), t = useText(), [steps,setSteps] = useState(false);
  if (install.installed) return null;
  if (!install.canPrompt && !install.ios) return null; // A browser that cannot install: nothing to offer.
  return <Card><Eyebrow>{t('MY PA AS AN APP','My PA كتطبيق')}</Eyebrow>
    <Label strong>{t('Add My PA to your home screen to open it like an app, full screen.','أضف My PA للشاشة الرئيسية لتفتحه زي التطبيق، بملء الشاشة.')}</Label>
    {install.canPrompt
      ? <Button title={t('Add to Home Screen','إضافة للشاشة الرئيسية')} icon="plus" onPress={() => void promptInstall()}/>
      : steps
        ? <View style={{ gap:6 }}>
            <Label>{t('1. Tap the Share button (the square with an arrow) at the bottom of Safari.','١. اضغط زر المشاركة (المربع اللي فيه سهم) أسفل Safari.')}</Label>
            <Label>{t('2. Scroll down and tap “Add to Home Screen”, then “Add”.','٢. انزل واضغط «إضافة إلى الشاشة الرئيسية»، ثم «إضافة».')}</Label>
            <Label small>{t('On iPhone this works from Safari; from inside WhatsApp, open the link in Safari first.','على الآيفون تعمل من Safari؛ لو فتحت الرابط من واتساب افتحه في Safari أولاً.')}</Label></View>
        : <Button title={t('Add to Home Screen','إضافة للشاشة الرئيسية')} icon="plus" onPress={() => setSteps(true)}/>}
    {onDismiss && <Button title={t('Not now','ليس الآن')} secondary onPress={onDismiss}/>}
  </Card>;
}
