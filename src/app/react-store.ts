import { useSyncExternalStore } from 'react';
let revision = 0;
const listeners = new Set<() => void>();
for (const event of ['mypa:render', 'mypa:cloud']) document.addEventListener(event, () => {
  revision++; listeners.forEach(listener => listener());
});
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useRevision = () => useSyncExternalStore(subscribe, () => revision);
