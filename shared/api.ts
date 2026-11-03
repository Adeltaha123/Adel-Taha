export interface User { id: string; email: string; name: string }
export interface Workspace { id: string; name: string; ownerId: string; personal: boolean }
export interface Member extends User { role: import('./plans.js').Role }
export interface CloudRecord { id: string; version: number; deleted: boolean; data: Record<string, unknown> | null }
export interface Mutation { id: string; expectedVersion: number; data: Record<string, unknown> | null }
export interface SyncResult { records: CloudRecord[]; conflicts: string[]; rejected?: string[] }
