// Saves where the app finds its API: server.json on the server-address branch, which the website (and any app
// build without a fixed EXPO_PUBLIC_API_URL) reads when it opens.
//   npm run server:address -- https://1-2-3-4.sslip.io   the 24/7 server (permanent)
//   npm run server:address                               show the current address
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BRANCH = 'server-address';
const RAW = `https://raw.githubusercontent.com/Adeltaha123/Adel-Taha/${BRANCH}/server.json`;
const git = (args, input) => execFileSync('git', args, { input, encoding:'utf8' }).trim();

/** Commits server.json to the server-address branch without touching the working tree or main. */
export function publishServerAddress(api, permanent = false) {
  const blob = git(['hash-object', '-w', '--stdin'], JSON.stringify({ api, permanent, updated:new Date().toISOString() }) + '\n');
  const tree = git(['mktree'], `100644 blob ${blob}\tserver.json\n`);
  const commit = git(['commit-tree', tree, '-m', api ? `My PA server: ${api}` : 'My PA server is offline']);
  git(['push', '--force', '--quiet', 'origin', `${commit}:refs/heads/${BRANCH}`]);
}
export async function currentServerAddress() {
  try { const response = await fetch(`${RAW}?t=${Date.now()}`, { cache:'no-store' }); return response.ok ? await response.json() : null; } catch { return null; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.argv[2]?.replace(/\/$/, '');
  if (!url) {
    const current = await currentServerAddress();
    console.log(current?.api ? `The app uses ${current.api}${current.permanent ? ' (24/7 server)' : ' (this PC, through a temporary tunnel)'}.` : 'No server address is saved.');
  } else {
    if (!/^https:\/\/[a-z0-9.-]+$/i.test(url)) { console.error('Give the server address as https://… (no /api).'); process.exit(1); }
    const health = await fetch(`${url}/api/health`).then(r => r.ok, () => false);
    if (!health) { console.error(`${url}/api/health does not answer. Check that the server is running.`); process.exit(1); }
    publishServerAddress(url, true);
    console.log(`Saved. The website and app will use ${url} within a minute.`);
  }
}
