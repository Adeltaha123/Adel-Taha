import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiDatabase, createApi } from '../server/node.js';
import type { User } from '../shared/api.js';
import type { AdminOverview, AdminUser, AppSettings, PlanInfo, Promo } from '../shared/plans.js';

test('the super admin sees accounts and OpenAI usage, controls plans, promo codes and settings; nobody else can', async () => {
  // OpenAI answers with token counts, as the real API does.
  const fetch = (async (url: string | URL) => String(url).includes('transcriptions')
    ? new Response(JSON.stringify({ text:'hello', usage:{ type:'tokens', input_tokens:1000, output_tokens:50 } }), { status:200 })
    : new Response(JSON.stringify({ status:'completed', usage:{ input_tokens:2000, output_tokens:500 }, output:[{ type:'message', content:[{ type:'output_text', text:JSON.stringify({ reply:'Hi', actions:[] }) }] }] }), { status:200 })) as typeof globalThis.fetch;
  const api = await createApi({ databasePath:':memory:', rateLimit:false, assistant:{ key:'test-placeholder', fetch } });
  process.env.ADMIN_TOKEN = 'admin-token-for-tests-0123456789abcdef';
  try {
    const register = async (email: string) => (await api.inject({ method:'POST', url:'/api/auth/register', payload:{ email, name:email.split('@')[0], password:'correct-horse-123' } })).json<{ token:string; user:User }>();
    const boss = await register('boss@example.test'), user = await register('user@example.test');
    const as = (token: string) => ({ authorization:`Bearer ${token}` });
    const call = (token: string, method: string, url: string, payload?: unknown) => api.inject({ method, url, headers:as(token), ...(payload ? { payload } : {}) });

    // Not an admin yet: the panel's routes do not exist for this account.
    assert.equal((await call(boss.token, 'GET', '/api/admin/users')).statusCode, 404);
    await apiDatabase(api).run('UPDATE users SET is_admin=1 WHERE email=?', 'boss@example.test');
    assert.equal((await call(boss.token, 'GET', '/api/plan')).json<PlanInfo>().isAdmin, true);
    assert.equal((await call(user.token, 'GET', '/api/admin/users')).statusCode, 404);
    assert.equal((await call(process.env.ADMIN_TOKEN, 'GET', '/api/admin/users')).statusCode, 200); // npm run plan's token.

    // Usage: one chat and one transcription, priced with the admin's OpenAI prices.
    await call(boss.token, 'POST', '/api/admin/settings', { freeAiPerMonth:20, personalPrice:149, teamPrice:499, contact:'WhatsApp 0100', pricing:{ chatInputPerM:2, chatOutputPerM:8, transcribeInputPerM:3, transcribeOutputPerM:10, transcribePerMinute:0 } });
    assert.equal((await call(user.token, 'POST', '/api/assistant/chat', { message:'Hi', language:'en', today:'2026-11-04', tasks:[], history:[] })).statusCode, 200);
    assert.equal((await api.inject({ method:'POST', url:'/api/assistant/transcribe?format=webm&language=en', headers:{ ...as(user.token), 'content-type':'audio/webm' }, payload:'audio-bytes' })).statusCode, 200);
    const users = (await call(boss.token, 'GET', '/api/admin/users')).json<AdminUser[]>();
    const row = users.find(u => u.email === 'user@example.test')!;
    assert.deepEqual([row.ai.requests, row.ai.inputTokens, row.ai.outputTokens], [2, 3000, 550]);
    assert.ok(Math.abs(row.ai.cost - (2000 / 1e6 * 2 + 500 / 1e6 * 8 + 1000 / 1e6 * 3 + 50 / 1e6 * 10)) < 1e-9);
    assert.equal(row.created !== null && row.lastSeen !== null, true);
    assert.equal('password' in row, false); // Password hashes never leave the server.
    const overview = (await call(boss.token, 'GET', '/api/admin/overview')).json<AdminOverview>();
    assert.deepEqual([overview.users, overview.ai.requests, overview.plans.free], [2, 2, 2]);

    // Settings apply to everyone at once.
    await call(boss.token, 'POST', '/api/admin/settings', { freeAiPerMonth:5, personalPrice:99, teamPrice:399, contact:'WhatsApp 0100', pricing:{ chatInputPerM:2, chatOutputPerM:8, transcribeInputPerM:3, transcribeOutputPerM:10, transcribePerMinute:0 } });
    let plan = (await call(user.token, 'GET', '/api/plan')).json<PlanInfo>();
    assert.deepEqual([plan.aiLimit, plan.prices.personal, plan.contact], [5, 99, 'WhatsApp 0100']);

    // Promo codes: a percentage off a chosen plan, limited uses, and they can be switched off.
    const created = await call(boss.token, 'POST', '/api/admin/promos', { code:'launch25', plan:'personal', percent:25, maxUses:1 });
    assert.equal(created.json<Promo>().code, 'LAUNCH25');
    assert.equal((await call(boss.token, 'POST', '/api/admin/promos', { code:'LAUNCH25', plan:'team', percent:10 })).statusCode, 409);
    assert.equal((await call(user.token, 'POST', '/api/plan/promo', { code:'nope' })).statusCode, 404);
    plan = (await call(user.token, 'POST', '/api/plan/promo', { code:'launch25' })).json<PlanInfo>();
    assert.deepEqual(plan.promo, { code:'LAUNCH25', plan:'personal', percent:25 });
    assert.equal((await call(boss.token, 'POST', '/api/plan/promo', { code:'LAUNCH25' })).statusCode, 409); // Its one use is taken.
    await call(boss.token, 'POST', '/api/admin/promos/LAUNCH25', { active:false });
    assert.equal((await call(user.token, 'GET', '/api/plan')).json<PlanInfo>().promo, null);
    assert.equal((await call(boss.token, 'GET', '/api/admin/users')).json<AdminUser[]>().find(u => u.email === 'user@example.test')!.promoCode, 'LAUNCH25');

    // Account control: plan, disable, new password, AI reset.
    await call(boss.token, 'POST', `/api/admin/users/${user.user.id}`, { plan:'personal', months:2 });
    assert.equal((await call(user.token, 'GET', '/api/plan')).json<PlanInfo>().plan, 'personal');
    await call(boss.token, 'POST', `/api/admin/users/${user.user.id}`, { resetAi:true });
    assert.equal((await call(user.token, 'GET', '/api/plan')).json<PlanInfo>().aiUsed, 0);
    await call(boss.token, 'POST', `/api/admin/users/${user.user.id}`, { disabled:true });
    assert.equal((await call(user.token, 'GET', '/api/plan')).statusCode, 401); // Disabling ends its sessions.
    assert.equal((await api.inject({ method:'POST', url:'/api/auth/login', payload:{ email:'user@example.test', password:'correct-horse-123' } })).statusCode, 403);
    await call(boss.token, 'POST', `/api/admin/users/${user.user.id}`, { disabled:false, password:'a-brand-new-password' });
    assert.equal((await api.inject({ method:'POST', url:'/api/auth/login', payload:{ email:'user@example.test', password:'correct-horse-123' } })).statusCode, 401);
    assert.equal((await api.inject({ method:'POST', url:'/api/auth/login', payload:{ email:'user@example.test', password:'a-brand-new-password' } })).statusCode, 200);
    // The super admin cannot lock themselves out.
    assert.equal((await call(boss.token, 'POST', `/api/admin/users/${boss.user.id}`, { isAdmin:false })).statusCode, 400);
    assert.equal((await call(boss.token, 'POST', `/api/admin/users/${boss.user.id}`, { disabled:true })).statusCode, 400);
  } finally { delete process.env.ADMIN_TOKEN; await api.close(); }
});
