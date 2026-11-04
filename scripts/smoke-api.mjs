// Checks a running API over HTTP, for example the Cloudflare Worker before and after deploying.
//   node scripts/smoke-api.mjs http://127.0.0.1:8787 --full   creates test accounts (local servers only)
//   node scripts/smoke-api.mjs https://mypa-api.example.workers.dev   read-only checks, safe on the live server
import assert from 'node:assert/strict';

const base = process.argv[2]?.replace(/\/$/, '');
const full = process.argv.includes('--full');
if (!base) { console.error('Usage: node scripts/smoke-api.mjs <url> [--full]'); process.exit(1); }
const call = async (path, { method = 'GET', token, body, raw, type } = {}) => {
  const started = Date.now();
  const response = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(type ? { 'Content-Type': type } : {}), Origin: 'https://adeltaha123.github.io' }, body: body ? JSON.stringify(body) : raw });
  const text = await response.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: response.status, json, ms: Date.now() - started, headers: response.headers };
};
const check = async (name, fn) => { try { await fn(); console.log(`ok   ${name}`); } catch (error) { console.log(`FAIL ${name}: ${error.message}`); process.exitCode = 1; } };

await check('health answers', async () => { const r = await call('/api/health'); assert.equal(r.status, 200); assert.deepEqual(r.json, { ok: true }); });
await check('the website origin is allowed (CORS)', async () => { const r = await call('/api/health'); assert.equal(r.headers.get('access-control-allow-origin'), 'https://adeltaha123.github.io'); });
await check('sign-in providers answer', async () => { const r = await call('/api/auth/providers'); assert.equal(r.status, 200); assert.ok('google' in r.json); });
await check('a wrong password is refused (password hashing runs)', async () => { const r = await call('/api/auth/login', { method: 'POST', body: { email: 'nobody@example.test', password: 'not-the-password' } }); assert.equal(r.status, 401); });
await check('unsigned requests are refused', async () => { assert.equal((await call('/api/workspaces')).status, 401); });

if (full) {
  const email = `smoke-${Date.now()}@example.test`, password = 'smoke-password-123';
  let token = '', workspace = '';
  await check('register', async () => { const r = await call('/api/auth/register', { method: 'POST', body: { email, password, name: 'Smoke' } }); assert.equal(r.status, 201, JSON.stringify(r.json)); token = r.json.token; });
  await check('registering the same email again is refused', async () => { assert.equal((await call('/api/auth/register', { method: 'POST', body: { email, password, name: 'Smoke' } })).status, 409); });
  await check('login', async () => { const r = await call('/api/auth/login', { method: 'POST', body: { email, password } }); assert.equal(r.status, 200); token = r.json.token; });
  await check('workspaces', async () => { const r = await call('/api/workspaces', { token }); assert.equal(r.status, 200); workspace = r.json[0].id; assert.equal(r.json[0].personal, true); });
  await check('plan starts on Free', async () => { const r = await call('/api/plan', { token }); assert.equal(r.json.plan, 'free'); assert.equal(r.json.aiLimit, 60); });
  await check('preferences save', async () => { const r = await call('/api/preferences', { method: 'POST', token, body: { language: 'ar' } }); assert.equal(r.json.language, 'ar'); });
  const task = { id: 'smoke_task', kind: 'task', title: 'Smoke task', q: 2, done: false, items: [] };
  await check('sync creates a record', async () => { const r = await call(`/api/workspaces/${workspace}/sync`, { method: 'POST', token, body: { mutations: [{ id: task.id, expectedVersion: 0, data: task }] } }); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.records[0].version, 1); });
  await check('a stale edit becomes a conflict', async () => { const r = await call(`/api/workspaces/${workspace}/sync`, { method: 'POST', token, body: { mutations: [{ id: task.id, expectedVersion: 0, data: { ...task, title: 'Stale' } }] } }); assert.deepEqual(r.json.conflicts, [task.id]); });
  await check('teams need the Team plan', async () => { const r = await call('/api/workspaces', { method: 'POST', token, body: { name: 'Team' } }); assert.equal(r.status, 402); assert.equal(r.json.code, 'team_plan'); });
  await check('assistant status', async () => { assert.equal((await call('/api/assistant/status', { token })).status, 200); });
  await check('a raw recording upload is accepted by the route', async () => { const r = await call('/api/assistant/transcribe?format=webm&language=en', { method: 'POST', token, raw: new Uint8Array(64), type: 'audio/webm' }); assert.ok([200, 422, 502, 503].includes(r.status), `status ${r.status}: ${JSON.stringify(r.json)}`); });
  await check('logout ends the session', async () => { await call('/api/auth/logout', { method: 'POST', token, body: {} }); assert.equal((await call('/api/auth/me', { token })).status, 401); });
}
console.log(process.exitCode ? '\nSome checks failed.' : '\nAll checks passed.');
