// Fails when the service worker's PRECACHE_URLS and the files on disk disagree:
// one missing file makes cache.addAll reject, so no client ever gets the update.
// Run: node scripts/check-precache.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const sw = readFileSync('service-worker.js', 'utf8');
const listed = new Set([...sw.split('PRECACHE_URLS')[1].split('];')[0].matchAll(/'\.\/([^']+)'/g)].map(m => m[1]));
listed.delete('index.html');
listed.add('index.html');

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const disk = new Set([
  ...walk('js'), ...walk('css'), 'styles.css', 'manifest.json', 'vendor/Tone.js', 'fonts/fonts.css',
  ...readdirSync('fonts').filter(f => f.endsWith('.woff2')).map(f => `fonts/${f}`),
  ...readdirSync('icons').filter(f => /^icon-\d+\.png$/.test(f)).map(f => `icons/${f}`)
]);

const missing = [...listed].filter(f => f !== '' && !existsSync(f));
const unlisted = [...disk].filter(f => !listed.has(f));
if (missing.length || unlisted.length) {
  if (missing.length) console.error('listed but missing on disk:', missing.join(', '));
  if (unlisted.length) console.error('on disk but not precached:', unlisted.join(', '));
  process.exit(1);
}
console.log(`precache list OK (${listed.size} files)`);
