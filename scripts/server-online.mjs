// Runs the My PA API on this PC and makes it reachable from the website and phones through a
// free Cloudflare quick tunnel. The tunnel address changes on every start, so it is published to
// the server-address branch (server.json), which the app reads when it opens. Ctrl+C stops both
// and marks the server offline.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Tunnel, bin, install } from 'cloudflared';

if (existsSync('.env')) process.loadEnvFile('.env');
const port = process.env.API_PORT || '3001';
const local = `http://127.0.0.1:${port}`;
const BRANCH = 'server-address';
const WEBSITE = 'https://adeltaha123.github.io';
// The website must be an allowed origin even when .env lists only local development addresses.
const origins = [...new Set([...(process.env.API_ORIGINS ?? '').split(','), WEBSITE, 'http://localhost:8081', 'http://127.0.0.1:8081'].map(o => o.trim()).filter(Boolean))];

const wait = ms => new Promise(done => setTimeout(done, ms));
async function healthy(origin, tries) {
  for (let i = 0; i < tries; i++) {
    try { if ((await fetch(`${origin}/api/health`)).ok) return true; } catch {}
    await wait(1000);
  }
  return false;
}
/** Commits server.json to the server-address branch without touching the working tree or main. */
function publish(api) {
  const git = (args, input) => execFileSync('git', args, { input, encoding:'utf8' }).trim();
  const blob = git(['hash-object', '-w', '--stdin'], JSON.stringify({ api, updated:new Date().toISOString() }) + '\n');
  const tree = git(['mktree'], `100644 blob ${blob}\tserver.json\n`);
  const commit = git(['commit-tree', tree, '-m', api ? 'My PA server is online' : 'My PA server is offline']);
  git(['push', '--force', '--quiet', 'origin', `${commit}:refs/heads/${BRANCH}`]);
}

if (!process.env.OPENAI_API_KEY?.trim()) console.log('Voice and AI chat are off: add OPENAI_API_KEY to the .env file in the project root, then restart.');
const api = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { stdio:'inherit',
  env:{ ...process.env, API_HOST:'127.0.0.1', API_PORT:port, API_ORIGINS:origins.join(',') } });
let tunnel, published = false, closing = false;
async function close(code = 0) {
  if (closing) return; closing = true;
  if (published) { try { publish(null); console.log('Marked the server offline.'); } catch (e) { console.error('Could not mark the server offline:', e.message); } }
  tunnel?.stop(); api.kill(); process.exit(code);
}
api.on('exit', code => { if (!closing) { console.error('The API stopped.'); void close(code ?? 1); } });
process.on('SIGINT', () => void close()); process.on('SIGTERM', () => void close());

if (!await healthy(local, 30)) { console.error(`The API did not start on ${local}.`); await close(1); }
if (!existsSync(bin)) { console.log('Downloading Cloudflare tunnel…'); await install(bin); }
tunnel = Tunnel.quick(local);
tunnel.on('exit', () => { if (!closing) { console.error('The tunnel stopped.'); void close(1); } });
const url = await new Promise(resolve => tunnel.once('url', resolve));
// A new quick-tunnel name can take a few seconds before it resolves.
if (!await healthy(url, 60)) { console.error(`The tunnel ${url} did not answer. Check the internet connection and try again.`); await close(1); }
try { publish(url); published = true; }
catch (e) { console.error(`Could not save the address to GitHub (${e.message}). The app cannot find the server until it is saved.`); await close(1); }
console.log(`\nMy PA server is online at ${url}`);
console.log('The website and phone app find it automatically within a minute. Keep this window open; Ctrl+C stops it.\n');
