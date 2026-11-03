import { useColorScheme } from 'react-native';
import { useStore } from '../data/store';
// Same brand as the web app (src/styles/app.css): deep green accent, warm gold highlights.
const light = {
  bg:'#F3F5F2', surface:'#FFFFFF', sunk:'#E8EDE9', ink:'#14201C', muted:'#5B6964', faint:'#8A9792', line:'#DCE3DF',
  accent:'#0E6B5C', accentSoft:'#DCEFE9', onAccent:'#FFFFFF', gold:'#A87A22', goldSoft:'#F6ECD6', danger:'#B3261E', dangerSoft:'#F9E1DE',
  hero:'#14201C', heroInk:'#F3F5F2', heroMuted:'#A9BDB6', record:'#C0402C',
  q:['', '#C0402C', '#0E6B5C', '#A87A22', '#7A8681'] as readonly string[],
};
export type Palette = typeof light;
const dark:Palette = {
  bg:'#0C1311', surface:'#141E1B', sunk:'#1B2723', ink:'#E6EDE9', muted:'#93A39D', faint:'#6F7F79', line:'#26342F',
  accent:'#43B9A2', accentSoft:'#16352E', onAccent:'#06120F', gold:'#E2B45C', goldSoft:'#33291A', danger:'#F2806A', dangerSoft:'#3A1F1A',
  hero:'#1B2723', heroInk:'#E6EDE9', heroMuted:'#93A39D', record:'#F2806A',
  q:['', '#F2806A', '#43B9A2', '#E2B45C', '#7F8E88'],
};
export type ThemeChoice = 'system'|'light'|'dark';
export function useTheme():Palette & { dark:boolean } {
  const choice = useStore().theme, system = useColorScheme();
  const isDark = choice === 'dark' || (choice === 'system' && system === 'dark');
  return { ...(isDark ? dark : light), dark:isDark };
}
