import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = await Promise.all(entries.map(entry => entry.isDirectory()
    ? filesIn(join(directory, entry.name)) : [join(directory, entry.name)]));
  return results.flat();
}
const files = (await filesIn('dist')).filter(file => !file.endsWith('sw.js')).sort();
const hash = createHash('sha256');
for (const file of files) {
  hash.update(relative('dist', file).replaceAll('\\', '/'));
  hash.update(await readFile(file));
}
const shell = ['./', ...files.map(file => `./${relative('dist', file).replaceAll('\\', '/')}`)];
const template = await readFile('scripts/service-worker.js', 'utf8');
await writeFile('dist/sw.js', template
  .replace('__CACHE_VERSION__', hash.digest('hex').slice(0, 16))
  .replace('__SHELL_FILES__', JSON.stringify(shell)));
console.log(`Generated offline cache for ${files.length} build assets.`);
