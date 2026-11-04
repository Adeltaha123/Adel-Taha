// Deploys My PA to Cloudflare: builds the website for the Worker's own address, then uploads the Worker
// (API + website). Reads CLOUDFLARE_API_TOKEN from .env on this PC; CI passes it as a secret.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export const SITE = 'https://mypa-api.mohamed-tamer.workers.dev';
if (existsSync('.env')) process.loadEnvFile('.env');
const run = (command, args, options = {}) => {
  // npx needs a shell on Windows; Node itself is run directly because its path can contain spaces.
  const result = spawnSync(command, args, { stdio:'inherit', shell:process.platform === 'win32' && command === 'npx', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
// The site is served from the root of the Worker's address and calls the API there (same origin).
const env = { ...process.env, EXPO_PUBLIC_API_URL:SITE };
delete env.EXPO_BASE_URL;
run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist'], { cwd:'mobile', env });
run(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', ...process.argv.slice(2)]);
