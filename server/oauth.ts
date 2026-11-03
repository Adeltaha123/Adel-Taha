import { randomBytes,randomUUID,createHash,createHmac } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import { createRemoteJWKSet,jwtVerify,importPKCS8,SignJWT,type JWTVerifyGetKey } from 'jose';
import {z} from 'zod';
import type {User} from '../shared/api.js';
import {PublicError} from './public-error.js';
type Provider='google'|'apple'|'facebook';
type Identity={sub:string;email:string;name:string};
type Config={origin?:string;returnUrl?:string;googleId?:string;googleSecret?:string;appleId?:string;appleTeam?:string;appleKeyId?:string;applePrivateKey?:string;metaId?:string;metaSecret?:string;allowExpoGo?:boolean};
export interface OAuthOptions {config?:Config;fetch?:typeof fetch;keys?:Partial<Record<'google'|'apple',JWTVerifyGetKey>>;now?:()=>number}
type Flow={id:string;provider:Provider;poll_hash:string;state_hash:string;nonce:string;verifier:string;expires:number;status:string;user_id:string|null;link_user:string|null;handoff_hash:string|null;return_url:string|null};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
const providerSchema=z.enum(['google','apple','facebook']);
const names:Record<Provider,string>={google:'Google',apple:'Apple',facebook:'Meta'};
const GRAPH='https://graph.facebook.com/v21.0';
const page=(success:boolean)=>`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>My PA</title><body style="font-family:system-ui;background:#F3F5F2;color:#14201C;padding:48px 24px;text-align:center"><h1>My PA</h1><h2>${success?'تم تسجيل الدخول':'تعذّر تسجيل الدخول'}</h2><p>${success?'ارجع إلى التطبيق لإكمال الدخول.':'ارجع إلى التطبيق وحاول مرة أخرى.'}</p><p>${success?'You can return to My PA now.':'Return to My PA and try again.'}</p></body></html>`;
/* The app says where the browser should hand back to. Only the app's own schemes, plus Expo Go
   during development, are allowed; the hand-off alone is useless without the app's poll token. */
