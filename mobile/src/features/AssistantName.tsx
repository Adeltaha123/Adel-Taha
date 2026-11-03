import { useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { cleanAssistantName } from '../../../shared/assistant';
import { setAssistantName, skipAssistantName, useStore } from '../data/store';
import { Button, Chip, Eyebrow, Field, Label, Page, styles, useText, useTheme } from '../app/ui';
import { Brand } from '../app/Brand';

const suggestions:[string,string][] = [['Sara','سارة'],['Nour','نور'],['Omar','عمر'],['Layla','ليلى']];

/** Text field plus quick picks for the assistant's name; `value` is shown as "My PA <value>". */
export function AssistantNameField({ value, onChange }: { value:string; onChange:(name:string)=>void }) {
  const t = useText(), c = useTheme(), clean = cleanAssistantName(value);
  return <View style={{ gap:8 }}>
    <Field label={t('Name your assistant','سمِّ مساعدك الشخصي')} value={value} onChangeText={onChange} maxLength={30} placeholder={t('e.g. Sara','مثلاً: سارة')} autoCapitalize="words"/>
    <View style={styles.row}>{suggestions.map(([en,ar]) => { const name = t(en,ar); return <Chip key={en} title={name} active={clean === name} onPress={() => onChange(name)}/>; })}</View>
    {!!value.trim() && (clean ? <Text style={{ color:c.muted,fontSize:13 }}>{t('Your assistant will appear as','سيظهر مساعدك باسم')} <Text style={{ color:c.ink,fontWeight:'800' }}>My PA <Text style={{ color:c.accent }}>{clean}</Text></Text></Text>
      : <Text style={{ color:c.danger,fontSize:13 }}>{t('Use letters only, up to 30.','استخدم حروفاً فقط، حتى ٣٠ حرفاً.')}</Text>)}
  </View>;
}

/** Shown once after signing up with Google, Apple or Meta, which skip the sign-up form. */
export function AssistantNamePrompt() {
  const t = useText(), [name,setName] = useState('');
  return <Modal visible animationType="slide" onRequestClose={skipAssistantName}><Page><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content,{ flexGrow:1,justifyContent:'center' }]}>
    <View style={{ alignItems:'center',gap:12 }}><Brand size={56} wordmark={false}/><Eyebrow>{t('ONE LAST THING','خطوة أخيرة')}</Eyebrow></View>
    <Label big>{t('What should we call your assistant?','ماذا تريد أن تسمّي مساعدك؟')}</Label>
    <Label>{t('Give your personal assistant a name. It will greet you and sign its replies with it.','اختر اسماً لمساعدك الشخصي. سيستخدمه في التحية وفي ردوده.')}</Label>
    <AssistantNameField value={name} onChange={setName}/>
    <Button icon="check" title={t('Save name','حفظ الاسم')} disabled={!cleanAssistantName(name)} onPress={() => setAssistantName(name)}/>
    <Button secondary title={t('Skip for now','تخطَّ الآن')} onPress={skipAssistantName}/>
  </ScrollView></Page></Modal>;
}
