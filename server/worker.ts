import type { Hono } from 'hono';
import { d1Db, type D1Database } from './db.js';
import { buildApp, DEFAULT_ORIGINS } from './app.js';

// The API on Cloudflare Workers with D1. Settings come from wrangler.toml [vars] and `wrangler secret put`.
interface Env { DB: D1Database; [setting: string]: unknown }
let app: Hono | undefined;
export default {
  fetch(request: Request, env: Env, ctx: unknown) {
    if (!app) {
      // The shared code reads settings from process.env, as it does under Node.
      for (const [key, value] of Object.entries(env)) if (typeof value === 'string') process.env[key] = value;
      app = buildApp(d1Db(env.DB), { origins: (env.API_ORIGINS as string | undefined)?.split(',').map(o => o.trim()) ?? DEFAULT_ORIGINS });
    }
    return app.fetch(request, env, ctx as never);
  },
};