function allowedReturn(value:string|undefined,allowExpoGo:boolean) {
  try {
    const url=new URL(value??'');
    if(url.username||url.password||url.search||url.hash)return '';
    if((url.protocol==='mypa:'||url.protocol==='maktb:')&&url.hostname==='auth'&&(url.pathname===''||url.pathname==='/'))return `${url.protocol}//auth`;
    if(allowExpoGo&&url.protocol==='exp:'&&url.hostname&&url.pathname==='/--/auth')return url.href;
  }catch{}
  return '';
}
export function registerOAuth(app:FastifyInstance,db:DatabaseSync,hooks:{session:(user:User)=>unknown;createWorkspace:(id:string,name:string,personal:boolean)=>unknown;userFor:(req:FastifyRequest)=>User},options:OAuthOptions={}) {
  const env=process.env,config=options.config??{origin:env.OAUTH_PUBLIC_ORIGIN,returnUrl:env.OAUTH_APP_RETURN_URL,googleId:env.GOOGLE_CLIENT_ID,googleSecret:env.GOOGLE_CLIENT_SECRET,appleId:env.APPLE_CLIENT_ID,appleTeam:env.APPLE_TEAM_ID,appleKeyId:env.APPLE_KEY_ID,applePrivateKey:env.APPLE_PRIVATE_KEY,metaId:env.META_APP_ID,metaSecret:env.META_APP_SECRET,allowExpoGo:env.NODE_ENV!=='production'};
  const now=options.now??Date.now,transport=options.fetch??fetch,allowExpoGo=config.allowExpoGo??false;
  let origin='';try{const url=new URL(config.origin??'');if(url.protocol==='https:'&&!url.username&&!url.password)origin=url.origin;}catch{}
  const defaultReturn=allowedReturn(config.returnUrl||'mypa://auth',false);
  const ready=(p:Provider)=>Boolean(origin&&(p==='google'?config.googleId&&config.googleSecret:p==='apple'?config.appleId&&config.appleTeam&&config.appleKeyId&&config.applePrivateKey:config.metaId&&config.metaSecret));
  const keySets={google:options.keys?.google??createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),apple:options.keys?.apple??createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))};
  db.exec(`CREATE TABLE IF NOT EXISTS oauth_identities(provider TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(provider,subject));
    CREATE TABLE IF NOT EXISTS oauth_flows(id TEXT PRIMARY KEY,provider TEXT NOT NULL,poll_hash TEXT NOT NULL,state_hash TEXT UNIQUE NOT NULL,nonce TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL,user_id TEXT,link_user TEXT,handoff_hash TEXT,return_url TEXT);`);
  const columns=(db.prepare('PRAGMA table_info(oauth_flows)').all() as {name:string}[]).map(c=>c.name);
  if(!columns.includes('handoff_hash')) db.exec('ALTER TABLE oauth_flows ADD COLUMN handoff_hash TEXT');
  if(!columns.includes('return_url')) db.exec('ALTER TABLE oauth_flows ADD COLUMN return_url TEXT');
  app.addContentTypeParser('application/x-www-form-urlencoded',{parseAs:'string'},(_req,body,done)=>{try{done(null,Object.fromEntries(new URLSearchParams(String(body))));}catch(e){done(e as Error);}});
  const redirect=(p:Provider)=>`${origin}/api/auth/oauth/callback/${p}`;
  async function verifyMeta(code:string):Promise<Identity> {
    const tokenUrl=new URL(`${GRAPH}/oauth/access_token`);
    for(const[k,v]of Object.entries({client_id:config.metaId!,client_secret:config.metaSecret!,redirect_uri:redirect('facebook'),code}))tokenUrl.searchParams.set(k,v);
    const tokenResponse=await transport(tokenUrl,{signal:AbortSignal.timeout(15000)});
    if(!tokenResponse.ok)throw new Error('Provider exchange failed');
    const accessToken=(await tokenResponse.json() as {access_token?:unknown}).access_token;
    if(typeof accessToken!=='string')throw new Error('Missing access token');
    const me=new URL(`${GRAPH}/me`);me.searchParams.set('fields','id,name,email');me.searchParams.set('access_token',accessToken);
    me.searchParams.set('appsecret_proof',createHmac('sha256',config.metaSecret!).update(accessToken).digest('hex'));
    const profileResponse=await transport(me,{signal:AbortSignal.timeout(15000)});
    if(!profileResponse.ok)throw new Error('Profile request failed');
    const profile=z.object({id:z.string().min(1).max(255),name:z.string().optional(),email:z.string().email().max(254)}).parse(await profileResponse.json()); // Meta only returns confirmed emails.
    const email=profile.email.toLowerCase();
    return {sub:profile.id,email,name:(profile.name||email.split('@')[0]!).slice(0,80)};
  }
  async function verify(flow:Flow,code:string):Promise<Identity> {
    const p=flow.provider;
    if(p==='facebook')return verifyMeta(code);
    let secret=config.googleSecret!;
    if(p==='apple') {const key=await importPKCS8(config.applePrivateKey!.replace(/\\n/g,'\n'),'ES256');secret=await new SignJWT({}).setProtectedHeader({alg:'ES256',kid:config.appleKeyId!}).setIssuer(config.appleTeam!).setSubject(config.appleId!).setAudience('https://appleid.apple.com').setIssuedAt().setExpirationTime('5m').sign(key);}
    const form=new URLSearchParams({client_id:p==='google'?config.googleId!:config.appleId!,client_secret:secret,grant_type:'authorization_code',code,redirect_uri:redirect(p)});
    if(p==='google')form.set('code_verifier',flow.verifier);
    const response=await transport(p==='google'?'https://oauth2.googleapis.com/token':'https://appleid.apple.com/auth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Provider exchange failed');
    const token=(await response.json() as {id_token?:unknown}).id_token;
    if(typeof token!=='string')throw new Error('Missing identity token');
    const {payload}=await jwtVerify(token,keySets[p],{issuer:p==='google'?['https://accounts.google.com','accounts.google.com']:'https://appleid.apple.com',audience:p==='google'?config.googleId!:config.appleId!,algorithms:['RS256'],requiredClaims:['sub','exp','iat','nonce'],maxTokenAge:'10m'});
    if(payload.nonce!==flow.nonce||typeof payload.sub!=='string'||payload.sub.length>255)throw new Error('Invalid identity');
    const email=z.string().email().max(254).parse(payload.email).toLowerCase();
    if(payload.email_verified!==true&&payload.email_verified!=='true')throw new Error('Email is unverified');
    return {sub:payload.sub,email,name:typeof payload.name==='string'?payload.name.slice(0,80):email.split('@')[0]!.slice(0,80)};
  }
  app.get('/api/auth/providers',async()=>({google:{enabled:ready('google')},apple:{enabled:ready('apple')},facebook:{enabled:ready('facebook')}}));
  app.post('/api/auth/oauth/start',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async req=>{
    const {provider,link,returnUrl:requested}=z.object({provider:providerSchema,link:z.boolean().default(false),returnUrl:z.string().max(300).optional()}).parse(req.body);
    if(!ready(provider))throw new PublicError(503,`${names[provider]} sign-in has not been set up on the server yet. Use email to continue.`);
    const returnUrl=requested===undefined?defaultReturn:allowedReturn(requested,allowExpoGo);
    if(!returnUrl)throw new PublicError(400,'This app cannot receive the sign-in result.');
    const linkUser=link?hooks.userFor(req).id:null;
    db.prepare('DELETE FROM oauth_flows WHERE expires<=?').run(now());
    const id=random(),pollToken=random(),state=random(),nonce=random(),verifier=random();
    db.prepare('INSERT INTO oauth_flows (id,provider,poll_hash,state_hash,nonce,verifier,expires,status,user_id,link_user,handoff_hash,return_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id,provider,hash(pollToken),hash(state),nonce,verifier,now()+5*60000,'pending',null,linkUser,null,returnUrl);
    let url:URL;
    if(provider==='facebook'){
      url=new URL('https://www.facebook.com/v21.0/dialog/oauth');
      for(const[k,v]of Object.entries({client_id:config.metaId!,redirect_uri:redirect(provider),response_type:'code',scope:'email,public_profile',state}))url.searchParams.set(k,v);
    } else {
      url=new URL(provider==='google'?'https://accounts.google.com/o/oauth2/v2/auth':'https://appleid.apple.com/auth/authorize');
      const params={client_id:provider==='google'?config.googleId!:config.appleId!,redirect_uri:redirect(provider),response_type:'code',scope:provider==='google'?'openid email profile':'name email',state,nonce};
      for(const[k,v]of Object.entries(params))url.searchParams.set(k,v);
      if(provider==='google'){url.searchParams.set('code_challenge',createHash('sha256').update(verifier).digest('base64url'));url.searchParams.set('code_challenge_method','S256');url.searchParams.set('prompt','select_account');}
      else url.searchParams.set('response_mode','form_post');
    }
    return {flowId:id,pollToken,authorizeUrl:url.href,returnUrl,expiresIn:300};
  });
  async function callback(req:FastifyRequest,reply:any) {
    reply.header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");reply.header('Referrer-Policy','no-referrer');
    const p=providerSchema.parse((req.params as {provider:string}).provider);
    const input=z.object({state:z.string().min(32).max(128),code:z.string().min(1).max(4096).optional(),error:z.string().max(200).optional()}).parse(req.method==='POST'?req.body:req.query);
    const flow=db.prepare('SELECT * FROM oauth_flows WHERE state_hash=? AND provider=? AND expires>? AND status=?').get(hash(input.state),p,now(),'pending') as Flow|undefined;
    if(!flow)return reply.code(400).type('text/html').send(page(false));
    db.prepare("UPDATE oauth_flows SET status='verifying' WHERE id=?").run(flow.id);
    if(input.error||!input.code){db.prepare("UPDATE oauth_flows SET status='failed' WHERE id=?").run(flow.id);return reply.code(400).type('text/html').send(page(false));}
    try {
      const identity=await verify(flow,input.code);
      if(flow.expires<=now())throw new Error('Expired sign-in');
      const handoff=random();
      db.exec('BEGIN IMMEDIATE');
      try {
        const linked=db.prepare('SELECT user_id FROM oauth_identities WHERE provider=? AND subject=?').get(p,identity.sub) as {user_id:string}|undefined;
        let userId=linked?.user_id;
        if(flow.link_user&&userId&&userId!==flow.link_user)throw new Error('Identity belongs to another account');
        if(!userId){
          if(flow.link_user)userId=flow.link_user;
          else {
            if(db.prepare('SELECT id FROM users WHERE email=?').get(identity.email))throw new Error('Sign in with email and link this provider from Account');
            userId=randomUUID();db.prepare('INSERT INTO users (id,email,name,password) VALUES (?,?,?,?)').run(userId,identity.email,identity.name,`${randomBytes(16).toString('hex')}:${randomBytes(64).toString('hex')}`);hooks.createWorkspace(userId,'Personal',true);
          }
          db.prepare('INSERT INTO oauth_identities VALUES (?,?,?)').run(p,identity.sub,userId);
        }
        db.prepare("UPDATE oauth_flows SET status='complete',user_id=?,handoff_hash=? WHERE id=?").run(userId,hash(handoff),flow.id);
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      const target=new URL(flow.return_url||defaultReturn);target.searchParams.set('flowId',flow.id);target.searchParams.set('handoff',handoff);
      return reply.redirect(target.href);
    }catch{db.prepare("UPDATE oauth_flows SET status='failed' WHERE id=?").run(flow.id);return reply.code(400).type('text/html').send(page(false));}
  }
  app.get('/api/auth/oauth/callback/:provider',callback);app.post('/api/auth/oauth/callback/:provider',{bodyLimit:16000},callback);
  app.post('/api/auth/oauth/poll',{config:{rateLimit:{max:60,timeWindow:'1 minute'}}},async req=>{
    const input=z.object({flowId:z.string().length(43),pollToken:z.string().length(43),handoff:z.string().length(43)}).parse(req.body);
    const flow=db.prepare('SELECT * FROM oauth_flows WHERE id=? AND poll_hash=? AND expires>?').get(input.flowId,hash(input.pollToken),now()) as Flow|undefined;
    if(!flow)throw new PublicError(400,'Sign-in expired or was already used. Please start again.');
    if(flow.status==='failed'){db.prepare('DELETE FROM oauth_flows WHERE id=?').run(flow.id);throw new PublicError(400,'Sign-in failed. If this email already has an account, sign in with email and link the provider from Account.');}
    if(flow.status!=='complete')return {status:'pending'};
    if(flow.handoff_hash!==hash(input.handoff))throw new PublicError(400,'Sign-in must return to the app that started it.');
    db.prepare('DELETE FROM oauth_flows WHERE id=?').run(flow.id);
    if(flow.link_user)return {status:'linked'};
    const user=db.prepare('SELECT id,email,name FROM users WHERE id=?').get(flow.user_id!) as unknown as User;
    return {status:'complete',session:hooks.session(user)};
  });
}
