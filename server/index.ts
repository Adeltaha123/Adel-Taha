import { createApi } from './app.js';

const app = await createApi({
  databasePath: process.env.API_DB ?? 'data/my-pa.sqlite',
  origins: process.env.API_ORIGINS?.split(',').map(value => value.trim()),
});
const address = await app.listen({ host: process.env.API_HOST ?? '127.0.0.1', port: Number(process.env.API_PORT ?? 3001) });
console.log(`My PA API listening at ${address}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
