import { fromLegacyItems, type Transfer } from '../../../shared/legacy';

// The old address (GitHub Pages) forwards here with what its browser storage held, in the link's #fragment, which
// never leaves the device. Those items join this device's offline records (never replacing one already here);
// signing in and choosing "Copy them here" in Account then adds them to the account. Runs before the app loads
// its storage. Returns how many items were added.
const KEY = 'mypa_expo_v1';
async function decode(kind: string, data: string) {
  const bytes = Uint8Array.from(atob(data.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const raw = kind === 'g' ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()) : bytes;
  return JSON.parse(new TextDecoder().decode(raw)) as Transfer;
}
export async function applyTransfer() {
  const match = /^#transfer=([gj])([A-Za-z0-9_-]+)$/.exec(window.location.hash);
  if (!match) return 0;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    const transfer = await decode(match[1]!, match[2]!);
    if (transfer?.v !== 1) return 0;
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? { scopes:{}, language:transfer.language === 'en' ? 'en' : 'ar', focusEnd:null };
    const guest = saved.scopes.guest ?? (saved.scopes.guest = { records:{}, baseline:{}, conflicts:[] });
    const incoming = { ...fromLegacyItems(transfer.legacy), ...(transfer.guest && typeof transfer.guest === 'object' ? transfer.guest : {}) };
    let added = 0;
    for (const [id, record] of Object.entries(incoming)) {
      if (guest.records[id] || !record || typeof record !== 'object' || !['task', 'note', 'habit'].includes(String(record.kind))) continue;
      const { assigneeId: _, ...own } = record as Record<string, unknown>; // Assignments belonged to a team, not this device.
      guest.records[id] = { ...own, id }; added++;
    }
    if (added) localStorage.setItem(KEY, JSON.stringify(saved));
    if (transfer.pin && !localStorage.getItem('mypa_pin')) localStorage.setItem('mypa_pin', transfer.pin);
    return added;
  } catch { return 0; }
}
