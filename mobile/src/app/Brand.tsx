import { View, Text } from 'react-native';
import { useStore } from '../data/store';
import { useTheme } from './theme';
/** "My PA" plus the name the user gave their assistant, e.g. "My PA Sara". */
export function Brand({ size=34, wordmark=true }: { size?:number; wordmark?:boolean }) {
  const c = useTheme(), { assistantName } = useStore();
  return <View accessibilityLabel={assistantName ? `My PA ${assistantName}` : 'My PA'} style={{ flexDirection:'row', alignItems:'center', gap:10, flexShrink:1 }}>
    <View style={{ width:size, height:size, borderRadius:size*0.3, backgroundColor:c.ink, alignItems:'center', justifyContent:'center' }}><Text style={{ color:c.gold, fontWeight:'800', fontSize:size*0.38, letterSpacing:0.5 }}>PA</Text></View>
    {wordmark && <Text numberOfLines={1} style={{ flexShrink:1, fontSize:size*0.6, fontWeight:'800', letterSpacing:-0.6, color:c.ink }}>My PA{assistantName ? <Text style={{ color:c.accent }}> {assistantName}</Text> : null}</Text>}</View>;
}
