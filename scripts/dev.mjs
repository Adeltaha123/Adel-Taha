import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env', '--import', 'tsx', '--watch', 'server/index.ts'], { stdio:'inherit', env:process.env }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio:'inherit', env:process.env }),
];
let closing = false;
function close(code = 0) { if (closing) return; closing = true; children.forEach(child => child.kill()); process.exitCode = code; }
children.forEach(child => child.on('exit', code => close(code ?? 0)));
process.on('SIGINT', () => close()); process.on('SIGTERM', () => close());
