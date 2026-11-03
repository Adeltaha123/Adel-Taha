import * as SecureStore from 'expo-secure-store';

// Lock secrets live in the iOS Keychain / Android Keystore. secure.web.ts is the browser version.
export const getSecret = (key:string) => SecureStore.getItemAsync(key);
export const setSecret = (key:string, value:string) => SecureStore.setItemAsync(key,value);
/** Native apps lock on every launch; only the browser keeps a short unlock across page reloads. */
export function rememberUnlock() {}
export const recentlyUnlocked = () => false;
