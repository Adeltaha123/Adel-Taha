// Runs the My PA API on this PC and makes it reachable from the website and phones through a
// free Cloudflare quick tunnel. The tunnel address changes on every start, so it is published to
// the server-address branch (server.json), which the app reads when it opens. Ctrl+C stops both
// and marks the server offline.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Resolver } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { Tunnel, bin, install } from 'cloudflared';
import { currentServerAddress, publishServerAddress } from './server-address.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
// A 24/7 server's address must not be replaced by this PC's temporary tunnel by accident.
const saved = await currentServerAddress();
if (saved?.permanent && !process.argv.includes('--force')) {
  console.error(`The app already uses the 24/7 server at ${saved.api}; running the server on this PC would take its place.`);
  console.error('Use npm run server:online -- --force only if that server is gone.');
  process.exit(1);
}
const port = process.env.API_PORT || '3001';
const local = `http://127.0.0.1:${port}`;
const WEBSITE = 'https://adeltaha123.github.io';
// The website must be an allowed origin even when .env lists only local development addresses.
const origins = [...new Set([...(process.env.API_ORIGINS ?? '').split(','), WEBSITE, 'http://localhost:8081', 'http://127.0.0.1:8081'].map(o => o.trim()).filter(Boolean))];

const wait = ms => new Promise(done => setTimeout(done, ms));
// A new tunnel name does not exist in DNS for its first seconds, and resolvers (Windows included) then
// cache that miss for minutes. So the check waits before its first lookup and uses public resolvers
// rather than the PC's cache.
const resolver = new Resolver(); resolver.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1', '8.8.4.4']);
const lookup = (host, options, done) => resolver.resolve4(host, (error, addresses) =>
  error ? done(error) : options.all ? done(null, addresses.map(address => ({ address, family:4 }))) : done(null, addresses[0], 4));
const get = url => new Promise(resolve => {
  const request = (url.startsWith('https:') ? https : http).get(url, url.startsWith('https:') ? { lookup, timeout:5000 } : { timeout:5000 }, response => { response.resume(); resolve(response.statusCode === 200); });
  request.on('error', () => resolve(false)).on('timeout', () => { request.destroy(); resolve(false); });
});
async function healthy(origin, tries) {
  for (let i = 0; i < tries; i++) {
    if (await get(`${origin}/api/health`)) return true;
    await wait(1000);
  }
  return false;
}
if (!process.env.OPENAI_API_KEY?.trim()) console.log('Voice and AI chat are off: add OPENAI_API_KEY to the .env file in the project root, then restart.');
const api = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { stdio:'inherit',
  env:{ ...process.env, API_HOST:'127.0.0.1', API_PORT:port, API_ORIGINS:origins.join(',') } });
let tunnel, published = false, closing = false;
async function close(code = 0) {
  if (closing) return; closing = true;
  if (published) { try { publishServerAddress(null); console.log('Marked the server offline.'); } catch (e) { console.error('Could not mark the server offline:', e.message); } }
  tunnel?.stop(); api.kill(); process.exit(code);
}
api.on('exit', code => { if (!closing) { console.error('The API stopped.'); void close(code ?? 1); } });
process.on('SIGINT', () => void close()); process.on('SIGTERM', () => void close());

if (!await healthy(local, 30)) { console.error(`The API did not start on ${local}.`); await close(1); }
if (!existsSync(bin)) { console.log('Downloading Cloudflare tunnel…'); await install(bin); }
tunnel = Tunnel.quick(local);
tunnel.on('exit', () => { if (!closing) { console.error('The tunnel stopped.'); void close(1); } });
const connected = new Promise(resolve => tunnel.once('connected', resolve));
const url = await new Promise(resolve => tunnel.once('url', resolve));
await connected;
console.log('Tunnel connected. Checking it from the internet…');
await wait(15000);
if (!await healthy(url, 60)) { console.error(`The tunnel ${url} did not answer. Check the internet connection and try again.`); await close(1); }
try { publishServerAddress(url); published = true; }
catch (e) { console.error(`Could not save the address to GitHub (${e.message}). The app cannot find the server until it is saved.`); await close(1); }
console.log(`\nMy PA server is online at ${url}`);
console.log('The website and phone app find it automatically within a minute. Keep this window open; Ctrl+C stops it.\n');
