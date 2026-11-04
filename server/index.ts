import { serve } from '@hono/node-server';
import { createApi } from './node.js';

// The API under Node (a PC or VPS). Cloudflare runs the same app from worker.ts.
const api = await createApi({
  databasePath: process.env.API_DB ?? 'data/my-pa.sqlite',
  origins: process.env.API_ORIGINS?.split(',').map(value => value.trim()),
  // Browser tests sign up many accounts from one address; only their test server turns the limits off.
  rateLimit: process.env.API_RATE_LIMIT !== 'off',
});
const hostname = process.env.API_HOST ?? '127.0.0.1', port = Number(process.env.API_PORT ?? 3001);
const server = serve({ fetch: api.fetch, hostname, port }, info => console.log(`My PA API listening at http://${info.address}:${info.port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { server.close(); void api.close().then(() => process.exit(0)); });
