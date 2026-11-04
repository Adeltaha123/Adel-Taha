// Activates subscriptions by hand until payments are connected:
//   npm run plan                                   list accounts and their plans
//   npm run plan -- someone@mail.com personal 1    Personal for 1 month (extends a current Personal period)
//   npm run plan -- someone@mail.com team 3         Team for 3 months
//   npm run plan -- someone@mail.com free           back to Free
// It changes the live server the app uses (ADMIN_TOKEN in .env must match the server's). Add --local to change the
// database in data/ on this PC instead.
import { existsSync } from 'node:fs';
import type { Plan } from '../shared/plans.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const args = process.argv.slice(2), local = args.includes('--local');
const [email, plan, months = '1'] = args.filter(a => a !== '--local');
type Row = { email:string; name:string; plan:Plan; until:number|null; active:boolean };
const date = (ms:number|null) => ms ? new Date(ms).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '';

/** The live server: the permanent address the app uses, unless API_URL in .env says otherwise. */
async function server() {
  const saved = process.env.API_URL || (await fetch(`https://raw.githubusercontent.com/Adeltaha123/Adel-Taha/server-address/server.json?t=${Date.now()}`).then(r => r.ok ? r.json() : null, () => null) as { api?:string } | null)?.api;
  if (!saved) throw new Error('No server address is saved. Use --local, or set API_URL in .env.');
  if (!process.env.ADMIN_TOKEN) throw new Error('Add ADMIN_TOKEN to .env (the same value the server has).');
  return async <T,>(method:'GET'|'POST', body?:unknown):Promise<T> => {
    const response = await fetch(`${saved}/api/admin/plans`, { method, headers:{ Authorization:`Bearer ${process.env.ADMIN_TOKEN}`, 'Content-Type':'application/json' }, ...(body ? { body:JSON.stringify(body) } : {}) });
    const result = await response.json().catch(() => ({})) as T & { error?:string };
    if (response.status === 404 && !result.error?.includes('account')) throw new Error(`${saved} refused the admin token. Check ADMIN_TOKEN in .env.`);
    if (!response.ok) throw new Error(result.error ?? `The server answered ${response.status}.`);
    return result;
  };
}
async function localDatabase() {
  const [{ openDatabase }, { sqliteDb, migrate }, plans] = await Promise.all([import('../server/database.js'), import('../server/db.js'), import('../server/plans.js')]);
  const sqlite = openDatabase(process.env.API_DB ?? 'data/my-pa.sqlite'), db = sqliteDb(sqlite);
  await migrate(db);
  return { list:() => plans.listPlans(db), set:(e:string, p:Plan, m:number) => plans.setPlan(db, e, p, m), close:() => sqlite.close() };
}

try {
  const target = local ? await localDatabase() : await (async () => { const call = await server(); return { list:() => call<Row[]>('GET'), set:(e:string, p:Plan, m:number) => call<{ plan:Plan; until:number|null }>('POST', { email:e, plan:p, months:m }), close() {} }; })();
  try {
    if (!email) {
      const rows = await target.list();
      if (!rows.length) console.log('No accounts yet.');
      for (const r of rows) console.log(`${r.email.padEnd(36)} ${r.name.padEnd(20)} ${r.active ? `${r.plan} until ${date(r.until)}` : r.plan === 'free' ? 'free' : `${r.plan} (expired ${date(r.until)})`}`);
    } else {
      if (!['free', 'personal', 'team'].includes(plan ?? '')) throw new Error('Choose a plan: free, personal or team.');
      const count = Number(months);
      if (!Number.isInteger(count) || count < 1 || count > 36) throw new Error('Months must be a whole number from 1 to 36.');
      const result = await target.set(email, plan as Plan, count);
      console.log(result.plan === 'free' ? `${email} is now on Free.` : `${email} is on ${result.plan} until ${date(result.until)}.`);
    }
  } finally { target.close(); }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
