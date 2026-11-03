import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from '../server/app.js';
import type { User, Workspace, SyncResult } from '../shared/api.js';

test('shared API authenticates, isolates accounts, delegates team tasks, and preserves sync conflicts', async () => {
  const api = await createApi({ databasePath: ':memory:', rateLimit: false });
  try {
    assert.equal((await api.inject({ method:'GET', url:'/api/workspaces' })).statusCode, 401);
    assert.equal((await api.inject({ method:'POST', url:'/api/auth/register', payload:{ email:'invalid', name:'A', password:'short' } })).statusCode, 400);
    async function register(email: string) {
      const response = await api.inject({ method:'POST', url:'/api/auth/register', payload:{ email, name:email.split('@')[0], password:'correct-horse-123' } });
      assert.equal(response.statusCode, 201, response.body);
      return response.json<{ token:string; user:User }>();
    }
    const alice = await register('alice@example.test'); const bob = await register('bob@example.test'); const outsider = await register('outsider@example.test');
    const headers = (token: string) => ({ authorization:`Bearer ${token}` });
    const personal = (await api.inject({ method:'GET', url:'/api/workspaces', headers:headers(alice.token) })).json<Workspace[]>()[0]!;
    assert.equal((await api.inject({ method:'POST', url:`/api/workspaces/${personal.id}/sync`, headers:headers(bob.token), payload:{ mutations:[] } })).statusCode, 404);
    assert.equal((await api.inject({ method:'POST', url:`/api/workspaces/${personal.id}/invitations`, headers:headers(alice.token), payload:{} })).statusCode, 403);
    const team = (await api.inject({ method:'POST', url:'/api/workspaces', headers:headers(alice.token), payload:{ name:'Operations' } })).json<Workspace>();
    const invite = (await api.inject({ method:'POST', url:`/api/workspaces/${team.id}/invitations`, headers:headers(alice.token), payload:{} })).json<{code:string}>();
    assert.equal((await api.inject({ method:'POST', url:'/api/invitations/join', headers:headers(bob.token), payload:invite })).statusCode, 200);
    assert.equal((await api.inject({ method:'POST', url:'/api/invitations/join', headers:headers(outsider.token), payload:invite })).statusCode, 404);
    assert.equal((await api.inject({ method:'POST', url:`/api/workspaces/${team.id}/invitations`, headers:headers(bob.token), payload:{} })).statusCode, 403);
    const record = { id:'task_shared', kind:'task', title:'Call supplier', q:3, done:false, items:[], assigneeId:bob.user.id, delegate:bob.user.email };
    const sync = (token: string, mutations: unknown[]) => api.inject({ method:'POST', url:`/api/workspaces/${team.id}/sync`, headers:headers(token), payload:{ mutations } });
    let response = await sync(alice.token, [{ id:record.id, expectedVersion:0, data:record }]);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json<SyncResult>().records[0]!.version, 1);
    assert.equal((await sync(bob.token, [])).json<SyncResult>().records[0]!.data!.assigneeId, bob.user.id);
    response = await sync(alice.token, [{ id:record.id, expectedVersion:0, data:record }]);
    assert.deepEqual(response.json<SyncResult>().conflicts, []); // Lost-response retry.
    assert.equal((await sync(alice.token, [{ id:'bad', expectedVersion:0, data:{ ...record, id:'bad', assigneeId:outsider.user.id } }])).statusCode, 400);
    assert.equal((await sync(alice.token, [{ id:'settings', expectedVersion:0, data:{ id:'settings', kind:'settings', pinHash:'do-not-sync' } }])).statusCode, 400);
    await sync(bob.token, [{ id:record.id, expectedVersion:1, data:{ ...record, title:'Bob edit' } }]);
    response = await sync(alice.token, [{ id:record.id, expectedVersion:1, data:{ ...record, title:'Alice edit' } }]);
    assert.deepEqual(response.json<SyncResult>().conflicts, [record.id]);
    assert.equal(response.json<SyncResult>().records[0]!.data!.title, 'Bob edit');
    response = await sync(alice.token, [{ id:record.id, expectedVersion:2, data:{ ...record, title:'Resolved edit' } }]);
    assert.deepEqual(response.json<SyncResult>().conflicts, []);
    await sync(bob.token, [{ id:record.id, expectedVersion:3, data:null }]);
    response = await sync(alice.token, [{ id:record.id, expectedVersion:3, data:{ ...record, title:'Stale resurrection' } }]);
    assert.deepEqual(response.json<SyncResult>().conflicts, [record.id]);
    assert.equal(response.json<SyncResult>().records[0]!.deleted, true);
    assert.equal((await api.inject({ method:'POST', url:'/api/auth/login', payload:{ email:alice.user.email, password:'wrong-password' } })).statusCode, 401);
    const login = await api.inject({ method:'POST', url:'/api/auth/login', payload:{ email:alice.user.email, password:'correct-horse-123' } });
    assert.equal(login.statusCode, 200);
    await api.inject({ method:'POST', url:'/api/auth/logout', headers:headers(alice.token), payload:{} });
    assert.equal((await api.inject({ method:'GET', url:'/api/auth/me', headers:headers(alice.token) })).statusCode, 401);
  } finally { await api.close(); }
});

test('backend database survives restart and auth endpoints are rate limited', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'mypa-api-')); const path = join(folder, 'test.sqlite');
  let api = await createApi({ databasePath:path });
  try {
    const registration = await api.inject({ method:'POST', url:'/api/auth/register', payload:{ name:'Persistent', email:'persist@example.test', password:'persistent-password' } });
    const { token } = registration.json<{token:string}>();
    await api.close(); api = await createApi({ databasePath:path });
    assert.equal((await api.inject({ method:'GET', url:'/api/auth/me', headers:{ authorization:`Bearer ${token}` } })).statusCode, 200);
    let status = 0;
    for (let i=0; i<11; i++) status = (await api.inject({ method:'POST', url:'/api/auth/login', payload:{ email:'persist@example.test', password:'incorrect-password' } })).statusCode;
    assert.equal(status, 429);
  } finally { await api.close(); await rm(folder, { recursive:true, force:true }); }
});
