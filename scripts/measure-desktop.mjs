/** Production frontend benchmark; use VITE_E2E_MOCK=1 build for deterministic IPC. */
import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const [directory, output] = process.argv.slice(2);
if (!directory || !output) throw new Error('Usage: node scripts/measure-desktop.mjs <mock-dist> <output.json>');
const root = resolve(directory);
// Precompress before timing so server-side gzip CPU does not skew renderer metrics.
const compressed = new Map();
async function preload(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) await preload(file);
    else compressed.set(file, gzipSync(await readFile(file)));
  }
}
await preload(root);
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = extname(path) ? resolve(root, `.${path}`) : resolve(root, 'index.html');
    if (!file.startsWith(`${root}/`)) { res.writeHead(403).end(); return; }
    const data = compressed.get(file);
    if (!data) { res.writeHead(404).end(); return; }
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  for (const slow of [false, true]) for (const route of ['/', '/clientes']) for (let run = 0; run < 5; run++) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      // The default IPC mock does not install native event callback registration.
      window.__TAURI_INTERNALS__ = {
        transformCallback: () => 0,
        invoke: async command => {
          if (command.startsWith('plugin:event|')) return 0;
          throw new Error(`Unexpected native IPC in benchmark: ${command}`);
        },
      };
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
      localStorage.setItem('autoos_app_mode', 'standard');
      localStorage.setItem('autoos:release-highlights:0.6.0:portal-insumos-perfil', 'seen');
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow ? 4 : 1 });
    if (slow) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 500000, uploadThroughput: 125000 });
    await page.goto(`${origin}${route}`, { waitUntil: 'load' });
    await page.locator('#main-sidebar').waitFor();
    await page.getByRole('status', { name: /Carregando aplicativo/ }).waitFor({ state: 'detached', timeout: 60000 });
    await page.getByRole('heading', { name: route === '/' ? 'Dashboard' : 'Clientes', exact: true }).waitFor();
    const readyMs = await page.evaluate(() => performance.now());
    const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    const timing = await page.evaluate(() => ({ navigation: performance.getEntriesByType('navigation')[0].toJSON(), resources: performance.getEntriesByType('resource').filter(r => /\.(js|css)(\?|$)/.test(r.name)).map(r => ({ name: new URL(r.name).pathname, encodedBytes: r.encodedBodySize, decodedBytes: r.decodedBodySize })) }));
    const target = route === '/' ? 'Clientes' : 'Equipamentos';
    const navigationStart = await page.evaluate(() => performance.now());
    await page.getByRole('navigation').getByRole('link', { name: target, exact: true }).click();
    await page.getByRole('heading', { name: target, exact: true }).waitFor();
    const navigationMs = await page.evaluate(start => performance.now() - start, navigationStart);
    if (process.env.PERF_SCREENSHOT && slow && route === '/clientes' && run === 0) await page.screenshot({ path: process.env.PERF_SCREENSHOT });
    results.push({ slow, route, run, readyMs, navigationMs, scriptingMs: metrics.ScriptDuration * 1000, taskMs: metrics.TaskDuration * 1000, heapBytes: metrics.JSHeapUsedSize, errors, ...timing });
    await context.close();
  }
  await writeFile(output, JSON.stringify({ browser: browser.version(), viewport: '1366x768', runs: 5, slow: 'CPU 4x; 4 Mbps; RTT 100ms; gzip; fresh contexts; reduced motion', results }, null, 2));
  if (results.some(result => result.errors.length)) throw new Error(`Benchmark contains page errors; inspect ${output}`);
} finally { await browser?.close(); server.close(); }
