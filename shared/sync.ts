import type { CloudRecord, Mutation } from './api.js';
export type RecordData = Record<string, unknown>;
export type Records = Record<string, RecordData>;
export type Baseline = Record<string, CloudRecord>;
export function syncable(items: Records): Records {
  return Object.fromEntries(Object.entries(items).filter(([, item]) => ['task','note','habit','voice','conversation'].includes(String(item.kind))).map(([id, item]) => {
    const copy = { ...item }; delete copy.audioId; return [id, copy];
  }));
}
export function mutationsFor(items: Records, baseline: Baseline, conflicts: string[]): Mutation[] {
  const clean = syncable(items);
  return [...new Set([...Object.keys(clean), ...Object.keys(baseline)])].filter(id => !conflicts.includes(id))
    .filter(id => JSON.stringify(clean[id] ?? null) !== JSON.stringify(baseline[id]?.data ?? null))
    .map(id => ({ id, data: clean[id] ?? null, expectedVersion: baseline[id]?.version ?? 0 }));
}
export function mergeRecords(before: Records, current: Records, remote: CloudRecord[], conflicts: string[]): Records {
  const cleanBefore = syncable(before), cleanCurrent = syncable(current), merged = { ...current };
  for (const record of remote) {
    if (conflicts.includes(record.id) || JSON.stringify(cleanBefore[record.id] ?? null) !== JSON.stringify(cleanCurrent[record.id] ?? null)) continue;
    if (record.deleted) delete merged[record.id];
    else if (record.data) merged[record.id] = { ...record.data, ...(current[record.id]?.audioId ? { audioId: current[record.id]!.audioId } : {}) };
  }
  return merged;
}
