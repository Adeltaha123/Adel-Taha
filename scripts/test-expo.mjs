import { spawnSync } from 'node:child_process';
// Build a separate web preview with the disposable API used by Playwright.
const env = { ...process.env, NODE_OPTIONS:process.env.NODE_OPTIONS ?? '--max-old-space-size=256', EXPO_PUBLIC_API_URL:'http://127.0.0.1:3012' };
const steps = [
  ['mobile/node_modules/expo/bin/cli',['export','--platform','web','--no-minify','--output-dir','dist'], 'mobile'],
  ['node_modules/@playwright/test/cli.js',['test','-c','playwright.expo.config.ts'], '.'],
];
for (const [cli,args,cwd] of steps) {
  const { resolve } = await import('node:path');
  const result = spawnSync(process.execPath,[resolve(cli),...args],{ cwd,env,stdio:'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
