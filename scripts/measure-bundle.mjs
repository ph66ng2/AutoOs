/** Measure all emitted JS/CSS and the recursive static startup graph, not just entry size. */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, extname, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
const [directory = 'dist', output] = process.argv.slice(2);
const root = resolve(directory);
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)]))).flat();
}
const files = await walk(root);
const sizes = new Map(await Promise.all(files.map(async file => { const data = await readFile(file); return [file, { file: relative(root, file), bytes: data.length, gzipBytes: gzipSync(data).length }]; })));
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const startup = new Set();
async function visit(file) {
  if (startup.has(file)) return;
  startup.add(file);
  if (extname(file) !== '.js') return;
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/\b(?:import|export)\s*(?:[^;"']*?\bfrom\s*)?["'](\.[^"']+)["']/g)) await visit(resolve(dirname(file), match[1]));
}
for (const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) await visit(resolve(root, `.${match[1]}`));
const sum = entries => entries.reduce((a, e) => ({ bytes: a.bytes + e.bytes, gzipBytes: a.gzipBytes + e.gzipBytes }), { bytes: 0, gzipBytes: 0 });
const result = {
  allJs: sum([...sizes].filter(([f]) => extname(f) === '.js').map(([, s]) => s)),
  allCss: sum([...sizes].filter(([f]) => extname(f) === '.css').map(([, s]) => s)),
  startup: sum([...startup].map(f => sizes.get(f))),
  startupFiles: [...startup].map(f => sizes.get(f)),
  assets: [...sizes.values()],
};
if (output) await writeFile(output, JSON.stringify(result, null, 2));
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
