// Activates subscriptions by hand until payments are connected (run on the PC that holds the database):
//   npm run plan                              list accounts and their plans
//   npm run plan -- someone@mail.com personal 1   Personal for 1 month (extends a current Personal period)
//   npm run plan -- someone@mail.com team 3        Team for 3 months
//   npm run plan -- someone@mail.com free          back to Free
import { existsSync } from 'node:fs';
import { openDatabase } from '../server/database.js';
import { planOf, setPlan } from '../server/plans.js';
import type { Plan } from '../shared/plans.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const db = openDatabase(process.env.API_DB ?? 'data/my-pa.sqlite');
const date = (ms:number|null) => ms ? new Date(ms).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '';
const [email, plan, months = '1'] = process.argv.slice(2);
try {
  if (!email) {
    const users = db.prepare('SELECT id,email,name FROM users ORDER BY email').all() as { id:string; email:string; name:string }[];
    if (!users.length) console.log('No accounts yet.');
    for (const user of users) {
      const p = planOf(db, user.id);
      console.log(`${user.email.padEnd(36)} ${user.name.padEnd(20)} ${p.active ? `${p.plan} until ${date(p.until)}` : p.plan === 'free' ? 'free' : `${p.plan} (expired ${date(p.until)})`}`);
    }
  } else {
    if (!['free', 'personal', 'team'].includes(plan ?? '')) throw new Error('Choose a plan: free, personal or team.');
    const count = Number(months);
    if (!Number.isInteger(count) || count < 1 || count > 36) throw new Error('Months must be a whole number from 1 to 36.');
    const result = setPlan(db, email, plan as Plan, count);
    console.log(result.plan === 'free' ? `${email} is now on Free.` : `${email} is on ${result.plan} until ${date(result.until)}.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally { db.close(); }
