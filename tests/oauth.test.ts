import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPair, SignJWT } from 'jose';
import { createApi } from '../server/app.js';

const config = { origin:'https://pa.example', googleId:'google-client', googleSecret:'google-secret', metaId:'meta-app', metaSecret:'meta-secret', allowExpoGo:true };
const expoReturn = 'exp://192.168.1.5:8081/--/auth';

test('Google and Meta sign-in hand a session back to the app that started it', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  let googleEmail = 'ann@example.test', metaEmail = 'meta.user@example.test', metaId = 'meta-sub-1', nonce = '';
  const calls:string[] = [];
  const fetch = (async (input:string|URL) => {
    const url = String(input); calls.push(url);
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      const idToken = await new SignJWT({ email:googleEmail, email_verified:true, name:'Ann', nonce }).setProtectedHeader({ alg:'RS256' })
        .setIssuer('https://accounts.google.com').setAudience('google-client').setSubject('google-sub-1').setIssuedAt().setExpirationTime('5m').sign(privateKey);
      return new Response(JSON.stringify({ id_token:idToken }), { status:200 });
    }
    if (url.includes('/oauth/access_token')) return new Response(JSON.stringify({ access_token:'meta-token' }), { status:200 });
    if (url.includes('/me?')) return new Response(JSON.stringify({ id:metaId, name:'Meta User', email:metaEmail }), { status:200 });
    return new Response('{}', { status:404 });
  }) as typeof globalThis.fetch;
  const app = await createApi({ databasePath:':memory:', rateLimit:false, oauth:{ config, fetch, keys:{ google:async () => publicKey } } });
  const start = async (provider:string, returnUrl = expoReturn) => app.inject({ method:'POST', url:'/api/auth/oauth/start', payload:{ provider, returnUrl } });
  const finish = async (provider:string) => {
    const started = (await start(provider)).json();
    const authorize = new URL(started.authorizeUrl); nonce = authorize.searchParams.get('nonce') ?? '';
    const back = await app.inject({ method:'GET', url:`/api/auth/oauth/callback/${provider}?state=${authorize.searchParams.get('state')}&code=provider-code` });
    return { started, back };
  };
  try {
    assert.deepEqual((await app.inject({ method:'GET', url:'/api/auth/providers' })).json(), { google:{ enabled:true }, apple:{ enabled:false }, facebook:{ enabled:true } });
    assert.equal((await start('apple')).statusCode, 503);
    for (const bad of ['https://evil.example/auth', 'exp://192.168.1.5:8081/--/other', 'mypa://auth?x=1']) assert.equal((await start('google', bad)).statusCode, 400, bad);

    // Google: PKCE + nonce, then the redirect carries a hand-off that only works with the app's poll token.
    const google = await finish('google');
    assert.equal(new URL(google.started.authorizeUrl).searchParams.get('code_challenge_method'), 'S256');
    assert.equal(google.back.statusCode, 302);
    const location = new URL(google.back.headers.location as string);
    assert.equal(`${location.protocol}//${location.host}${location.pathname}`, expoReturn);
    const poll = { flowId:google.started.flowId, pollToken:google.started.pollToken, handoff:location.searchParams.get('handoff') };
    assert.equal((await app.inject({ method:'POST', url:'/api/auth/oauth/poll', payload:{ ...poll, handoff:'x'.repeat(43) } })).statusCode, 400);
    const session = (await app.inject({ method:'POST', url:'/api/auth/oauth/poll', payload:poll })).json();
    assert.equal(session.status, 'complete'); assert.equal(session.session.user.email, 'ann@example.test');
    const headers = { authorization:`Bearer ${session.session.token}` };
    assert.equal((await app.inject({ method:'GET', url:'/api/workspaces', headers })).json()[0].personal, true);
    assert.equal((await app.inject({ method:'POST', url:'/api/auth/oauth/poll', payload:poll })).statusCode, 400, 'a hand-off is single use');

    // Signing in again with the same Google account reaches the same user.
    googleEmail = 'ann@example.test';
    const again = await finish('google');
    const againPoll = { flowId:again.started.flowId, pollToken:again.started.pollToken, handoff:new URL(again.back.headers.location as string).searchParams.get('handoff') };
    assert.equal((await app.inject({ method:'POST', url:'/api/auth/oauth/poll', payload:againPoll })).json().session.user.id, session.session.user.id);

    // Meta: code exchange plus a signed Graph profile request.
    const meta = await finish('facebook');
    assert.equal(new URL(meta.started.authorizeUrl).hostname, 'www.facebook.com');
    assert.equal(meta.back.statusCode, 302);
    assert.ok(calls.some(url => url.includes('/me?') && url.includes('appsecret_proof=')));
    const metaPoll = { flowId:meta.started.flowId, pollToken:meta.started.pollToken, handoff:new URL(meta.back.headers.location as string).searchParams.get('handoff') };
    assert.equal((await app.inject({ method:'POST', url:'/api/auth/oauth/poll', payload:metaPoll })).json().session.user.name, 'Meta User');

    // A provider email that already belongs to a password account is never taken over silently.
    await app.inject({ method:'POST', url:'/api/auth/register', payload:{ name:'Owner', email:'owner@example.test', password:'long-password-123' } });
    metaEmail = 'owner@example.test'; metaId = 'meta-sub-2';
    const taken = await finish('facebook');
    assert.equal(taken.back.statusCode, 400);
    const takenPoll = await app.inject({ method:'POST', url:'/api/auth/oauth/poll', payload:{ flowId:taken.started.flowId, pollToken:taken.started.pollToken, handoff:'y'.repeat(43) } });
    assert.match(takenPoll.json().error, /link the provider from Account/);
  } finally { await app.close(); }
});
test('language and theme preferences are saved per user, not per workspace', async () => {
  const app = await createApi({ databasePath:':memory:', rateLimit:false });
  try {
    const auth = await app.inject({ method:'POST', url:'/api/auth/register', payload:{ name:'Prefs', email:'prefs@example.test', password:'long-password-123' } });
    const headers = { authorization:`Bearer ${auth.json().token}` };
    assert.equal((await app.inject({ method:'GET', url:'/api/preferences' })).statusCode, 401);
    assert.deepEqual((await app.inject({ method:'GET', url:'/api/preferences', headers })).json(), {});
    await app.inject({ method:'POST', url:'/api/preferences', headers, payload:{ language:'ar' } });
    assert.deepEqual((await app.inject({ method:'POST', url:'/api/preferences', headers, payload:{ theme:'dark' } })).json(), { language:'ar', theme:'dark' });
    assert.deepEqual((await app.inject({ method:'GET', url:'/api/preferences', headers })).json(), { language:'ar', theme:'dark' });
    assert.equal((await app.inject({ method:'POST', url:'/api/preferences', headers, payload:{ theme:'neon' } })).statusCode, 400);
  } finally { await app.close(); }
});
