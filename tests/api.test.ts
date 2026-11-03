import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiDatabase, createApi } from '../server/app.js';
import { setPlan } from '../server/plans.js';
import { FREE_AI_PER_MONTH, type PlanInfo } from '../shared/plans.js';
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
    assert.equal((await api.inject({ method:'POST', url:'/api/workspaces', headers:headers(alice.token), payload:{ name:'Operations' } })).statusCode, 402); // Teams need the Team plan.
    setPlan(apiDatabase(api), 'alice@example.test', 'team');
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

test('plans: free AI allowance, team coverage, roles, and role-based record rules', async () => {
  const api = await createApi({ databasePath: ':memory:', rateLimit: false, assistant:{ key:'test-placeholder', fetch:async () => new Response(JSON.stringify({ text:'hello' }), { status:200 }) } });
  try {
    const register = async (email: string) => (await api.inject({ method:'POST', url:'/api/auth/register', payload:{ email, name:email.split('@')[0], password:'correct-horse-123' } })).json<{ token:string; user:User }>();
    const [owner, admin, member, viewer, free] = await Promise.all(['owner','admin','member','viewer','free'].map(n => register(`${n}@example.test`)));
    const headers = (token: string) => ({ authorization:`Bearer ${token}` });
    const plan = async (token: string) => (await api.inject({ method:'GET', url:'/api/plan', headers:headers(token) })).json<PlanInfo>();
    const transcribe = (token: string) => api.inject({ method:'POST', url:'/api/assistant/transcribe', headers:headers(token), payload:{ audio:'AAAA', format:'webm', language:'en' } });
    // A free account gets the monthly allowance, then a clear 402 with a code the app can translate.
    for (let i = 0; i < FREE_AI_PER_MONTH; i++) assert.equal((await transcribe(free.token)).statusCode, 200);
    const refused = await transcribe(free.token);
    assert.equal(refused.statusCode, 402); assert.equal(refused.json().code, 'ai_limit');
    assert.deepEqual([(await plan(free.token)).aiUsed, (await plan(free.token)).aiLimit], [FREE_AI_PER_MONTH, FREE_AI_PER_MONTH]);
    setPlan(apiDatabase(api), 'free@example.test', 'personal');
    assert.equal((await plan(free.token)).aiLimit, null); assert.equal((await transcribe(free.token)).statusCode, 200);
    // The Team plan owner invites with roles; only the owner may invite admins.
    setPlan(apiDatabase(api), 'owner@example.test', 'team');
    const team = (await api.inject({ method:'POST', url:'/api/workspaces', headers:headers(owner.token), payload:{ name:'Sales' } })).json<Workspace>();
    const join = async (inviter: string, role: string, joiner: string) => {
      const invite = await api.inject({ method:'POST', url:`/api/workspaces/${team.id}/invitations`, headers:headers(inviter), payload:{ role } });
      if (invite.statusCode !== 200) return invite.statusCode;
      return (await api.inject({ method:'POST', url:'/api/invitations/join', headers:headers(joiner), payload:{ code:invite.json().code } })).statusCode;
    };
    assert.equal(await join(owner.token, 'admin', admin.token), 200);
    assert.equal(await join(admin.token, 'admin', member.token), 403);
    assert.equal(await join(admin.token, 'member', member.token), 200);
    assert.equal(await join(admin.token, 'viewer', viewer.token), 200);
    assert.equal((await plan(member.token)).coveredByTeam, 'Sales'); // Members of a paid team have unlimited AI.
    const roles = (await api.inject({ method:'GET', url:`/api/workspaces/${team.id}/members`, headers:headers(viewer.token) })).json<{ email:string; role:string }[]>();
    assert.deepEqual(roles.map(m => m.role), ['owner','admin','member','viewer']);
    // Record rules: members change their own and assigned tasks; viewers change nothing.
    const sync = (token: string, mutations: unknown[]) => api.inject({ method:'POST', url:`/api/workspaces/${team.id}/sync`, headers:headers(token), payload:{ mutations } }).then(r => r.json<SyncResult>());
    const task = (id: string, extra = {}) => ({ id, kind:'task', title:id, q:2, done:false, items:[], ...extra });
    assert.deepEqual((await sync(admin.token, [{ id:'boss', expectedVersion:0, data:task('boss') }, { id:'given', expectedVersion:0, data:task('given', { assigneeId:member.user.id }) }])).rejected, []);
    assert.deepEqual((await sync(member.token, [{ id:'mine', expectedVersion:0, data:task('mine') }])).rejected, []);
    let result = await sync(member.token, [
      { id:'boss', expectedVersion:1, data:task('boss', { title:'changed' }) },
      { id:'given', expectedVersion:1, data:task('given', { assigneeId:member.user.id, done:true }) },
      { id:'mine', expectedVersion:1, data:task('mine', { assigneeId:admin.user.id }) },
    ]);
    assert.deepEqual(result.rejected!.sort(), ['boss','mine']); // Not theirs; and members may only assign to themselves.
    assert.equal(result.records.find(r => r.id === 'given')!.data!.done, true);
    result = await sync(viewer.token, [{ id:'view', expectedVersion:0, data:task('view') }]);
    assert.deepEqual(result.rejected, ['view']); assert.equal(result.records.some(r => r.id === 'view'), false);
    // Role changes: admins manage members and viewers but not other admins or the owner.
    const setRole = (token: string, user: User, role: string) => api.inject({ method:'POST', url:`/api/workspaces/${team.id}/members/${user.id}/role`, headers:headers(token), payload:{ role } }).then(r => r.statusCode);
    assert.equal(await setRole(admin.token, viewer.user, 'member'), 200);
    assert.equal(await setRole(admin.token, owner.user, 'viewer'), 403);
    assert.equal(await setRole(member.token, viewer.user, 'viewer'), 403);
    assert.equal(await setRole(owner.token, admin.user, 'member'), 200);
    const remove = (token: string, user: User) => api.inject({ method:'POST', url:`/api/workspaces/${team.id}/members/${user.id}/remove`, headers:headers(token), payload:{} }).then(r => r.statusCode);
    assert.equal(await remove(member.token, viewer.user), 403);
    assert.equal(await remove(viewer.token, viewer.user), 200); // Leaving the team.
    assert.equal(await remove(owner.token, owner.user), 403);
  } finally { await api.close(); }
});
