// Starts the API where phones on the same Wi-Fi can reach it, then Expo Go. The mobile app finds
// this API through the Metro host address when mobile/.env uses EXPO_PUBLIC_API_URL=auto.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

// Load .env here rather than with --env-file, which would let its API_HOST=127.0.0.1 win.
if (existsSync('.env')) process.loadEnvFile('.env');
const port = process.env.API_PORT || '3001';
const metroPort = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : '8081';
const lan = Object.values(networkInterfaces()).flat().find(net => net && net.family === 'IPv4' && !net.internal)?.address;

console.log(`\nMy PA API: http://${lan ?? 'YOUR-PC-IP'}:${port}  (open /api/health on the phone to test the connection)`);
if (!process.env.OPENAI_API_KEY?.trim()) console.log('Voice and AI chat are off: add OPENAI_API_KEY to the .env file in the project root, then restart.');

// Expo prints no QR code when its output is not a terminal, so write one for the current address.
if (lan) {
  const url = `exp://${lan}:${metroPort}`;
  try {
    const { toQR } = createRequire(resolve('mobile/node_modules/expo/node_modules/@expo/cli/package.json'))('toqr');
    const data = toQR(url), size = Math.sqrt(data.length);
    let cells = '';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[y*size+x]) cells += `<rect x="${x+4}" y="${y+4}" width="1" height="1"/>`;
    mkdirSync('mobile/.expo', { recursive:true });
    writeFileSync('mobile/.expo/expo-go-qr.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 ${size+8} ${size+8}" shape-rendering="crispEdges"><title>My PA Expo Go: ${url}</title><rect width="100%" height="100%" fill="white"/><g fill="black">${cells}</g></svg>`);
    console.log(`Expo Go: ${url}  (QR code: mobile/.expo/expo-go-qr.svg)\n`);
  } catch { console.log(`Expo Go: ${url}\n`); }
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(process.execPath, ['--import', 'tsx', '--watch', 'server/index.ts'], { stdio:'inherit', env:{ ...process.env, API_HOST:'0.0.0.0', API_PORT:port } }),
  spawn(npm, ['--prefix', 'mobile', 'start', '--', ...process.argv.slice(2)], { stdio:'inherit', env:process.env, shell:process.platform === 'win32' }),
];
let closing = false;
// On Windows kill() stops only the npm shell, leaving Metro holding its port; end the whole tree.
const stop = child => process.platform === 'win32' && child.pid ? spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio:'ignore' }) : child.kill();
function close(code = 0) { if (closing) return; closing = true; children.forEach(stop); process.exitCode = code; }
children.forEach(child => child.on('exit', code => close(code ?? 0)));
process.on('SIGINT', () => close()); process.on('SIGTERM', () => close());
